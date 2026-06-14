/**
 * /api/tareas/list/route.ts
 * Lista tareas para el administrador con búsqueda por nombre o documento.
 * Requiere autenticación (admin).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const busqueda = searchParams.get("q")?.trim() ?? "";
    const materia = searchParams.get("materia")?.trim() ?? "";
    const status = searchParams.get("status")?.trim() ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(50, parseInt(searchParams.get("limit") ?? "20"));
    const offset = (page - 1) * limit;

    const admin = createAdminClient();
    let query = admin
      .from("tareas")
      .select("*", { count: "exact" })
      .order("recibido_en", { ascending: false })
      .range(offset, offset + limit - 1);

    if (busqueda) {
      // Buscar por nombre O por documento
      query = query.or(
        `estudiante_nombre.ilike.%${busqueda}%,estudiante_documento.ilike.%${busqueda}%`
      );
    }
    if (materia) {
      query = query.ilike("materia", `%${materia}%`);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data: tareas, error, count } = await query;

    if (error) {
      console.error("[tareas/list] DB error:", error);
      throw new Error(error.message);
    }

    return NextResponse.json({
      tareas: tareas ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[tareas/list] ERROR:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

