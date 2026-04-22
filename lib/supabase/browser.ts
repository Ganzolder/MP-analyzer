/**
 * Supabase-клиент для браузера.
 * Использует anon-ключ; чтение данных идёт через API-роуты, так что этот клиент
 * нужен только для storage/edge-функций в будущем.
 */

"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv } from "./env";

let _client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (_client) return _client;
  const env = getPublicSupabaseEnv();
  _client = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
