/**
 * Ограничение истории импортов: хранится до N последних на пользователя.
 * Старые импорты удаляются каскадно.
 */

import "server-only";
import { getSupabaseServerClient } from "./server";

export const HISTORY_LIMIT = 3;

/**
 * Оставляет только N свежих импортов у пользователя, остальное удаляет.
 * Вызывать ПОСЛЕ успешного saveImport — чтобы при неудаче сохранения
 * пользователь не потерял прошлые данные.
 */
export async function enforceHistoryLimit(
  iaoUserId: string,
  limit: number = HISTORY_LIMIT
): Promise<{ removed: string[] }> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("mp_imports")
    .select("id, created_at")
    .eq("iao_user_id", iaoUserId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`enforceHistoryLimit: ${error.message}`);

  const all = data ?? [];
  if (all.length <= limit) return { removed: [] };

  const toRemove = all.slice(limit).map((r) => r.id as string);
  const { error: delErr } = await supabase
    .from("mp_imports")
    .delete()
    .eq("iao_user_id", iaoUserId)
    .in("id", toRemove);
  if (delErr) throw new Error(`enforceHistoryLimit delete: ${delErr.message}`);

  return { removed: toRemove };
}
