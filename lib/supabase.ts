import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️ Las variables de entorno de Supabase no están configuradas en .env.local");
}

// Cliente público para el Frontend (respeta RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Cliente administrador para el Backend / Webhooks (omite RLS para operaciones del sistema)
export const getSupabaseAdmin = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY no está configurada en .env.local");
  }
  return createClient(supabaseUrl, serviceRoleKey);
};
