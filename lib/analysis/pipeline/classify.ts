/**
 * Классификация заказов по правилам ТЗ.
 *
 * Порядок проверки:
 *   1) Есть хотя бы одно отправление с товаром (article/productName).
 *   2) Если присутствуют строки "Обратная логистика" / "Обработка возвратов…" /
 *      "Обработка частичного невыкупа", считаем количества:
 *        - sumSold и sumReturned по всем отправлениям;
 *        - sumReturned >= sumSold (с минимальным дельта-допуском) → full_return;
 *        - иначе → partial_return.
 *      Статусы отправлений проставляются так же.
 *   3) Если возврата нет, но присутствуют все 4 обязательных типа начислений
 *      (acquiring + logistics + revenue + commission) → success.
 *   4) Иначе → incomplete.
 */

import type { Order, OrderClassification, Shipment, ShipmentClassification } from "../domain";

export function classifyOrders(orders: Order[]): Order[] {
  for (const order of orders) {
    const hasAnyItem = order.shipments.some((s) => s.items.length > 0);

    if (!hasAnyItem) {
      order.classification = "incomplete";
      for (const s of order.shipments) s.status = "unknown";
      continue;
    }

    if (order.hasReturnLogisticsOrProcessing) {
      classifyReturns(order);
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

function classifyReturns(order: Order): void {
  let totalSold = 0;
  let totalReturned = 0;
  for (const s of order.shipments) {
    const { sold, returned } = totalsFor(s);
    totalSold += sold;
    totalReturned += returned;
    s.status = shipmentStatus(sold, returned);
  }

  const hasAnyDelivered = order.shipments.some((s) => s.status === "delivered");
  const allReturned =
    order.shipments.length > 0 &&
    order.shipments.every((s) => s.status === "returned");

  let classification: OrderClassification;
  if (allReturned || (totalSold > 0 && totalReturned >= totalSold)) {
    classification = "full_return";
  } else if (totalReturned > 0 || !hasAnyDelivered) {
    classification = "partial_return";
  } else {
    classification = order.hasAcquiring && order.hasLogistics && order.hasRevenue && order.hasCommission
      ? "success"
      : "incomplete";
  }
  order.classification = classification;
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
