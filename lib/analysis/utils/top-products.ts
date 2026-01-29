/**
 * Утилиты для работы с топ-товарами
 */

import type { ProductMetrics, AggregatedOrder } from "../types";

export class TopProductsHelper {
  /**
   * Получает топ товаров
   */
  getTopProducts(metrics: ProductMetrics[]): ProductMetrics[] {
    return [...metrics]
      .sort((a, b) => {
        const aValue = (a.netProfit !== undefined ? a.netProfit : a.netAmount) || 0;
        const bValue = (b.netProfit !== undefined ? b.netProfit : b.netAmount) || 0;
        return bValue - aValue;
      });
  }

  /**
   * Получает убыточные товары
   */
  getWorstProducts(metrics: ProductMetrics[], limit: number = Number.MAX_SAFE_INTEGER): ProductMetrics[] {
    return [...metrics]
      .filter(p => {
        if (p.totalRevenue === 0 && (p.netAmount === 0 || p.netAmount >= 0)) {
          return false;
        }

        const hasRevenue = p.totalRevenue > 0;
        const margin = p.marginPercent || 0;
        const returnRate = p.returnRate || 0;
        const netAmount = p.netAmount || 0;

        return (hasRevenue && margin < 15) || (hasRevenue && returnRate > 10) || netAmount < 0;
      })
      .sort((a, b) => {
        if (a.netAmount < 0 && b.netAmount >= 0) return -1;
        if (a.netAmount >= 0 && b.netAmount < 0) return 1;
        return (a.marginPercent || 0) - (b.marginPercent || 0);
      })
      .slice(0, limit);
  }

  /**
   * Получает топ заказов
   */
  getTopOrders(orders: AggregatedOrder[], limit: number): AggregatedOrder[] {
    return [...orders]
      .filter(o => o.status === "completed")
      .sort((a, b) => b.totalAmountRub - a.totalAmountRub)
      .slice(0, limit);
  }
}
