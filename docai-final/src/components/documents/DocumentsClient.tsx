"use client";

/**
 * DocumentsClient.tsx
 *
 * FIXES aplicados:
 * 1. Polling: cleanup correcto de interval en useEffect (evita memory leak)
 * 2. Upload: el fetch a /api/documents/process no incluye el buffer del PDF (solo el ID)
 *    — El PDF ya fue subido a Supabase Storage, solo enviamos el documentId
 * 3. reprocessDocument: permite reprocesar documentos en estado 'error' O 'ready'
 * 4. Error display: no se limpia automáticamente (el usuario debe cerrarlo)
 * 5. FIX crítico: evitar que el supabase client se recree en cada render (useMemo)
 * 6. Timeout de fetch a process API aumentado a 55s (deja 5s de margen antes del Vercel timeout)
 * 7. Upload: validación de tipo MIME en cliente antes de subir
 * 8. pollRef: usa documentos actuales (no closure stale)
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { Document } from "@/types";
import { createClient } from "@/lib/supabase";
import { formatBytes } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  initialDocuments: Document[];
  userId: string;
}

const POLL_INTERVAL_MS = 4000;
const MAX_FILE_MB = 50;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

export default function DocumentsClient({ initialDocuments, userId }: Props) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStep, setUploadStep] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState("");
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  // FIX: useMemo para no recrear el cliente en cada render
  const supabase = useMemo(() => createClient(), []);

  // FIX: Ref para acceder al estado actual de documents dentro del interval
  const documentsRef = useRef<Document[]>(documents);
  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Polling para documentos en proceso ──────────────────────────────────
  useEffect(() => {
    const hasProcessing = documents.some(
      (d) => d.status === "processing" || d.status === "pending"
    );

    if (hasProcessing) {
      if (!pollRef.current) {
        pollRef.current = setInterval(async () => {
          // FIX: Usar ref para evitar closure stale
          const currentDocs = documentsRef.current;
          const processingIds = currentDocs
            .filter((d) => d.status === "processing" || d.status === "pending")
            .map((d) => d.id);

          if (processingIds.length === 0) {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            return;
          }

          try {
            const { data: updated } = await supabase
              .from("documents")
              .select("*")
              .in("id", processingIds);

            if (updated && updated.length > 0) {
              setDocuments((prev) =>
                prev.map((d) => {
                  const fresh = updated.find((u: Document) => u.id === d.id);
                  return fresh ?? d;
                })
              );
            }
          } catch (pollErr) {
            console.warn("[poll] Error al actualizar estado:", pollErr);
          }
        }, POLL_INTERVAL_MS);
      }
    } else {
      // FIX: Limpiar interval cuando ya no hay docs procesando
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [documents, supabase]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      // FIX: Validación de tipo MIME más robusta
      if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
      ) {
        setError("Solo se permiten archivos PDF (.pdf).");
        return;
      }

      if (file.size > MAX_FILE_BYTES) {
        setError(
          `El archivo (${(file.size / 1024 / 1024).toFixed(1)} MB) supera el límite de ${MAX_FILE_MB} MB.`
        );
        return;
      }

      if (file.size === 0) {
        setError("El archivo PDF está vacío.");
        return;
      }

      setUploading(true);
      setError("");
      setUploadProgress(5);
      setUploadStep("Subiendo archivo…");

      try {
        // ── 1. Upload to Supabase Storage ──────────────────────────────────
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${userId}/${timestamp}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(storagePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: "application/pdf",
          });

        if (uploadError) {
          throw new Error(`Error al subir el archivo: ${uploadError.message}`);
        }

        setUploadProgress(35);
        setUploadStep("Registrando documento…");

        // ── 2. Insert document record in Supabase DB ───────────────────────
        const { data: doc, error: dbError } = await supabase
          .from("documents")
          .insert({
            user_id: userId,
            name: file.name.replace(/\.pdf$/i, ""),
            original_name: file.name,
            storage_path: storagePath,
            file_size: file.size,
            status: "pending",
          })
          .select()
          .single();

        if (dbError || !doc) {
          // Cleanup: borrar el archivo subido si el insert falla
          await supabase.storage.from("documents").remove([storagePath]);
          throw new Error(
            `Error al registrar el documento: ${dbError?.message ?? "sin datos"}`
          );
        }

        setUploadProgress(50);
        setUploadStep("Procesando con IA… (esto puede tomar hasta 60s)");

        // FIX: Añadir el doc inmediatamente en estado 'pending' para que se vea en la lista
        setDocuments((prev) => [doc, ...prev]);

        // ── 3. Trigger AI processing ───────────────────────────────────────
        // FIX: Solo enviamos el documentId — el PDF ya está en Supabase Storage
        // El servidor lo descarga directamente desde ahí
        const controller = new AbortController();
        // FIX: Timeout de 55s (5s antes del límite de Vercel de 60s)
        const timeout = setTimeout(() => controller.abort(), 55000);

        let resp: Response;
        try {
          resp = await fetch("/api/documents/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // FIX: Solo enviamos el ID — NO el buffer del PDF
            body: JSON.stringify({ documentId: doc.id }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        setUploadProgress(90);

        if (!resp.ok) {
          let errorMsg = `Error del servidor (${resp.status})`;
          try {
            const data = await resp.json();
            if (data.error) errorMsg = data.error;
          } catch {
            // ignorar error de parseo
          }
          throw new Error(errorMsg);
        }

        setUploadProgress(100);
        setUploadStep("¡Procesado con éxito! 🎉");

        // ── 4. Refresh doc status immediately ─────────────────────────────
        const { data: updated } = await supabase
          .from("documents")
          .select("*")
          .eq("id", doc.id)
          .single();

        if (updated) {
          setDocuments((prev) =>
            prev.map((d) => (d.id === updated.id ? updated : d))
          );
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          setError(
            "El procesamiento está tomando más tiempo del esperado. El documento se procesará en segundo plano — revisa el estado en unos minutos."
          );
        } else {
          setError(
            err instanceof Error ? err.message : "Error desconocido al subir el archivo"
          );
        }
      } finally {
        setUploading(false);
        setUploadProgress(0);
        setUploadStep("");
      }
    },
    [userId, supabase]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    maxSize: MAX_FILE_BYTES,
    disabled: uploading,
  });

  async function deleteDocument(doc: Document) {
    if (
      !confirm(
        `¿Eliminar "${doc.name}"?\n\nEsta acción eliminará el archivo, los fragmentos y los vectores. No se puede deshacer.`
      )
    )
      return;

    try {
      // 1. Borrar vectores de Pinecone
      await fetch("/api/documents/delete-vectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id }),
      });

      // 2. Borrar chunks de Supabase
      await supabase
        .from("document_chunks")
        .delete()
        .eq("document_id", doc.id);

      // 3. Borrar archivo del storage
      await supabase.storage.from("documents").remove([doc.storage_path]);

      // 4. Borrar registro del documento
      await supabase.from("documents").delete().eq("id", doc.id);

      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al eliminar el documento"
      );
    }
  }

  async function saveRename(docId: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    const { error: renameErr } = await supabase
      .from("documents")
      .update({ name: trimmed })
      .eq("id", docId);

    if (renameErr) {
      setError("Error al renombrar: " + renameErr.message);
      return;
    }
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, name: trimmed } : d))
    );
    setRenaming(null);
  }

  // FIX: reprocessDocument acepta status 'error' — elimina la condición de solo error
  async function reprocessDocument(doc: Document) {
    if (reprocessingId) return; // evitar doble click

    setReprocessingId(doc.id);
    setError("");

    // FIX: Actualizar UI optimistamente
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === doc.id
          ? { ...d, status: "pending" as const, error_message: null }
          : d
      )
    );

    try {
      const resp = await fetch("/api/documents/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? `Error ${resp.status}`);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al reprocesar el documento"
      );
      // Revertir estado si falló inmediatamente
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === doc.id ? { ...d, status: "error" as const } : d
        )
      );
    } finally {
      setReprocessingId(null);
      // El polling actualizará el estado final
    }
  }

  const statusConfig: Record<
    string,
    { label: string; className: string; dot?: boolean }
  > = {
    ready: { label: "Listo", className: "badge-sage" },
    processing: {
      label: "Procesando…",
      className: "badge-lavender",
      dot: true,
    },
    error: { label: "Error", className: "badge-red" },
    pending: { label: "Pendiente", className: "badge-muted", dot: true },
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-3xl font-bold mb-1"
            style={{
              color: "var(--text)",
              fontFamily: "'Playfair Display', serif",
            }}
          >
            Mis Documentos
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {documents.length} documento{documents.length !== 1 ? "s" : ""} ·
            Sube PDFs para analizarlos con IA
          </p>
        </div>

        {/* Upload Zone */}
        <div
          {...getRootProps()}
          className="border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 mb-8"
          style={{
            borderColor: isDragActive
              ? "var(--lavender)"
              : uploading
              ? "var(--lavender-light)"
              : "var(--border-light)",
            background: isDragActive
              ? "var(--lavender-light)"
              : uploading
              ? "linear-gradient(135deg, #fdf8ff, #f8f5ff)"
              : "var(--bg-card)",
          }}
        >
          <input {...getInputProps()} />

          {uploading ? (
            <div className="space-y-4">
              <div
                className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, var(--rose-light), var(--lavender-light))",
                }}
              >
                <svg
                  className="animate-spin w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  style={{ color: "var(--lavender-dark)" }}
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              </div>
              <div>
                <p
                  className="text-sm font-semibold mb-0.5"
                  style={{ color: "var(--lavender-dark)" }}
                >
                  {uploadStep}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  No cierres esta ventana
                </p>
              </div>
              <div className="w-56 mx-auto">
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: "var(--lavender-light)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${uploadProgress}%`,
                      background:
                        "linear-gradient(90deg, var(--rose), var(--lavender))",
                    }}
                  />
                </div>
                <p
                  className="text-xs mt-1.5 text-center"
                  style={{ color: "var(--text-muted)" }}
                >
                  {uploadProgress}%
                </p>
              </div>
            </div>
          ) : (
            <>
              <div
                className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4"
                style={{
                  background: isDragActive
                    ? "var(--lavender)"
                    : "linear-gradient(135deg, var(--rose-light), var(--lavender-light))",
                }}
              >
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  style={{
                    color: isDragActive ? "#fff" : "var(--lavender-dark)",
                  }}
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
              </div>
              <p
                className="text-sm font-semibold mb-1"
                style={{
                  color: isDragActive ? "var(--lavender-dark)" : "var(--text)",
                }}
              >
                {isDragActive
                  ? "¡Suelta el PDF aquí!"
                  : "Arrastra un PDF o haz clic para seleccionar"}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Solo PDF · máx. {MAX_FILE_MB} MB
              </p>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            className="mb-6 px-4 py-3 rounded-xl text-sm flex items-start gap-3 animate-fade-in"
            style={{ background: "var(--red-light)", color: "var(--red)" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="shrink-0 mt-0.5"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="flex-1">{error}</span>
            <button
              className="ml-auto shrink-0 opacity-60 hover:opacity-100 font-bold"
              onClick={() => setError("")}
            >
              ✕
            </button>
          </div>
        )}

        {/* Documents list */}
        {documents.length === 0 ? (
          <div className="card p-16 text-center">
            <div className="text-5xl mb-4">📚</div>
            <h3
              className="text-lg font-bold mb-1"
              style={{
                color: "var(--text)",
                fontFamily: "'Playfair Display', serif",
              }}
            >
              Biblioteca vacía
            </h3>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Sube tu primer PDF para comenzar
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => {
              const sc = statusConfig[doc.status] ?? statusConfig.pending;
              const isReprocessing = reprocessingId === doc.id;

              return (
                <div
                  key={doc.id}
                  className="card px-5 py-4 flex items-center gap-4 transition-all duration-150 animate-fade-in"
                  style={{
                    borderColor:
                      doc.status === "error"
                        ? "var(--red-light)"
                        : undefined,
                  }}
                >
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background:
                        doc.status === "error"
                          ? "var(--red-light)"
                          : "linear-gradient(135deg, var(--rose-light), var(--lavender-light))",
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      style={{
                        color:
                          doc.status === "error"
                            ? "var(--red)"
                            : "var(--lavender-dark)",
                      }}
                    >
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>

                  {/* Name & meta */}
                  <div className="flex-1 min-w-0">
                    {renaming === doc.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename(doc.id);
                            if (e.key === "Escape") setRenaming(null);
                          }}
                          className="input py-1 text-sm flex-1"
                        />
                        <button
                          onClick={() => saveRename(doc.id)}
                          className="btn-primary py-1 px-3 text-xs"
                        >
                          Guardar
                        </button>
                        <button
                          onClick={() => setRenaming(null)}
                          className="btn-ghost py-1 px-3 text-xs"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <>
                        <p
                          className="text-sm font-semibold truncate"
                          style={{ color: "var(--text)" }}
                        >
                          {doc.name}
                        </p>
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
                          <span className={sc.className}>
                            {sc.dot && (
                              <span
                                className="w-1.5 h-1.5 rounded-full inline-block animate-pulse"
                                style={{ background: "currentColor" }}
                              />
                            )}
                            {sc.label}
                          </span>
                          {doc.page_count && (
                            <span
                              className="text-xs"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {doc.page_count} págs
                            </span>
                          )}
                          {doc.file_size && (
                            <span
                              className="text-xs"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {formatBytes(doc.file_size)}
                            </span>
                          )}
                          <span
                            className="text-xs"
                            style={{ color: "var(--text-dim)" }}
                          >
                            {formatDistanceToNow(new Date(doc.created_at), {
                              addSuffix: true,
                              locale: es,
                            })}
                          </span>
                        </div>
                        {doc.status === "error" && doc.error_message && (
                          <p
                            className="text-xs mt-1 truncate"
                            style={{ color: "var(--red)" }}
                            title={doc.error_message}
                          >
                            ⚠ {doc.error_message}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  {renaming !== doc.id && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          setRenaming(doc.id);
                          setRenameValue(doc.name);
                        }}
                        className="btn-ghost p-2"
                        title="Renombrar"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                        >
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>

                      {/* FIX: Botón de reprocesar para status 'error' */}
                      {doc.status === "error" && (
                        <button
                          onClick={() => reprocessDocument(doc)}
                          disabled={isReprocessing}
                          className="btn-ghost p-2"
                          title="Reintentar procesamiento"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            className={isReprocessing ? "animate-spin" : ""}
                          >
                            <path d="M1 4v6h6M23 20v-6h-6" />
                            <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
                          </svg>
                        </button>
                      )}

                      <button
                        onClick={() => deleteDocument(doc)}
                        className="btn-danger p-2"
                        title="Eliminar"
                        disabled={doc.status === "processing"}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m5 0V4a1 1 0 011-1h2a1 1 0 011 1v2" />
                        </svg>
                      </button>
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

