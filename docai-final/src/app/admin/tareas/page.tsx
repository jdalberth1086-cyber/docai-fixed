/**
 * /app/admin/tareas/page.tsx
 * Panel de administración de tareas para la profesora.
 * Requiere autenticación — protegido por middleware.
 */
import { createServerClient, createAdminClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import AdminTareasClient from "@/components/tareas/AdminTareasClient";

export default async function AdminTareasPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Cargar tareas recientes
  const { data: tareas } = await admin
    .from("tareas")
    .select("*")
    .order("recibido_en", { ascending: false })
    .limit(50);

  // Stats rápidas
  const [{ count: total }, { count: pendientes }] = await Promise.all([
    admin.from("tareas").select("*", { count: "exact", head: true }),
    admin.from("tareas").select("*", { count: "exact", head: true }).eq("status", "recibido"),
  ]);

  return (
    <AdminTareasClient
      initialTareas={tareas ?? []}
      stats={{ total: total ?? 0, pendientes: pendientes ?? 0 }}
    />
  );
}

