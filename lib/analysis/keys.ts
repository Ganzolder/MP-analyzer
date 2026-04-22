/**
 * Работа с ID начисления: извлечение ключа заказа и суффикса отправления.
 *
 * Правила (ТЗ):
 * - "orderKey" = первые цифры до первого дефиса. Если дефисов нет — все цифры подряд.
 * - "shipmentSuffix" = всё после первого дефиса, нормализованное (уникальная строка отправления
 *   в рамках заказа). Если дефисов нет — null (одно отправление без маркировки).
 * - Пустой/подписочный chargeId (например "07.10.25-07.11.25") — не является заказом.
 *
 * Примеры:
 *   "79224088"          -> orderKey="79224088", shipmentSuffix=null
 *   "79224088-0238"     -> orderKey="79224088", shipmentSuffix="0238"
 *   "79224088-0238-3"   -> orderKey="79224088", shipmentSuffix="0238-3"
 *   "07.10.25-07.11.25" -> null (подписка)
 *   ""                  -> null
 */

const SUBSCRIPTION_DATE_PATTERN = /^\d{2}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}$/;

/** Возвращает ключ заказа или null, если ID не относится к заказу. */
export function extractOrderKey(chargeId: string | null | undefined): string | null {
  if (!chargeId) return null;
  const trimmed = String(chargeId).trim();
  if (!trimmed) return null;

  if (SUBSCRIPTION_DATE_PATTERN.test(trimmed)) {
    return null;
  }

  const firstDashIdx = trimmed.indexOf("-");
  const prefix = firstDashIdx === -1 ? trimmed : trimmed.slice(0, firstDashIdx);

  const digitsOnly = prefix.replace(/\D/g, "");
  if (!digitsOnly) return null;

  return digitsOnly;
}

/**
 * Возвращает суффикс отправления (всё после первого дефиса) или null.
 * Для "79224088-0238-3" возвращает "0238-3" (уникально идентифицирует отправление
 * внутри заказа).
 */
export function extractShipmentSuffix(chargeId: string | null | undefined): string | null {
  if (!chargeId) return null;
  const trimmed = String(chargeId).trim();
  if (!trimmed) return null;
  if (SUBSCRIPTION_DATE_PATTERN.test(trimmed)) return null;

  const firstDashIdx = trimmed.indexOf("-");
  if (firstDashIdx === -1) return null;

  const suffix = trimmed.slice(firstDashIdx + 1).trim();
  return suffix || null;
}

/**
 * True, если chargeId относится к какому-либо заказу (не пустой и не подписка).
 */
export function isOrderCharge(chargeId: string | null | undefined): boolean {
  return extractOrderKey(chargeId) !== null;
}

/**
 * True, если chargeId похож на запись подписки/периода (дата-дата).
 */
export function isSubscriptionCharge(chargeId: string | null | undefined): boolean {
  if (!chargeId) return false;
  return SUBSCRIPTION_DATE_PATTERN.test(String(chargeId).trim());
}
