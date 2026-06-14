/**
 * /api/tareas/submit/route.ts
 * Recibe tarea de estudiante SIN login:
 * 1. Valida campos
 * 2. Sube archivo a Supabase Storage
 * 3. Registra en tabla `tareas`
 * 4. Envía WhatsApp de confirmación (si está configurado)
 * 5. Retorna confirmación inmediata
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { sendWhatsApp, buildConfirmationMessage } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB para tareas
const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // ── Extraer campos ────────────────────────────────────────────────────
    const estudianteNombre = (formData.get("estudianteNombre") as string)?.trim();
    const estudianteDocumento = (formData.get("estudianteDocumento") as string)?.trim();
    const estudianteWhatsapp = (formData.get("estudianteWhatsapp") as string)?.trim() || null;
    const estudianteEmail = (formData.get("estudianteEmail") as string)?.trim() || null;
    const materia = (formData.get("materia") as string)?.trim();
    const descripcion = (formData.get("descripcion") as string)?.trim() || null;
    const file = formData.get("archivo") as File | null;

    // ── Validaciones ──────────────────────────────────────────────────────
    const errors: string[] = [];
    if (!estudianteNombre || estudianteNombre.length < 2)
      errors.push("Nombre del estudiante requerido (mínimo 2 caracteres)");
    if (!estudianteDocumento || estudianteDocumento.length < 4)
      errors.push("Número de documento requerido");
    if (!materia || materia.length < 2)
      errors.push("Materia requerida");
    if (!file)
      errors.push("Archivo de tarea requerido");
    if (file && file.size > MAX_FILE_BYTES)
      errors.push(`El archivo supera el límite de ${MAX_FILE_BYTES / 1024 / 1024} MB`);
    if (file && file.size === 0)
      errors.push("El archivo está vacío");
    if (file && !ALLOWED_TYPES.includes(file.type))
      errors.push("Tipo de archivo no permitido. Usa PDF, imagen o Word.");

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(". ") }, { status: 400 });
    }

    const admin = createAdminClient();
    const recibidoEn = new Date().toISOString();

    // ── Subir archivo a Storage ───────────────────────────────────────────
    const ext = file!.name.split(".").pop()?.toLowerCase() ?? "pdf";
    const safeName = file!.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const timestamp = Date.now();
    const docSlug = estudianteDocumento.replace(/\D/g, "");
    const storagePath = `tareas/${docSlug}/${timestamp}_${safeName}`;

    const arrayBuffer = await file!.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await admin.storage
      .from("tareas")
      .upload(storagePath, buffer, {
        contentType: file!.type || "application/pdf",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("[tareas/submit] Storage upload error:", uploadError);
      throw new Error(`Error al subir el archivo: ${uploadError.message}`);
    }

    // ── Registrar en base de datos ────────────────────────────────────────
    const { data: tarea, error: dbError } = await admin
      .from("tareas")
      .insert({
        estudiante_nombre: estudianteNombre,
        estudiante_documento: estudianteDocumento,
        estudiante_whatsapp: estudianteWhatsapp,
        estudiante_email: estudianteEmail,
        materia,
        descripcion,
        storage_path: storagePath,
        original_name: file!.name,
        file_size: file!.size,
        status: "recibido",
        recibido_en: recibidoEn,
      })
      .select()
      .single();

    if (dbError || !tarea) {
      // Limpiar storage si falla la BD
      await admin.storage.from("tareas").remove([storagePath]);
      console.error("[tareas/submit] DB insert error:", dbError);
      throw new Error(`Error al registrar la tarea: ${dbError?.message}`);
    }

    console.log(
      `[tareas/submit] Tarea registrada: id=${tarea.id} estudiante="${estudianteNombre}" doc=${estudianteDocumento} materia="${materia}"`
    );

    // ── Enviar WhatsApp (no bloquea si falla) ─────────────────────────────
    let whatsappSent = false;
    if (estudianteWhatsapp) {
      const mensaje = buildConfirmationMessage({
        estudianteNombre,
        materia,
        originalName: file!.name,
        recibidoEn,
        tareaId: tarea.id,
      });

      const waResult = await sendWhatsApp(estudianteWhatsapp, mensaje);
      whatsappSent = waResult.sent;

      if (!waResult.sent) {
        console.warn(
          `[tareas/submit] WhatsApp no enviado (${waResult.provider}): ${waResult.error}`
        );
      }
    }

    // ── Respuesta exitosa ─────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      tareaId: tarea.id,
      mensaje: "✅ Tu tarea fue recibida correctamente",
      recibidoEn,
      estudiante: estudianteNombre,
      materia,
      whatsappEnviado: whatsappSent,
      codigoComprobante: tarea.id.slice(0, 8).toUpperCase(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno del servidor";
    console.error("[tareas/submit] ERROR:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

