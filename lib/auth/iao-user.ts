/**
 * Получение iao_user_id в server-side роутах.
 *
 * Если cookie нет — возвращается стабильный placeholder "anonymous" (middleware
 * ставит cookie на следующем запросе). Новый UUID генерится middleware'ом,
 * чтобы не плодить его в каждом API-обработчике.
 */

import { cookies } from "next/headers";

export const IAO_USER_COOKIE = "iao_user_id";
export const ANON_USER_ID = "anonymous";

export function getIaoUserId(): string {
  const store = cookies();
  const val = store.get(IAO_USER_COOKIE)?.value;
  if (!val || val.length < 16) return ANON_USER_ID;
  return val;
}
