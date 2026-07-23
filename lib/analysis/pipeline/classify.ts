/**
 * Классификация заказов по правилам ТЗ.
 *
 * Порядок проверки:
 *   1) Нет товаров в отправлениях → incomplete.
 *   2) В типах начислений есть отмена заказа (индекс ошибок+отмена и т.п.) → cancelled.
 *   3) Нет положительной «Выручка» (totals.revenue <= 0): при return-строках —
 *      сначала полный возврат, если qty по returnProcessing = logistics + returnLogistics;
 *      иначе full_return / incomplete по позициям; **partial_return не присваивается** без revenue>0.
 *   4) Есть выручка (totals.revenue > 0) и есть денежный возврат
 *      (returnRevenue ≠ 0 и/или нетто по «Возврат выручки») или сочетание
 *      с return-логистикой — full_return / partial_return **по нетто**:
 *      - полный возврат: нетто выручка ≈ 0 (Выручка + Возврат выручки) **и** нетто эквайринга ≈ 0;
 *      - частичный: есть положительная выручка, не полный сценарий, есть движение «Возврат выручки»;
 *      - только физ. возвраты (логистика) без «Возврат выручки» в отчёте → incomplete, не partial_return.
 *   5) Если возврата в деньгах нет и есть все 4 типа (acquiring + logistics + revenue + commission) → success.
 *   6) Если есть выручка, нет «Возврат выручки» в totals, нет эквайринга, нет return-признаков
 *      → success и isFromPreviousPeriod (оплата в прошлом отчёте).
 *   7) Иначе → incomplete.
 */

import { isOrderCancelledChargeType } from "../charge-types";
import type { Order, OrderClassification, Shipment, ShipmentClassification } from "../domain";

/** Допуск по рублям (агрегаты из отчёта) */
const MONEY_EPS = 0.5;

function orderHasCancellationCharge(order: Order): boolean {
  for (const ct of order.chargeTypes) {
    if (isOrderCancelledChargeType(ct)) return true;
  }
  return false;
}

/** Сумма единиц «Обработка отмен/возвратов…» = логистика + обратная логистика (см. consolidate). */
function isFullReturnByCancelQty(order: Order): boolean {
  const ref = order.qtySumLogistics + order.qtySumReturnLogistics;
  return order.qtySumReturnProcessing > 0 && order.qtySumReturnProcessing === ref;
}

function setShipmentStatusesFromItems(order: Order): void {
  for (const s of order.shipments) {
    const { sold, returned } = totalsFor(s);
    s.status = shipmentStatus(sold, returned);
  }
}

export function classifyOrders(orders: Order[]): Order[] {
  for (const order of orders) {
    const hasAnyItem = order.shipments.some((s) => s.items.length > 0);
    const t = order.totals;

    if (!hasAnyItem) {
      order.classification = "incomplete";
      for (const s of order.shipments) s.status = "unknown";
      continue;
    }

    if (orderHasCancellationCharge(order)) {
      order.classification = "cancelled";
      for (const s of order.shipments) s.status = "unknown";
      continue;
    }

    // Нет положительной «Выручка» (сумма по типу).
    if (t.revenue <= 0) {
      if (order.hasReturnLogisticsOrProcessing) {
        if (isFullReturnByCancelQty(order)) {
          order.classification = "full_return";
          setShipmentStatusesFromItems(order);
        } else {
          classifyReturnsWithoutPositiveRevenue(order);
        }
      } else {
        order.classification = "incomplete";
        for (const s of order.shipments) s.status = "unknown";
      }
      continue;
    }

    // Есть totals.revenue > 0: «начисление выручка».
    if (order.hasReturnLogisticsOrProcessing || t.returnRevenue !== 0) {
      classifyReturnsWithPositiveRevenue(order);
      continue;
    }

    // В отчёте за период есть «Выручка», нет «Возврат выручки», нет эквайринга,
    // нет return-логистики/проч. — остаток по прошлому отчёту.
    if (t.returnRevenue === 0 && !order.hasAcquiring) {
      order.classification = "success";
      order.isFromPreviousPeriod = true;
      for (const s of order.shipments) {
        s.status = s.items.length > 0 ? "delivered" : "unknown";
      }
      continue;
    }

    if (order.hasAcquiring && order.hasLogistics && order.hasRevenue && order.hasCommission) {
      order.classification = "success";
      for (const s of order.shipments) s.status = "delivered";
    } else {
      order.classification = "incomplete";
      for (const s of order.shipments) s.status = s.items.length > 0 ? "unknown" : "unknown";
    }
  }
  return orders;
}

/**
 * Возвраты при totals.revenue <= 0 (нет статьи «Выручка» в плюс): только по позициям, без money partial.
 */
function classifyReturnsWithoutPositiveRevenue(order: Order): void {
  setShipmentStatusesFromItems(order);

  let totalSold = 0;
  let totalReturned = 0;
  for (const s of order.shipments) {
    const { sold, returned } = totalsFor(s);
    totalSold += sold;
    totalReturned += returned;
  }

  const hasAnyDelivered = order.shipments.some((s) => s.status === "delivered");
  const allReturned =
    order.shipments.length > 0 && order.shipments.every((s) => s.status === "returned");

  let classification: OrderClassification;
  if (allReturned || (totalSold > 0 && totalReturned >= totalSold)) {
    classification = "full_return";
  } else if (totalReturned > 0 || !hasAnyDelivered) {
    classification = "incomplete";
  } else {
    classification = order.hasAcquiring && order.hasLogistics && order.hasRevenue && order.hasCommission
      ? "success"
      : "incomplete";
  }
  order.classification = classification;
}

/**
 * Про «возврат в деньгах»: есть положительная выручка; полный/частичный — по нетто выручки и эквайринга.
 * Только «Обратная логистика» без «Возврат выручки» — не partial_return.
 */
function classifyReturnsWithPositiveRevenue(order: Order): void {
  const t = order.totals;
  setShipmentStatusesFromItems(order);

  if (t.returnRevenue === 0) {
    // Есть return-логистика / обработка, но в отчёте ещё нет сторно по выручке.
    order.classification = "incomplete";
    return;
  }

  const netRevenue = t.revenue + t.returnRevenue;
  const netAcquiring = t.acquiring;
  const revenueAndReturnStornoed = Math.abs(netRevenue) < MONEY_EPS;
  const acquiringStornoed = Math.abs(netAcquiring) < MONEY_EPS;

  if (revenueAndReturnStornoed && acquiringStornoed) {
    order.classification = "full_return";
    return;
  }

  if (Math.abs(t.returnRevenue) > MONEY_EPS) {
    order.classification = "partial_return";
    return;
  }

  order.classification = "incomplete";
}

function totalsFor(shipment: Shipment): { sold: number; returned: number } {
  let sold = 0;
  let returned = 0;
  for (const it of shipment.items) {
    sold += it.quantitySold || 0;
    returned += it.quantityReturned || 0;
  }
  return { sold, returned };
}

function shipmentStatus(sold: number, returned: number): ShipmentClassification {
  if (sold <= 0 && returned <= 0) return "unknown";
  if (returned <= 0) return "delivered";
  if (returned >= sold) return "returned";
  return "partially_returned";
}
