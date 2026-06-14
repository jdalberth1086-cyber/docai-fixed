/**
 * /api/documents/delete-vectors/route.ts
 * FIX: Ahora pasa pineconeIds desde Supabase para borrado limpio en Pinecone v4
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase-server";
import { deleteDocumentVectors } from "@/lib/pinecone";

export const runtime = "nodejs";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const documentId =
      typeof body?.documentId === "string" ? body.documentId.trim() : null;

    if (!documentId || !UUID_REGEX.test(documentId)) {
      return NextResponse.json(
        { error: "documentId inválido" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Verificar ownership
    const { data: doc } = await admin
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (!doc) {
      return NextResponse.json(
        { error: "Documento no encontrado" },
        { status: 404 }
      );
    }

    // FIX: Obtener los pinecone_ids desde Supabase para borrado limpio
    const { data: chunks } = await admin
      .from("document_chunks")
      .select("pinecone_id")
      .eq("document_id", documentId);

    const pineconeIds = (chunks ?? []).map((c: { pinecone_id: string }) => c.pinecone_id).filter(Boolean);

    console.log(
      `[delete-vectors] Borrando ${pineconeIds.length} vectores de documentId=${documentId}`
    );

    await deleteDocumentVectors(documentId, user.id, pineconeIds);

    return NextResponse.json({ success: true, vectorsDeleted: pineconeIds.length });
  } catch (err: unknown) {
    console.error("[delete-vectors]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    );
  }
}

