import { createServerClient } from "@/lib/supabase-server";
import Link from "next/link";
import { Document } from "@/types";

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: documents }, { count: docCount }, { count: readyCount }, { data: recentChats }] =
    await Promise.all([
      supabase
        .from("documents")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id),
      supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("status", "ready"),
      supabase
        .from("chat_sessions")
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(3),
    ]);

  const name =
    user!.user_metadata?.full_name ||
    user!.email?.split("@")[0] ||
    "Profesora";

  const stats = [
    {
      label: "Documentos cargados",
      value: docCount ?? 0,
      icon: "📄",
      color: "var(--lavender-dark)",
      bg: "var(--lavender-light)",
    },
    {
      label: "Listos para consulta",
      value: readyCount ?? 0,
      icon: "✅",
      color: "var(--sage-dark)",
      bg: "var(--sage-light)",
    },
    {
      label: "Conversaciones",
      value: recentChats?.length ?? 0,
      icon: "💬",
      color: "var(--rose-dark)",
      bg: "var(--rose-light)",
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-8">
      {/* Header */}
      <div className="mb-10">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ color: "var(--text)", fontFamily: "'Playfair Display', serif" }}
        >
          ¡Hola, {name}! 👋
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Tu espacio privado de documentación inteligente
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-6">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3"
              style={{ background: stat.bg }}
            >
              {stat.icon}
            </div>
            <div
              className="text-3xl font-bold mb-0.5"
              style={{ color: stat.color, fontFamily: "'Playfair Display', serif" }}
            >
              {stat.value}
            </div>
            <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Documents */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--text)", fontFamily: "'Playfair Display', serif" }}
            >
              Documentos recientes
            </h2>
            <Link
              href="/dashboard/documents"
              className="text-xs font-medium hover:underline"
              style={{ color: "var(--lavender-dark)" }}
            >
              Ver todos →
            </Link>
          </div>

          {documents && documents.length > 0 ? (
            <div className="space-y-3">
              {(documents as Document[]).map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 py-2">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: "linear-gradient(135deg, var(--rose-light), var(--lavender-light))",
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      style={{ color: "var(--lavender-dark)" }}
                    >
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
                      {doc.name}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {doc.page_count ? `${doc.page_count} págs · ` : ""}
                      <span
                        style={{
                          color:
                            doc.status === "ready"
                              ? "var(--sage-dark)"
                              : doc.status === "error"
                              ? "var(--red)"
                              : doc.status === "processing"
                              ? "var(--lavender-dark)"
                              : "var(--text-muted)",
                        }}
                      >
                        {doc.status === "ready"
                          ? "Listo"
                          : doc.status === "processing"
                          ? "Procesando…"
                          : doc.status === "error"
                          ? "Error"
                          : "Pendiente"}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No hay documentos aún
              </p>
              <Link
                href="/dashboard/documents"
                className="btn-primary inline-flex mt-4 text-xs px-4 py-2"
              >
                Subir primer PDF
              </Link>
            </div>
          )}
        </div>

        {/* Quick actions + recent chats */}
        <div className="space-y-4">
          <div className="card p-6">
            <h2
              className="text-lg font-semibold mb-4"
              style={{ color: "var(--text)", fontFamily: "'Playfair Display', serif" }}
            >
              Acciones rápidas
            </h2>
            <div className="space-y-2">
              {[
                {
                  href: "/dashboard/documents",
                  emoji: "📤",
                  label: "Subir documento",
                  desc: "Carga un PDF para procesarlo con IA",
                  bg: "var(--lavender-light)",
                },
                {
                  href: "/dashboard/chat",
                  emoji: "💬",
                  label: "Nueva conversación",
                  desc: "Pregunta sobre tus documentos",
                  bg: "var(--rose-light)",
                },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center gap-3 p-3.5 rounded-xl transition-all duration-150 hover:shadow-sm group"
                  style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ background: action.bg }}
                  >
                    {action.emoji}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                      {action.label}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {action.desc}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {recentChats && recentChats.length > 0 && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="text-lg font-semibold"
                  style={{ color: "var(--text)", fontFamily: "'Playfair Display', serif" }}
                >
                  Chats recientes
                </h2>
                <Link
                  href="/dashboard/chat"
                  className="text-xs font-medium hover:underline"
                  style={{ color: "var(--lavender-dark)" }}
                >
                  Ver todos →
                </Link>
              </div>
              <div className="space-y-1">
                {recentChats.map((session) => (
                  <Link
                    key={session.id}
                    href={`/dashboard/chat?session=${session.id}`}
                    className="flex items-center gap-3 py-2 px-3 rounded-xl transition-all duration-150 hover:bg-[var(--bg-hover)]"
                  >
                    <span style={{ color: "var(--rose)" }}>💬</span>
                    <p className="text-sm truncate" style={{ color: "var(--text)" }}>
                      {session.title}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

