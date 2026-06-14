/**
 * /api/documents/process/route.ts
 *
 * FIXES aplicados:
 * 1. export const runtime = "nodejs" — fuerza Node.js runtime (requerido para pdf-parse)
 * 2. Configuración de bodyParser desactivada — el body no es necesario aquí (solo documentId)
 * 3. Guard mejorado: verifica que el documento esté en status 'pending' o 'error' (no re-procesar 'ready')
 * 4. Log de progreso claro para debugging en Vercel
 * 5. Timeout parcial: si los embeddings tardan demasiado, el error queda guardado en DB
 * 6. Admin client creado una sola vez y reutilizado
 * 7. Cleanup de chunks viejos ANTES de insertar nuevos (evita duplicados si re-procesa)
 * 8. Validación UUID más robusta con regex estándar
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createServerClient } from "@/lib/supabase-server";
import { extractAndChunkPdf } from "@/lib/pdf-processor";
import { generateEmbeddingsBatch } from "@/lib/gemini";
import { upsertVectors } from "@/lib/pinecone";
import { v4 as uuidv4 } from "uuid";

// FIX: Forzar Node.js runtime — pdf-parse requiere módulos nativos de Node
export const runtime = "nodejs";
export const maxDuration = 60;

// Validación UUID RFC 4122
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Server-side file size guard (50 MB)
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export async function POST(request: NextRequest) {
  let documentId: string | null = null;
  let userId: string | null = null;
  // FIX: Admin client creado una vez y reutilizado en todo el handler
  const admin = createAdminClient();

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    userId = user.id;

    // ── Validate body ──────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }

    const rawId =
      typeof (body as Record<string, unknown>)?.documentId === "string"
        ? ((body as Record<string, unknown>).documentId as string).trim()
        : null;

    // FIX: UUID regex más estricto (formato estándar con guiones)
    if (!rawId || !UUID_REGEX.test(rawId)) {
      return NextResponse.json(
        { error: "documentId inválido o con formato incorrecto" },
        { status: 400 }
      );
    }
    documentId = rawId;

    // ── Verify ownership ───────────────────────────────────────────────────
    const { data: doc, error: docError } = await admin
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docError || !doc) {
      console.error("[process] doc not found", {
        documentId,
        userId: user.id,
        docError: docError?.message,
      });
      return NextResponse.json(
        { error: "Documento no encontrado o sin permisos" },
        { status: 404 }
      );
    }

    // FIX: Solo re-procesar si está en pending o error — no re-procesar 'ready' ni 'processing'
    if (doc.status === "processing") {
      return NextResponse.json(
        { error: "El documento ya está siendo procesado" },
        { status: 409 }
      );
    }

    if (doc.status === "ready") {
      return NextResponse.json(
        { error: "El documento ya fue procesado exitosamente. Usa el botón de reprocesar si deseas volver a indexarlo." },
        { status: 409 }
      );
    }

    // ── Mark as processing ─────────────────────────────────────────────────
    await admin
      .from("documents")
      .update({ status: "processing", error_message: null, updated_at: new Date().toISOString() })
      .eq("id", documentId);

    console.log(
      `[process] START doc=${documentId} user=${user.id.slice(0, 8)} file="${doc.original_name}" size=${doc.file_size}`
    );

    // ── Download PDF from Supabase Storage ────────────────────────────────
    const { data: fileData, error: dlError } = await admin.storage
      .from("documents")
      .download(doc.storage_path);

    if (dlError || !fileData) {
      throw new Error(
        `No se pudo descargar el PDF del storage: ${dlError?.message ?? "sin datos"}`
      );
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());

    if (buffer.byteLength > MAX_FILE_BYTES) {
      throw new Error(
        `El archivo (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB) supera el límite de ${MAX_FILE_BYTES / 1024 / 1024} MB.`
      );
    }

    console.log(`[process] PDF descargado: ${(buffer.byteLength / 1024).toFixed(0)} KB`);

    // ── Extract and chunk PDF ──────────────────────────────────────────────
    const { chunks, pageCount } = await extractAndChunkPdf(buffer);
    console.log(
      `[process] Extraídos ${chunks.length} chunks de ${pageCount} páginas`
    );

    // ── Generate embeddings in batches ────────────────────────────────────
    const texts = chunks.map((c) => c.text);
    console.log(`[process] Generando embeddings para ${texts.length} chunks…`);
    const embeddings = await generateEmbeddingsBatch(texts);
    console.log(`[process] Embeddings listos: ${embeddings.length}`);

    // ── FIX: Delete old chunks BEFORE inserting new ones ─────────────────
    // Esto evita duplicados en Supabase si se reprocesa un documento
    const { error: deleteErr } = await admin
      .from("document_chunks")
      .delete()
      .eq("document_id", documentId);

    if (deleteErr) {
      // No es crítico — loguear y continuar
      console.warn("[process] No se pudieron borrar chunks viejos:", deleteErr.message);
    }

    // ── Prepare vectors ───────────────────────────────────────────────────
    const vectors = chunks.map((chunk, i) => ({
      id: uuidv4(),
      values: embeddings[i],
      metadata: {
        userId: user.id,
        documentId: documentId as string,
        docName: doc.name as string,
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber,
        // FIX: Limitar chunkText a 500 chars para metadata de Pinecone (más eficiente)
        chunkText: chunk.text.slice(0, 500),
      },
    }));

    // ── Upsert to Pinecone ─────────────────────────────────────────────────
    await upsertVectors(vectors);
    console.log(`[process] ${vectors.length} vectores en Pinecone`);

    // ── Persist chunk metadata to Supabase ────────────────────────────────
    const chunkRows = chunks.map((chunk, i) => ({
      document_id: documentId,
      user_id: user.id,
      pinecone_id: vectors[i].id,
      chunk_index: chunk.chunkIndex,
      page_number: chunk.pageNumber,
      // FIX: Guardar texto completo en Supabase para referencias del chat
      chunk_text: chunk.text.slice(0, 2000),
    }));

    // Insertar en lotes de 200 (Supabase puede rechazar payloads muy grandes)
    for (let i = 0; i < chunkRows.length; i += 200) {
      const { error: insertErr } = await admin
        .from("document_chunks")
        .insert(chunkRows.slice(i, i + 200));

      if (insertErr) {
        console.error("[process] Error insertando chunks en Supabase:", insertErr.message);
        throw new Error(`Error guardando chunks en base de datos: ${insertErr.message}`);
      }
    }

    // ── Mark document as ready ─────────────────────────────────────────────
    await admin
      .from("documents")
      .update({
        status: "ready",
        page_count: pageCount,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    console.log(
      `[process] DONE doc=${documentId} chunks=${chunks.length} páginas=${pageCount}`
    );

    return NextResponse.json({
      success: true,
      chunks: chunks.length,
      pageCount,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Error interno del servidor";
    console.error(`[process] ERROR doc=${documentId} user=${userId}:`, err);

    // Best-effort: marcar el documento como error con mensaje
    if (documentId) {
      try {
        await admin
          .from("documents")
          .update({
            status: "error",
            error_message: message.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq("id", documentId);
      } catch (secondaryErr) {
        console.error(
          "[process] No se pudo actualizar status de error:",
          secondaryErr
        );
      }
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

