/**
 * Supabase-клиент для server-side кода (API-роутов, server components).
 * Использует service-role-ключ → RLS игнорируется, данные фильтруются вручную по iao_user_id.
 *
 * ВАЖНО: этот модуль нельзя импортировать в клиентский код.
 */

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabaseEnv } from "./env";

let _client: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  if (_client) return _client;
  const env = getServerSupabaseEnv();
  _client = createClient(env.url, env.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: { "X-Client-Info": "mp-analyzer-server" },
    },
  });
  return _client;
}
