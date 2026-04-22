/**
 * Привязка себестоимости к товарам и расчёт COGS с учётом возвратов.
 *
 * Правила:
 *   - Себестоимость подтягивается по артикулу (строгое равенство trim+lower-case).
 *   - COGS за единицу возвращённого товара НЕ учитывается (товар физически возвращён и не продан).
 *     Итоговое COGS = costPerUnit * max(0, quantitySold - quantityReturned).
 *   - Если артикула нет или себестоимость не найдена — costPerUnit = null, cogs = 0, hasCost=false.
 *   - На уровне заказа agg.totalCost = Σ cogs по всем товарам.
 */

import type { Order, OrderItem } from "./../domain";

export interface CostApplyResult {
  /** Артикулы, которые были найдены в cost-мапе. */
  matchedArticles: Set<string>;
  /** Артикулы из заказов, которых не было в cost-мапе. */
  unmatchedArticles: Set<string>;
}

function norm(a: string | null | undefined): string {
  return (a || "").trim().toLowerCase();
}

export function applyCost(orders: Order[], costMap?: Map<string, number>): CostApplyResult {
  const matched = new Set<string>();
  const unmatched = new Set<string>();

  for (const order of orders) {
    let total = 0;
    let anyHasCost = false;

    for (const shipment of order.shipments) {
      for (const item of shipment.items) {
        applyItemCost(item, costMap, matched, unmatched);
        if (item.costPerUnit != null) anyHasCost = true;
        total += item.cogs;
      }
    }

    order.totalCost = roundTo2(total);
    order.hasCost = anyHasCost;
  }

  return {
    matchedArticles: matched,
    unmatchedArticles: unmatched,
  };
}

function applyItemCost(
  item: OrderItem,
  costMap: Map<string, number> | undefined,
  matched: Set<string>,
  unmatched: Set<string>
): void {
  item.costPerUnit = null;
  item.cogs = 0;

  if (!item.article) return;

  const key = norm(item.article);
  if (!key) return;

  let unit: number | undefined;
  if (costMap) {
    unit = costMap.get(item.article) ?? costMap.get(key);
    // fallback: поискать по lower-case всех ключей
    if (unit == null) {
      for (const [k, v] of costMap) {
        if (norm(k) === key) {
          unit = v;
          break;
        }
      }
    }
  }

  if (unit == null || !(unit > 0)) {
    unmatched.add(item.article);
    return;
  }

  matched.add(item.article);
  item.costPerUnit = unit;
  const effectiveSold = Math.max(0, (item.quantitySold || 0) - (item.quantityReturned || 0));
  item.cogs = roundTo2(unit * effectiveSold);
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}
