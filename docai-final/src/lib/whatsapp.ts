/**
 * whatsapp.ts — Notificaciones WhatsApp para confirmación de tareas
 *
 * Estrategia: Twilio WhatsApp (preferido) con fallback a CallMeBot (gratuito)
 *
 * Variables de entorno requeridas (agregar en Vercel):
 *   TWILIO_ACCOUNT_SID=ACxxxxxxxx
 *   TWILIO_AUTH_TOKEN=xxxxxxxx
 *   TWILIO_WHATSAPP_FROM=+14155238886  (número sandbox de Twilio)
 *
 * Si no tienes Twilio, solo configura CALLMEBOT_API_KEY
 *   CALLMEBOT_API_KEY=xxxxxxxx
 *
 * Si ninguno está configurado, el sistema funciona igual pero sin WhatsApp
 * (la confirmación se muestra igual en la interfaz).
 */

export interface WhatsAppResult {
  sent: boolean;
  provider?: "twilio" | "callmebot" | "none";
  error?: string;
}

/**
 * Normaliza número de WhatsApp a formato internacional sin +
 * Ejemplos: "3001234567" → "573001234567", "+573001234567" → "573001234567"
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Si empieza con 57 (Colombia) y tiene 12 dígitos → ya está bien
  if (digits.startsWith("57") && digits.length === 12) return digits;
  // Si empieza con 3 y tiene 10 dígitos → agregar prefijo Colombia
  if (digits.startsWith("3") && digits.length === 10) return `57${digits}`;
  // Si tiene + al inicio, solo limpiar
  return digits;
}

async function sendViaTwilio(
  to: string,
  message: string
): Promise<WhatsAppResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM ?? "+14155238886";

  if (!sid || !token) {
    return { sent: false, provider: "none", error: "Twilio no configurado" };
  }

  const normalizedTo = normalizePhone(to);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  const body = new URLSearchParams({
    From: `whatsapp:+${from.replace(/\D/g, "")}`,
    To: `whatsapp:+${normalizedTo}`,
    Body: message,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg = (errData as { message?: string }).message ?? res.statusText;
      console.error(`[whatsapp/twilio] Error ${res.status}: ${errMsg}`);
      return { sent: false, provider: "twilio", error: errMsg };
    }

    console.log(`[whatsapp/twilio] Mensaje enviado a +${normalizedTo}`);
    return { sent: true, provider: "twilio" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[whatsapp/twilio] Excepción: ${msg}`);
    return { sent: false, provider: "twilio", error: msg };
  }
}

async function sendViaCallmebot(
  to: string,
  message: string
): Promise<WhatsAppResult> {
  const apiKey = process.env.CALLMEBOT_API_KEY;
  if (!apiKey) {
    return { sent: false, provider: "none", error: "CallMeBot no configurado" };
  }

  const normalizedTo = normalizePhone(to);
  const encodedMsg = encodeURIComponent(message);
  const url = `https://api.callmebot.com/whatsapp.php?phone=${normalizedTo}&text=${encodedMsg}&apikey=${apiKey}`;

  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      return {
        sent: false,
        provider: "callmebot",
        error: `HTTP ${res.status}`,
      };
    }
    console.log(`[whatsapp/callmebot] Mensaje enviado a +${normalizedTo}`);
    return { sent: true, provider: "callmebot" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { sent: false, provider: "callmebot", error: msg };
  }
}

/**
 * Envía mensaje de WhatsApp usando Twilio (preferido) o CallMeBot (fallback).
 * Nunca lanza error — siempre retorna resultado para no bloquear el flujo principal.
 */
export async function sendWhatsApp(
  phone: string,
  message: string
): Promise<WhatsAppResult> {
  if (!phone?.trim()) {
    return { sent: false, provider: "none", error: "Número de teléfono vacío" };
  }

  // Intentar Twilio primero
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const result = await sendViaTwilio(phone, message);
    if (result.sent) return result;
    console.warn("[whatsapp] Twilio falló, intentando CallMeBot...");
  }

  // Fallback a CallMeBot
  if (process.env.CALLMEBOT_API_KEY) {
    return sendViaCallmebot(phone, message);
  }

  console.warn(
    "[whatsapp] Ningún proveedor configurado. " +
      "Configura TWILIO_ACCOUNT_SID+TWILIO_AUTH_TOKEN o CALLMEBOT_API_KEY en Vercel."
  );
  return { sent: false, provider: "none", error: "Sin proveedor configurado" };
}

/**
 * Genera el mensaje de confirmación para el estudiante.
 */
export function buildConfirmationMessage(params: {
  estudianteNombre: string;
  materia: string;
  originalName: string;
  recibidoEn: string;
  tareaId: string;
}): string {
  const fecha = new Date(params.recibidoEn).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    `✅ *Tarea recibida correctamente*\n\n` +
    `Hola ${params.estudianteNombre},\n\n` +
    `Tu tarea fue recibida exitosamente.\n\n` +
    `📚 *Materia:* ${params.materia}\n` +
    `📄 *Archivo:* ${params.originalName}\n` +
    `🕐 *Fecha y hora:* ${fecha}\n` +
    `🔖 *Código:* ${params.tareaId.slice(0, 8).toUpperCase()}\n\n` +
    `Guarda este mensaje como comprobante. ¡Éxitos! 🎓`
  );
}

