/**
 * pdf-processor.ts — Procesador robusto de PDFs para producción
 *
 * FIXES aplicados:
 * 1. Dynamic import para evitar crash de pdf-parse en Next.js (ENOENT test-file bug)
 * 2. Chunk size aumentado a 1200 chars + overlap 200 para mejor contexto semántico
 * 3. Normalización de texto: elimina caracteres de control, espacios múltiples
 * 4. Guard para PDFs con pageCount=0 pero texto extraíble (algunos PDFs lo reportan mal)
 * 5. Límite de 800 chunks para evitar timeout en Vercel (PDFs enormes)
 * 6. Mejor split por páginas con fallback robusto
 */
import type { PdfChunk } from "./pdf-processor-types";
export type { PdfChunk };

const CHUNK_SIZE = 1200;       // Aumentado: más contexto por chunk
const CHUNK_OVERLAP = 200;     // Overlap para no cortar ideas
const MIN_CHUNK_CHARS = 80;    // Mínimo para que valga la pena vectorizar
const MAX_CHUNKS = 800;        // Límite duro para no explotar Vercel 60s

/**
 * Extrae texto de un PDF y lo divide en chunks con metadatos de página.
 * Usa dynamic import para evitar el crash ENOENT de pdf-parse en Next.js.
 */
export async function extractAndChunkPdf(
  buffer: Buffer
): Promise<{ chunks: PdfChunk[]; pageCount: number }> {
  // FIX: dynamic import evita que pdf-parse intente leer test fixtures al cargar el módulo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pdfParse: (buf: Buffer, options?: Record<string, unknown>) => Promise<any>;
  try {
    const mod = await import("pdf-parse");
    pdfParse = mod.default ?? mod;
  } catch (importErr) {
    throw new Error(`No se pudo cargar pdf-parse: ${importErr instanceof Error ? importErr.message : String(importErr)}`);
  }

  let data: { numpages: number; text: string };
  try {
    // FIX: Pasar opciones explícitas evita que pdf-parse lea archivos de test del sistema
    data = await pdfParse(buffer, { max: 0 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // FIX: Mensaje de error más específico para diagnóstico
    if (msg.includes("ENOENT") || msg.includes("test/data")) {
      throw new Error(
        "Error de configuración de pdf-parse. Verifica que next.config.js tenga serverComponentsExternalPackages: ['pdf-parse']"
      );
    }
    throw new Error(`Error al leer el PDF: ${msg}`);
  }

  // FIX: Algunos PDFs reportan numpages=0 pero tienen texto — usar 1 como fallback
  const pageCount = data.numpages > 0 ? data.numpages : 1;

  const rawText = data.text ?? "";

  // FIX: Normalizar texto antes de procesar (elimina chars de control, espacios múltiples)
  const fullText = normalizeText(rawText);

  if (!fullText.trim()) {
    throw new Error(
      "No se pudo extraer texto del PDF. El archivo puede ser una imagen escaneada sin OCR o estar protegido con contraseña."
    );
  }

  console.log(`[pdf-processor] ${pageCount} págs, ${fullText.length} chars extraídos`);

  const pages = splitIntoPages(fullText, pageCount);
  const chunks: PdfChunk[] = [];
  let globalChunkIndex = 0;

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageText = pages[pageIdx].trim();
    if (!pageText) continue;

    // FIX: Guard de límite para PDFs enormes (evita timeout en Vercel)
    if (globalChunkIndex >= MAX_CHUNKS) {
      console.warn(`[pdf-processor] Límite de ${MAX_CHUNKS} chunks alcanzado en página ${pageIdx + 1}/${pages.length}. PDF muy grande.`);
      break;
    }

    const pageChunks = chunkText(pageText, CHUNK_SIZE, CHUNK_OVERLAP);

    for (const text of pageChunks) {
      if (globalChunkIndex >= MAX_CHUNKS) break;
      const trimmed = text.trim();
      if (trimmed.length < MIN_CHUNK_CHARS) continue;
      chunks.push({
        text: trimmed,
        pageNumber: pageIdx + 1,
        chunkIndex: globalChunkIndex++,
      });
    }
  }

  if (chunks.length === 0) {
    throw new Error(
      "No se generaron fragmentos de texto válidos. Verifica que el PDF tenga texto seleccionable y no esté protegido."
    );
  }

  console.log(`[pdf-processor] Generados ${chunks.length} chunks`);
  return { chunks, pageCount };
}

/**
 * Normaliza el texto extraído del PDF:
 * - Elimina caracteres de control (excepto saltos de línea y tabulaciones)
 * - Colapsa espacios múltiples en uno
 * - Elimina líneas que son solo espacios
 */
function normalizeText(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ") // chars de control (no \n, \t)
    .replace(/[ \t]{3,}/g, "  ")                          // espacios excesivos → 2
    .replace(/\n{4,}/g, "\n\n\n")                         // saltos excesivos → 3
    .trim();
}

/**
 * Divide el texto completo en páginas.
 * Estrategia 1: form-feed (\f) — la mayoría de los PDF renderers lo emiten entre páginas
 * Estrategia 2: si hay suficientes saltos de sección
 * Estrategia 3: división uniforme por caracteres
 */
function splitIntoPages(fullText: string, pageCount: number): string[] {
  // Intento 1: form-feed
  const ffPages = fullText.split("\f");
  if (ffPages.length >= Math.max(2, Math.floor(pageCount * 0.7))) {
    return ffPages;
  }

  // Intento 2: múltiples saltos de línea como separadores de sección
  const sectionPages = fullText.split(/\n{3,}/);
  if (sectionPages.length >= Math.floor(pageCount * 0.5) && pageCount > 3) {
    return sectionPages;
  }

  // Fallback: división uniforme
  const charsPerPage = Math.ceil(fullText.length / pageCount);
  const pages: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    pages.push(fullText.slice(i * charsPerPage, (i + 1) * charsPerPage));
  }
  return pages;
}

/**
 * Divide un texto en chunks con overlap, buscando cortes naturales.
 */
function chunkText(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + size;

    if (end < text.length) {
      const naturalEnd = findNaturalBreak(text, end);
      if (naturalEnd > start + size * 0.5) {
        end = naturalEnd;
      }
    }

    const chunk = text.slice(start, end);
    if (chunk.trim()) {
      chunks.push(chunk);
    }

    start = end - overlap;
    if (start <= 0 || start >= text.length) break;
  }

  return chunks;
}

/**
 * Busca un punto de corte natural (punto final, salto de línea) cerca de `pos`.
 */
function findNaturalBreak(text: string, pos: number): number {
  const windowSize = 150;
  const searchStart = Math.max(0, pos - windowSize);
  const searchEnd = Math.min(text.length, pos + windowSize);
  const segment = text.slice(searchStart, searchEnd);
  const offset = pos - searchStart;

  // Prioridad: párrafo > oración > línea
  const paraIdx = segment.lastIndexOf("\n\n", offset);
  if (paraIdx > windowSize * 0.3) return searchStart + paraIdx + 2;

  const dotIdx = segment.lastIndexOf(". ", offset);
  if (dotIdx > windowSize * 0.2) return searchStart + dotIdx + 2;

  const nlIdx = segment.lastIndexOf("\n", offset);
  if (nlIdx > windowSize * 0.2) return searchStart + nlIdx + 1;

  return pos;
}

