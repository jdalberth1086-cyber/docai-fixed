"use client";
/**
 * /app/tarea/page.tsx
 * Página PÚBLICA para que estudiantes suban tareas SIN login.
 * Optimizada para móvil.
 */
import { useState, useRef, useCallback } from "react";
import { useDropzone } from "react-dropzone";

const MATERIAS = [
  "Matemáticas",
  "Español",
  "Ciencias Naturales",
  "Ciencias Sociales",
  "Inglés",
  "Educación Física",
  "Artística",
  "Tecnología e Informática",
  "Ética y Valores",
  "Religión",
  "Otra",
];

const MAX_FILE_MB = 20;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx"];

interface ConfirmacionData {
  tareaId: string;
  mensaje: string;
  recibidoEn: string;
  estudiante: string;
  materia: string;
  codigoComprobante: string;
  whatsappEnviado: boolean;
}

export default function TareaPage() {
  const [nombre, setNombre] = useState("");
  const [documento, setDocumento] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [materia, setMateria] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [error, setError] = useState("");
  const [confirmacion, setConfirmacion] = useState<ConfirmacionData | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError(`El archivo supera ${MAX_FILE_MB} MB. Por favor comprime o usa otro archivo.`);
      return;
    }
    setArchivo(file);
    setError("");
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: MAX_FILE_BYTES,
    accept: {
      "application/pdf": [".pdf"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    disabled: enviando,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Validación cliente
    if (!nombre.trim() || nombre.trim().length < 2) {
      setError("Ingresa tu nombre completo."); return;
    }
    if (!documento.trim() || documento.trim().length < 4) {
      setError("Ingresa tu número de documento."); return;
    }
    if (!materia) {
      setError("Selecciona la materia."); return;
    }
    if (!archivo) {
      setError("Adjunta el archivo de tu tarea."); return;
    }

    setEnviando(true);
    setProgreso(10);

    try {
      const formData = new FormData();
      formData.append("estudianteNombre", nombre.trim());
      formData.append("estudianteDocumento", documento.trim());
      formData.append("materia", materia);
      formData.append("archivo", archivo);
      if (whatsapp.trim()) formData.append("estudianteWhatsapp", whatsapp.trim());
      if (email.trim()) formData.append("estudianteEmail", email.trim());
      if (descripcion.trim()) formData.append("descripcion", descripcion.trim());

      setProgreso(40);

      const res = await fetch("/api/tareas/submit", {
        method: "POST",
        body: formData,
      });

      setProgreso(85);

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      setProgreso(100);
      setConfirmacion(data as ConfirmacionData);
      topRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al enviar la tarea. Intenta nuevamente.");
    } finally {
      setEnviando(false);
      setProgreso(0);
    }
  }

  function resetForm() {
    setNombre(""); setDocumento(""); setWhatsapp(""); setEmail("");
    setMateria(""); setDescripcion(""); setArchivo(null);
    setError(""); setConfirmacion(null);
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatFecha = (iso: string) =>
    new Date(iso).toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      dateStyle: "long",
      timeStyle: "short",
    });

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{ background: "linear-gradient(135deg, #fdf8f5 0%, #f5f0ff 60%, #fff5f5 100%)" }}
      ref={topRef}
    >
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow"
            style={{ background: "linear-gradient(135deg, #e8d5ff, #ffd5e8)" }}
          >
            <span style={{ fontSize: 28 }}>📚</span>
          </div>
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "#2d1b69", fontFamily: "'Playfair Display', serif" }}
          >
            Entrega de Tarea
          </h1>
          <p className="text-sm" style={{ color: "#6b7280" }}>
            Completa el formulario para enviar tu tarea
          </p>
        </div>

        {/* CONFIRMACIÓN */}
        {confirmacion ? (
          <div
            className="rounded-2xl p-6 shadow-lg mb-6 text-center"
            style={{ background: "#fff", border: "2px solid #86efac" }}
          >
            <div className="text-5xl mb-4">✅</div>
            <h2
              className="text-xl font-bold mb-2"
              style={{ color: "#166534" }}
            >
              ¡Tarea recibida correctamente!
            </h2>
            <p className="text-sm mb-4" style={{ color: "#374151" }}>
              Hola <strong>{confirmacion.estudiante}</strong>, tu tarea de{" "}
              <strong>{confirmacion.materia}</strong> fue registrada exitosamente.
            </p>

            <div
              className="rounded-xl p-4 mb-4 text-left space-y-2"
              style={{ background: "#f0fdf4" }}
            >
              <div className="flex justify-between text-sm">
                <span style={{ color: "#6b7280" }}>📅 Fecha y hora:</span>
                <span className="font-medium" style={{ color: "#111827" }}>
                  {formatFecha(confirmacion.recibidoEn)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: "#6b7280" }}>🔖 Código:</span>
                <span
                  className="font-bold tracking-widest"
                  style={{ color: "#166534", fontSize: 15 }}
                >
                  {confirmacion.codigoComprobante}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: "#6b7280" }}>📱 WhatsApp:</span>
                <span style={{ color: confirmacion.whatsappEnviado ? "#166534" : "#9ca3af" }}>
                  {confirmacion.whatsappEnviado ? "Confirmación enviada ✓" : "No configurado"}
                </span>
              </div>
            </div>

            <p className="text-xs mb-5" style={{ color: "#6b7280" }}>
              Guarda el código <strong>{confirmacion.codigoComprobante}</strong> como comprobante.
            </p>

            <button
              onClick={resetForm}
              className="w-full py-3 rounded-xl font-semibold text-white text-sm"
              style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}
            >
              Enviar otra tarea
            </button>
          </div>
        ) : (
          /* FORMULARIO */
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl p-6 shadow-lg"
            style={{ background: "#fff" }}
          >
            {/* Datos del estudiante */}
            <div className="mb-5">
              <h3
                className="text-sm font-semibold mb-3 uppercase tracking-wide"
                style={{ color: "#7c3aed" }}
              >
                Datos del estudiante
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#374151" }}>
                    Nombre completo *
                  </label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej: María García López"
                    required
                    disabled={enviando}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all"
                    style={{ borderColor: "#d1d5db", background: "#f9fafb" }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#374151" }}>
                    Número de documento *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ""))}
                    placeholder="Ej: 1234567890"
                    required
                    disabled={enviando}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                    style={{ borderColor: "#d1d5db", background: "#f9fafb" }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#374151" }}>
                    WhatsApp
                    <span className="ml-1 font-normal" style={{ color: "#9ca3af" }}>
                      (para recibir confirmación)
                    </span>
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="Ej: 3001234567"
                    disabled={enviando}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                    style={{ borderColor: "#d1d5db", background: "#f9fafb" }}
                  />
                </div>
              </div>
            </div>

            {/* Información de la tarea */}
            <div className="mb-5">
              <h3
                className="text-sm font-semibold mb-3 uppercase tracking-wide"
                style={{ color: "#7c3aed" }}
              >
                Información de la tarea
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#374151" }}>
                    Materia *
                  </label>
                  <select
                    value={materia}
                    onChange={(e) => setMateria(e.target.value)}
                    required
                    disabled={enviando}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                    style={{ borderColor: "#d1d5db", background: "#f9fafb" }}
                  >
                    <option value="">Selecciona la materia…</option>
                    {MATERIAS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "#374151" }}>
                    Descripción
                    <span className="ml-1 font-normal" style={{ color: "#9ca3af" }}>(opcional)</span>
                  </label>
                  <textarea
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Ej: Taller unidad 3, ejercicios 1 al 10"
                    rows={2}
                    disabled={enviando}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none"
                    style={{ borderColor: "#d1d5db", background: "#f9fafb" }}
                  />
                </div>
              </div>
            </div>

            {/* Archivo */}
            <div className="mb-5">
              <h3
                className="text-sm font-semibold mb-3 uppercase tracking-wide"
                style={{ color: "#7c3aed" }}
              >
                Archivo de la tarea *
              </h3>

              {archivo ? (
                <div
                  className="flex items-center gap-3 p-4 rounded-xl border"
                  style={{ borderColor: "#86efac", background: "#f0fdf4" }}
                >
                  <span style={{ fontSize: 24 }}>
                    {archivo.type.includes("pdf") ? "📄" :
                     archivo.type.includes("image") ? "🖼️" : "📝"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "#111827" }}>
                      {archivo.name}
                    </p>
                    <p className="text-xs" style={{ color: "#6b7280" }}>
                      {formatBytes(archivo.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setArchivo(null)}
                    disabled={enviando}
                    className="text-xs px-2 py-1 rounded-lg"
                    style={{ color: "#dc2626", background: "#fee2e2" }}
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div
                  {...getRootProps()}
                  className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all"
                  style={{
                    borderColor: isDragActive ? "#7c3aed" : "#d1d5db",
                    background: isDragActive ? "#f5f0ff" : "#f9fafb",
                  }}
                >
                  <input {...getInputProps()} />
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
                  <p className="text-sm font-medium mb-1" style={{ color: "#374151" }}>
                    {isDragActive ? "¡Suelta aquí!" : "Toca para seleccionar archivo"}
                  </p>
                  <p className="text-xs" style={{ color: "#9ca3af" }}>
                    PDF, imagen o Word · máx. {MAX_FILE_MB} MB
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#9ca3af" }}>
                    {ALLOWED_EXTENSIONS.join(", ")}
                  </p>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div
                className="mb-4 px-4 py-3 rounded-xl text-sm flex items-start gap-2"
                style={{ background: "#fee2e2", color: "#dc2626" }}
              >
                <span>⚠️</span>
                <span className="flex-1">{error}</span>
                <button onClick={() => setError("")} className="font-bold ml-auto">✕</button>
              </div>
            )}

            {/* Progreso */}
            {enviando && progreso > 0 && (
              <div className="mb-4">
                <div
                  className="h-2 rounded-full overflow-hidden mb-1"
                  style={{ background: "#e5e7eb" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${progreso}%`,
                      background: "linear-gradient(90deg, #7c3aed, #a855f7)",
                    }}
                  />
                </div>
                <p className="text-xs text-center" style={{ color: "#6b7280" }}>
                  {progreso < 40 ? "Subiendo archivo…" :
                   progreso < 90 ? "Registrando tarea…" : "Finalizando…"}
                </p>
              </div>
            )}

            {/* Botón enviar */}
            <button
              type="submit"
              disabled={enviando}
              className="w-full py-4 rounded-xl font-semibold text-white text-sm transition-all flex items-center justify-center gap-2"
              style={{
                background: enviando
                  ? "#9ca3af"
                  : "linear-gradient(135deg, #7c3aed, #a855f7)",
                cursor: enviando ? "not-allowed" : "pointer",
              }}
            >
              {enviando ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Enviando tarea…
                </>
              ) : (
                "📤 Enviar tarea"
              )}
            </button>

            <p className="text-center text-xs mt-4" style={{ color: "#9ca3af" }}>
              🔒 Tu archivo se guarda de forma segura y privada
            </p>
          </form>
        )}

        {/* Consultar historial */}
        <div className="mt-6 text-center">
          <a
            href="/tarea/historial"
            className="text-sm underline"
            style={{ color: "#7c3aed" }}
          >
            Consultar mis tareas anteriores →
          </a>
        </div>
      </div>
    </div>
  );
}

