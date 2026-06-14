/**
 * /api/tareas/update/route.ts
 * Actualiza estado y comentario de una tarea (solo admin autenticado).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES = ["recibido", "revisado", "devuelto"];

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { tareaId, status, comentario } = body as Record<string, string>;

    if (!tareaId || !UUID_REGEX.test(tareaId)) {
      return NextResponse.json({ error: "tareaId inválido" }, { status: 400 });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Status inválido. Opciones: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      revisado_por: user.id,
    };
    if (status) updates.status = status;
    if (typeof comentario === "string") updates.comentario_admin = comentario.trim();

    const { data, error } = await admin
      .from("tareas")
      .update(updates)
      .eq("id", tareaId)
      .select()
      .single();

    if (error) {
      console.error("[tareas/update] DB error:", error);
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, tarea: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[tareas/update] ERROR:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

