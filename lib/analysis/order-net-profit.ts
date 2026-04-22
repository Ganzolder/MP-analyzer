import type { AggregatedOrder } from "./types";

/**
 * Чистая прибыль по одному заказу (как в расшифровке ProductSalesAnalytics).
 * Сумма по заказам товара должна совпадать с netProfit в ProductMetrics.
 */
export function getOrderNetProfitForDisplay(order: AggregatedOrder): number {
  const hasRevenue = (order.grossRevenue || 0) > 0;
  const hasCost =
    hasRevenue && order.totalCost !== undefined && order.totalCost > 0;
  return hasCost
    ? (order.totalAmountRub || 0) - (order.totalCost || 0)
    : order.totalAmountRub || 0;
}
