import type { AggregatedOrder } from "./types";

/**
 * Чистая прибыль по одному заказу: валовая по цене продавца − удержания Ozon − себестоимость
 * (согласовано с таблицей «Рентабельность заказов»). Старые данные — выплата − СС.
 */
export function getOrderNetProfitForDisplay(order: AggregatedOrder): number {
  if (order.grossBySellerPrice !== undefined && order.ozonFeesTotal !== undefined) {
    if (order.grossBySellerPrice === 0) {
      return order.totalAmountRub || 0;
    }
    const cost = order.totalCost && order.totalCost > 0 ? order.totalCost : 0;
    return order.grossBySellerPrice - order.ozonFeesTotal - cost;
  }
  const hasRevenue = (order.grossRevenue || 0) > 0;
  const hasCost =
    hasRevenue && order.totalCost !== undefined && order.totalCost > 0;
  return hasCost
    ? (order.totalAmountRub || 0) - (order.totalCost || 0)
    : order.totalAmountRub || 0;
}
