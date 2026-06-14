"use client";
/**
 * /app/tarea/historial/page.tsx
 * Página pública — el estudiante consulta sus tareas por número de documento.
 */
import { useState } from "react";
import { Tarea } from "@/types";

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  recibido: { label: "Recibido ✓", color: "#065f46", bg: "#d1fae5" },
  revisado: { label: "Revisado 👁️", color: "#1e40af", bg: "#dbeafe" },
  devuelto: { label: "Devuelto 🔄", color: "#92400e", bg: "#fef3c7" },
};

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "medium",
    timeStyle: "short",
  });

const formatBytes = (bytes: number) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export default function HistorialPage() {
  const [documento, setDocumento] = useState("");
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [buscado, setBuscado] = useState(false);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (!documento.trim() || documento.trim().length < 4) {
      setError("Ingresa tu número de documento (mínimo 4 dígitos).");
      return;
    }
    setLoading(true);
    setError("");
    setBuscado(false);

    try {
      const res = await fetch(`/api/tareas/historial?documento=${encodeURIComponent(documento.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al consultar");
      setTareas(data.tareas ?? []);
      setBuscado(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al consultar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{ background: "linear-gradient(135deg, #fdf8f5 0%, #f5f0ff 60%, #fff5f5 100%)" }}
    >
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3 shadow"
            style={{ background: "linear-gradient(135deg, #e8d5ff, #ffd5e8)" }}
          >
            <span style={{ fontSize: 26 }}>🔍</span>
          </div>
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "#2d1b69", fontFamily: "'Playfair Display', serif" }}
          >
            Mis Tareas
          </h1>
          <p className="text-sm" style={{ color: "#6b7280" }}>
            Consulta el estado de tus entregas
          </p>
        </div>

        {/* Formulario de búsqueda */}
        <form
          onSubmit={buscar}
          className="rounded-2xl p-5 shadow mb-5"
          style={{ background: "#fff" }}
        >
          <label className="block text-sm font-medium mb-2" style={{ color: "#374151" }}>
            Número de documento
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={documento}
              onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ""))}
              placeholder="Ingresa tu documento…"
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-xl border text-sm outline-none"
              style={{ borderColor: "#d1d5db", background: "#f9fafb" }}
            />
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-3 rounded-xl font-semibold text-white text-sm"
              style={{
                background: loading ? "#9ca3af" : "linear-gradient(135deg, #7c3aed, #a855f7)",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "…" : "Buscar"}
            </button>
          </div>
          {error && (
            <p className="text-xs mt-2" style={{ color: "#dc2626" }}>⚠️ {error}</p>
          )}
        </form>

        {/* Resultados */}
        {buscado && (
          tareas.length === 0 ? (
            <div
              className="rounded-2xl p-8 text-center shadow"
              style={{ background: "#fff" }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <p className="text-sm font-medium" style={{ color: "#374151" }}>
                No encontramos tareas para el documento <strong>{documento}</strong>
              </p>
              <p className="text-xs mt-2" style={{ color: "#9ca3af" }}>
                Verifica el número o envía tu primera tarea
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-medium" style={{ color: "#6b7280" }}>
                {tareas.length} tarea{tareas.length !== 1 ? "s" : ""} encontrada{tareas.length !== 1 ? "s" : ""} para <strong>{tareas[0]?.estudiante_nombre}</strong>
              </p>
              {tareas.map((t) => {
                const sc = STATUS_LABEL[t.status] ?? STATUS_LABEL.recibido;
                return (
                  <div
                    key={t.id}
                    className="rounded-2xl p-4 shadow"
                    style={{ background: "#fff" }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "#111827" }}>
                          {t.materia}
                        </p>
                        {t.descripcion && (
                          <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
                            {t.descripcion}
                          </p>
                        )}
                      </div>
                      <span
                        className="text-xs font-semibold px-2 py-1 rounded-lg shrink-0"
                        style={{ color: sc.color, background: sc.bg }}
                      >
                        {sc.label}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span style={{ color: "#9ca3af" }}>📄 Archivo</span>
                        <span className="truncate ml-4" style={{ color: "#374151", maxWidth: 180 }}>
                          {t.original_name}
                          {t.file_size ? ` · ${formatBytes(t.file_size)}` : ""}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: "#9ca3af" }}>🕐 Recibido</span>
                        <span style={{ color: "#374151" }}>{formatFecha(t.recibido_en)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: "#9ca3af" }}>🔖 Código</span>
                        <span className="font-bold tracking-widest" style={{ color: "#7c3aed" }}>
                          {t.id.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                      {t.comentario_admin && (
                        <div
                          className="mt-2 p-2 rounded-lg text-xs"
                          style={{ background: "#eff6ff", color: "#1e40af" }}
                        >
                          💬 <strong>Comentario:</strong> {t.comentario_admin}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        <div className="mt-6 text-center">
          <a href="/tarea" className="text-sm underline" style={{ color: "#7c3aed" }}>
            ← Enviar otra tarea
          </a>
        </div>
      </div>
    </div>
  );
}

