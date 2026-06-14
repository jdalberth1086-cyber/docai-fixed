/**
 * /api/chat/route.ts
 *
 * FIXES aplicados:
 * 1. export const runtime = "nodejs" — consistencia con process route
 * 2. Validación de sessionId con UUID regex (evita SQL injection y errores)
 * 3. Historial de conversación aumentado a 20 mensajes (era 10) para mejor contexto
 * 4. topK aumentado a 6 para mejor calidad de respuestas
 * 5. Guard cuando no hay documentos 'ready' — mensaje útil para el usuario
 * 6. Admin client creado una sola vez
 * 7. Mejor manejo de errores con logging detallado
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase-server";
import { generateEmbedding, answerWithContext } from "@/lib/gemini";
import { querySimilarChunks } from "@/lib/pinecone";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_QUESTION_LENGTH = 2000;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  // FIX: Admin client una sola vez
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

    // ── Validate body ──────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }

    const b = body as Record<string, unknown>;

    const question =
      typeof b?.question === "string" ? b.question.trim() : "";

    // FIX: Validar sessionId con UUID regex para evitar errores en Supabase
    const rawSessionId =
      typeof b?.sessionId === "string" ? b.sessionId.trim() : null;
    const sessionId =
      rawSessionId && UUID_REGEX.test(rawSessionId) ? rawSessionId : null;

    if (!question) {
      return NextResponse.json({ error: "Pregunta vacía" }, { status: 400 });
    }
    if (question.length > MAX_QUESTION_LENGTH) {
      return NextResponse.json(
        { error: "La pregunta es demasiado larga (máx. 2000 caracteres)" },
        { status: 400 }
      );
    }

    // ── FIX: Verificar que el usuario tenga documentos listos ────────────
    const { count: readyCount } = await admin
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "ready");

    if (!readyCount || readyCount === 0) {
      const noDocsAnswer =
        "No tienes documentos listos para consultar. Sube y procesa al menos un PDF en la sección Documentos antes de hacer preguntas.";

      let currentSessionId = sessionId;
      if (!currentSessionId) {
        const title = question.slice(0, 60) + (question.length > 60 ? "…" : "");
        const { data: session } = await admin
          .from("chat_sessions")
          .insert({ user_id: user.id, title })
          .select()
          .single();
        currentSessionId = session?.id ?? null;
      }

      if (currentSessionId) {
        await admin.from("chat_messages").insert([
          { session_id: currentSessionId, user_id: user.id, role: "user", content: question },
          { session_id: currentSessionId, user_id: user.id, role: "assistant", content: noDocsAnswer, references: [] },
        ]);
      }

      return NextResponse.json({
        answer: noDocsAnswer,
        sessionId: currentSessionId,
        references: [],
      });
    }

    // ── Get or create chat session ─────────────────────────────────────────
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      const title = question.slice(0, 60) + (question.length > 60 ? "…" : "");
      const { data: session, error: sessionErr } = await admin
        .from("chat_sessions")
        .insert({ user_id: user.id, title })
        .select()
        .single();

      if (sessionErr || !session) {
        console.error("[chat] session create error:", sessionErr);
        throw new Error("Error al crear sesión de chat");
      }
      currentSessionId = session.id;
    }

    // ── Get conversation history (last 20 messages = 10 turns) ───────────
    // FIX: Aumentado de 10 a 20 mensajes para mejor contexto
    const { data: history } = await admin
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", currentSessionId)
      .order("created_at", { ascending: true })
      .limit(20);

    const conversationHistory = (history ?? []).map((m) => ({
      role: m.role as "user" | "model",
      text: m.content as string,
    }));

    // ── Persist user message ───────────────────────────────────────────────
    await admin.from("chat_messages").insert({
      session_id: currentSessionId,
      user_id: user.id,
      role: "user",
      content: question,
    });

    // ── Semantic search ────────────────────────────────────────────────────
    console.log(`[chat] Generando embedding para pregunta: "${question.slice(0, 50)}…"`);
    const queryEmbedding = await generateEmbedding(question);

    // FIX: topK=6 para más contexto (era 5)
    const similarChunks = await querySimilarChunks(queryEmbedding, user.id, 6);
    console.log(`[chat] Chunks recuperados: ${similarChunks.length}`);

    if (similarChunks.length === 0) {
      const noResultsAnswer =
        "No encontré información relevante en tus documentos para responder esta pregunta. Intenta reformular la pregunta o verifica que los documentos relacionados estén procesados.";

      await admin.from("chat_messages").insert({
        session_id: currentSessionId,
        user_id: user.id,
        role: "assistant",
        content: noResultsAnswer,
        references: [],
      });

      return NextResponse.json({
        answer: noResultsAnswer,
        sessionId: currentSessionId,
        references: [],
      });
    }

    // ── Build context and generate answer ──────────────────────────────────
    const contextChunks = similarChunks.map((c) => ({
      // FIX: Usar chunk_text completo de la metadata (500 chars) para mejor contexto
      text: c.metadata.chunkText,
      docName: c.metadata.docName,
      page: c.metadata.pageNumber,
    }));

    console.log(`[chat] Generando respuesta con ${contextChunks.length} fragmentos de contexto`);
    const answer = await answerWithContext(
      question,
      contextChunks,
      conversationHistory
    );

    const references = similarChunks.map((c) => ({
      document_id: c.metadata.documentId,
      doc_name: c.metadata.docName,
      page: c.metadata.pageNumber,
      chunk_text: c.metadata.chunkText,
      score: Math.round(c.score * 100) / 100,
    }));

    // ── Persist assistant message ──────────────────────────────────────────
    await admin.from("chat_messages").insert({
      session_id: currentSessionId,
      user_id: user.id,
      role: "assistant",
      content: answer,
      references,
    });

    // ── Update session timestamp ───────────────────────────────────────────
    await admin
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", currentSessionId);

    return NextResponse.json({
      answer,
      sessionId: currentSessionId,
      references,
    });
  } catch (err: unknown) {
    console.error("[chat] error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Error interno del servidor al procesar tu pregunta",
      },
      { status: 500 }
    );
  }
}

