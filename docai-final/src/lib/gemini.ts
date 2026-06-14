/**
 * gemini.ts — IA central
 *
 * EMBEDDINGS: Cohere embed-multilingual-v3.0 (1024 dims, gratis, estable)
 * CHAT:       Groq llama-3.3-70b-versatile (gratis, estable)
 *
 * Sin Gemini. Sin límites de cuota para producción.
 */

if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY no configurada");
if (!process.env.COHERE_API_KEY) throw new Error("COHERE_API_KEY no configurada");

const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const COHERE_API_KEY = process.env.COHERE_API_KEY!;

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const COHERE_EMBED_URL = "https://api.cohere.com/v2/embed";
const CHAT_MODEL = "llama-3.3-70b-versatile";
const EMBED_MODEL = "embed-multilingual-v3.0";
const BATCH_SIZE = 96; // Cohere permite hasta 96 textos por request
const MAX_TEXT_CHARS = 6000;
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("429") || msg.includes("503") || msg.includes("rate") || msg.includes("network");
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.warn(`[ai] ${label} intento ${i}/${MAX_RETRIES}: ${err instanceof Error ? err.message : err}`);
      if (i < MAX_RETRIES && isRetryable(err)) await sleep(1500 * i);
      else if (!isRetryable(err)) throw err;
    }
  }
  throw lastErr;
}

// ─── EMBEDDINGS — Cohere ──────────────────────────────────────
async function cohereEmbed(texts: string[], inputType: "search_document" | "search_query"): Promise<number[][]> {
  const res = await fetch(COHERE_EMBED_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${COHERE_API_KEY}`,
      "X-Client-Name": "Orbit-escolar",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      texts: texts.map((t) => t.slice(0, MAX_TEXT_CHARS)),
      input_type: inputType,
      embedding_types: ["float"],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cohere embeddings [${res.status}]: ${err}`);
  }

  const data = (await res.json()) as {
    embeddings: { float: number[][] };
  };

  const embeddings = data.embeddings?.float;
  if (!embeddings?.length) throw new Error("Cohere devolvió embeddings vacíos");

  console.log(`[ai] Cohere embeddings: ${embeddings.length} vectores, dim=${embeddings[0].length}`);
  return embeddings;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  return withRetry(async () => {
    const result = await cohereEmbed([text], "search_query");
    return result[0];
  }, "generateEmbedding");
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const all: number[][] = [];
  const total = Math.ceil(texts.length / BATCH_SIZE);

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`[ai] embedding batch ${batchNum}/${total} (${batch.length} textos)`);

    const result = await withRetry(
      () => cohereEmbed(batch, "search_document"),
      `batch ${batchNum}/${total}`
    );
    all.push(...result);
    if (i + BATCH_SIZE < texts.length) await sleep(300);
  }

  return all;
}

// ─── CHAT — Groq ─────────────────────────────────────────────
export async function answerWithContext(
  question: string,
  contextChunks: Array<{ text: string; docName: string; page: number }>,
  conversationHistory: Array<{ role: "user" | "model"; text: string }>
): Promise<string> {
  const MAX_CONTEXT = 10000;
  let total = 0;
  const chunks = contextChunks.filter((c) => {
    if (total + c.text.length > MAX_CONTEXT) return false;
    total += c.text.length;
    return true;
  });

  const contextText = chunks
    .map((c, i) => `[Fragmento ${i + 1} — "${c.docName}", página ${c.page}]\n${c.text}`)
    .join("\n\n---\n\n");

  const systemPrompt = `Eres un asistente educativo. Responde SOLO con información de los fragmentos dados.
Si la respuesta no está en los documentos, di: "No encontré esa información en los documentos."
Cita siempre la fuente. Responde en español. Nunca inventes información.

FRAGMENTOS:
${contextText}`;

  const history = conversationHistory.slice(-6).map((m) => ({
    role: m.role === "model" ? "assistant" : "user",
    content: m.text,
  }));

  return withRetry(async () => {
    const res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: question },
        ],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq chat [${res.status}]: ${err}`);
    }

    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Groq devolvió respuesta vacía");
    return text;
  }, "answerWithContext");
}

