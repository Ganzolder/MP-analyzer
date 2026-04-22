/**
 * Централизованная загрузка переменных окружения для Supabase.
 * Используется и в браузере (только NEXT_PUBLIC_), и на сервере.
 */

export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

export interface SupabaseServerEnv extends SupabasePublicEnv {
  serviceRoleKey: string;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Отсутствует переменная окружения ${name}`);
  }
  return v;
}

export function getPublicSupabaseEnv(): SupabasePublicEnv {
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

export function getServerSupabaseEnv(): SupabaseServerEnv {
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}
