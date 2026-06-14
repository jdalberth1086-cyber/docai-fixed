/**
 * supabase-server.ts — Clientes Supabase para uso en servidor
 *
 * FIXES aplicados:
 * 1. Validación de variables de entorno en runtime (errores claros si faltan)
 * 2. createAdminClient: lanza error descriptivo si SERVICE_ROLE_KEY no está
 */
import { createServerClient as _createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variable de entorno requerida no configurada: ${name}. Verifica tu .env.local o las variables de entorno en Vercel.`
    );
  }
  return value;
}

// Server client — Server Components y Route Handlers
export async function createServerClient() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const cookieStore = await cookies();
  return _createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet: any[]){
        try {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component — ignorar error de escritura de cookies
        }
      },
    },
  });
}

// Admin client — bypasses RLS, solo para uso en API routes del servidor
// NUNCA usar en Client Components ni exponer al frontend
export function createAdminClient() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createSupabaseAdminClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

