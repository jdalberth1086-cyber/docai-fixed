/**
 * /api/tareas/historial/route.ts
 * Historial de tareas de un estudiante por número de documento.
 * NO requiere login — el estudiante consulta con su documento.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documento = searchParams.get("documento")?.trim();

    if (!documento || documento.length < 4) {
      return NextResponse.json(
        { error: "Número de documento requerido (mínimo 4 caracteres)" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data: tareas, error } = await admin
      .from("tareas")
      .select(
        "id, estudiante_nombre, materia, descripcion, original_name, file_size, status, recibido_en, comentario_admin, created_at"
      )
      .eq("estudiante_documento", documento)
      .order("recibido_en", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[tareas/historial] DB error:", error);
      throw new Error(error.message);
    }

    return NextResponse.json({
      tareas: tareas ?? [],
      total: tareas?.length ?? 0,
      documento,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[tareas/historial] ERROR:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

