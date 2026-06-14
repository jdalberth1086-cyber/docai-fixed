"use client";
/**
 * AdminTareasClient.tsx
 * Panel interactivo para administrar tareas de estudiantes.
 * Búsqueda por nombre o documento, filtro por materia y estado, cambio de status.
 */
import { useState, useCallback, useEffect } from "react";
import { Tarea } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  initialTareas: Tarea[];
  stats: { total: number; pendientes: number };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  recibido: { label: "Recibido", color: "#065f46", bg: "#d1fae5" },
  revisado: { label: "Revisado", color: "#1e40af", bg: "#dbeafe" },
  devuelto: { label: "Devuelto", color: "#92400e", bg: "#fef3c7" },
};

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "medium",
    timeStyle: "short",
  });

const formatBytes = (bytes: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export default function AdminTareasClient({ initialTareas, stats }: Props) {
  const [tareas, setTareas] = useState<Tarea[]>(initialTareas);
  const [busqueda, setBusqueda] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [totalServer, setTotalServer] = useState(stats.total);

  // Búsqueda con debounce
  const buscar = useCallback(async (q: string, status: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      params.set("limit", "50");
      const res = await fetch(`/api/tareas/list?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTareas(data.tareas ?? []);
      setTotalServer(data.total ?? 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al buscar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      buscar(busqueda, filtroStatus);
    }, 400);
    return () => clearTimeout(timer);
  }, [busqueda, filtroStatus, buscar]);

  async function updateStatus(tareaId: string, status: string, comentario?: string) {
    setUpdatingId(tareaId);
    try {
      const res = await fetch("/api/tareas/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tareaId, status, comentario }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTareas((prev) =>
        prev.map((t) => (t.id === tareaId ? { ...t, ...data.tarea } : t))
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1
            className="text-3xl font-bold mb-1"
            style={{ color: "var(--text)", fontFamily: "'Playfair Display', serif" }}
          >
            📥 Tareas Recibidas
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {stats.pendientes} pendientes de revisar · {totalServer} total
          </p>
        </div>

        {/* Stats rápidas */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Total tareas", value: totalServer, color: "#7c3aed" },
            { label: "Sin revisar", value: stats.pendientes, color: "#dc2626" },
            { label: "Mostrando", value: tareas.length, color: "#059669" },
          ].map((s) => (
            <div
              key={s.label}
              className="card p-4 text-center"
            >
              <div className="text-2xl font-bold" style={{ color: s.color }}>
                {s.value}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="card p-4 mb-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                style={{ color: "var(--text-muted)" }}
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o documento…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none"
                style={{ borderColor: "var(--border)", background: "var(--bg)" }}
              />
            </div>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="px-4 py-2.5 rounded-xl border text-sm outline-none"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
            >
              <option value="">Todos los estados</option>
              <option value="recibido">Recibidos</option>
              <option value="revisado">Revisados</option>
              <option value="devuelto">Devueltos</option>
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
            style={{ background: "var(--red-light)", color: "var(--red)" }}
          >
            ⚠️ {error}
            <button onClick={() => setError("")} className="ml-auto font-bold">✕</button>
          </div>
        )}

        {/* Lista de tareas */}
        {loading ? (
          <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
            <svg className="animate-spin w-6 h-6 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Buscando…
          </div>
        ) : tareas.length === 0 ? (
          <div className="card p-12 text-center">
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <p className="font-medium" style={{ color: "var(--text)" }}>
              {busqueda || filtroStatus ? "Sin resultados para tu búsqueda" : "No hay tareas recibidas aún"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tareas.map((tarea) => {
              const sc = STATUS_CONFIG[tarea.status] ?? STATUS_CONFIG.recibido;
              const isExpanded = expandedId === tarea.id;
              const isUpdating = updatingId === tarea.id;

              return (
                <div
                  key={tarea.id}
                  className="card overflow-hidden transition-all duration-150"
                >
                  {/* Fila principal */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : tarea.id)}
                    className="w-full px-5 py-4 flex items-center gap-4 text-left hover:opacity-80 transition-opacity"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg"
                      style={{ background: sc.bg }}
                    >
                      📄
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                          {tarea.estudiante_nombre}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          Doc: {tarea.estudiante_documento}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-xs font-medium" style={{ color: "var(--lavender-dark)" }}>
                          {tarea.materia}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                          {formatDistanceToNow(new Date(tarea.recibido_en), { addSuffix: true, locale: es })}
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ color: sc.color, background: sc.bg }}
                        >
                          {sc.label}
                        </span>
                      </div>
                    </div>

                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={`shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      style={{ color: "var(--text-muted)" }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {/* Detalle expandido */}
                  {isExpanded && (
                    <div
                      className="px-5 pb-5 border-t"
                      style={{ borderColor: "var(--border-light)" }}
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                        {/* Info estudiante */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                            Estudiante
                          </h4>
                          {[
                            ["Nombre", tarea.estudiante_nombre],
                            ["Documento", tarea.estudiante_documento],
                            ["WhatsApp", tarea.estudiante_whatsapp ?? "—"],
                            ["Email", tarea.estudiante_email ?? "—"],
                          ].map(([k, v]) => (
                            <div key={k} className="flex justify-between text-xs">
                              <span style={{ color: "var(--text-muted)" }}>{k}</span>
                              <span style={{ color: "var(--text)" }}>{v}</span>
                            </div>
                          ))}
                        </div>

                        {/* Info tarea */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                            Tarea
                          </h4>
                          {[
                            ["Materia", tarea.materia],
                            ["Archivo", tarea.original_name],
                            ["Tamaño", formatBytes(tarea.file_size)],
                            ["Recibido", formatFecha(tarea.recibido_en)],
                            ["Código", tarea.id.slice(0, 8).toUpperCase()],
                          ].map(([k, v]) => (
                            <div key={k} className="flex justify-between text-xs gap-2">
                              <span style={{ color: "var(--text-muted)" }}>{k}</span>
                              <span className="truncate text-right" style={{ color: "var(--text)", maxWidth: 160 }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {tarea.descripcion && (
                        <div
                          className="mt-3 p-3 rounded-xl text-xs"
                          style={{ background: "var(--bg-hover)", color: "var(--text)" }}
                        >
                          <strong>Descripción:</strong> {tarea.descripcion}
                        </div>
                      )}

                      {/* Comentario admin */}
                      <div className="mt-4">
                        <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>
                          Comentario para el estudiante (opcional)
                        </label>
                        <textarea
                          rows={2}
                          value={comentarios[tarea.id] ?? tarea.comentario_admin ?? ""}
                          onChange={(e) =>
                            setComentarios((prev) => ({ ...prev, [tarea.id]: e.target.value }))
                          }
                          placeholder="Ej: Falta la portada, entrega incompleta…"
                          className="w-full px-3 py-2 rounded-xl border text-xs outline-none resize-none"
                          style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                          disabled={isUpdating}
                        />
                      </div>

                      {/* Acciones */}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {["recibido", "revisado", "devuelto"].map((s) => (
                          <button
                            key={s}
                            onClick={() =>
                              updateStatus(tarea.id, s, comentarios[tarea.id])
                            }
                            disabled={isUpdating || tarea.status === s}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                            style={{
                              background: tarea.status === s ? STATUS_CONFIG[s].bg : "var(--bg-hover)",
                              color: tarea.status === s ? STATUS_CONFIG[s].color : "var(--text-muted)",
                              border: `1px solid ${tarea.status === s ? STATUS_CONFIG[s].color : "var(--border)"}`,
                              opacity: isUpdating ? 0.5 : 1,
                            }}
                          >
                            {isUpdating ? "…" : STATUS_CONFIG[s].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

