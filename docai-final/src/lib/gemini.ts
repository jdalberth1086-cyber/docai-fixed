/**
 * gemini.ts — Mantiene los mismos exports pero usa Cohere + Groq
 * - Embeddings: Cohere embed-multilingual-v3.0 → 1024 dimensiones
 * - Chat: Groq llama-3.3-70b-versatile
 */

// ── COHERE — Embeddings ────────────────────────────────────────────────────
const COHERE_API_KEY = process.env.COHERE_API_KEY!;
const COHERE_MODEL = "embed-multilingual-v3.0";

export async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.cohere.com/v1/embed", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${COHERE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: COHERE_MODEL,
      texts: [text.slice(0, 2048)],
      input_type: "search_query",
      embedding_types: ["float"],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cohere embed error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const embedding: number[] = data?.embeddings?.float?.[0];
  if (!embedding || embedding.length === 0) {
    throw new Error("Cohere devolvió embedding vacío");
  }
  return embedding;
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  // Cohere acepta hasta 96 textos por request
  const BATCH = 90;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH).map((t) => t.slice(0, 2048));

    const res = await fetch("https://api.cohere.com/v1/embed", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${COHERE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: COHERE_MODEL,
        texts: batch,
        input_type: "search_document",
        embedding_types: ["float"],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Cohere batch embed error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const embeddings: number[][] = data?.embeddings?.float;
    if (!embeddings || embeddings.length === 0) {
      throw new Error(`Cohere batch devolvió embeddings vacíos para batch ${i / BATCH + 1}`);
    }
    results.push(...embeddings);
  }

  return results;
}

// ── GROQ — Chat ────────────────────────────────────────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const GROQ_MODEL = "llama-3.3-70b-versatile";

export async function answerWithContext(
  question: string,
  contextChunks: Array<{ text: string; docName: string; page: number }>,
  conversationHistory: Array<{ role: "user" | "model"; text: string }>
): Promise<string> {
  const contextText = contextChunks
    .map((c, i) => `[Fuente ${i + 1} — "${c.docName}", página ${c.page}]\n${c.text}`)
    .join("\n\n---\n\n");

  const systemPrompt = `Eres un asistente de documentación. Responde SOLO con información de estos documentos. Si la respuesta no está en los documentos, dilo claramente.

Documentos disponibles:
${contextText}`;

  // Convertir historial: "model" → "assistant" para Groq
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map((m) => ({
      role: m.role === "model" ? "assistant" : "user",
      content: m.text,
    })),
    { role: "user", content: question },
  ];

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq chat error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const answer = data?.choices?.[0]?.message?.content;
  if (!answer) {
    throw new Error("Groq devolvió respuesta vacía");
  }
  return answer;
}
