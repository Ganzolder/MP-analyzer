/**
 * Расчёт метрик по дням
 */

import { formatDate, round } from "../data-utils";
import type { AggregatedOrder, DailyMetrics } from "../types";

export class DailyMetricsCalculator {
  /**
   * Рассчитывает метрики по дням
   */
  calculateDailyMetrics(orders: AggregatedOrder[]): DailyMetrics[] {
    const byDate = new Map<string, AggregatedOrder[]>();

    for (const order of orders) {
      const dateKey = formatDate(order.chargeDate);
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, []);
      }
      byDate.get(dateKey)!.push(order);
    }

    const metrics: DailyMetrics[] = [];

    Array.from(byDate.entries()).forEach(([date, dayOrders]) => {
      let ordersCount = 0;
      let returnsCount = 0;
      let revenue = 0;
      let commission = 0;
      let logistics = 0;
      let returns = 0;
      let pointsAmount = 0;
      let totalCost = 0;

      for (const order of dayOrders) {
        if (order.status === "completed") {
          ordersCount++;
          revenue += order.grossRevenue;

          if (order.grossRevenue > 0 && order.hasCost && order.totalCost !== undefined) {
            totalCost += order.totalCost;
          }
        } else {
          returnsCount++;
          returns += order.returnAmount;
        }

        commission += order.commissionAmount;
        logistics += order.logisticsAmount;
        pointsAmount += order.pointsAmount;
      }

      const netAmount = round(revenue - commission - logistics - returns);
      const costRounded = round(totalCost);
      const netProfit = costRounded > 0 ? round(netAmount - costRounded) : undefined;

      metrics.push({
        date,
        ordersCount,
        returnsCount,
        revenue: round(revenue),
        commission: round(commission),
        logistics: round(logistics),
        returns: round(returns),
        netAmount,
        pointsAmount: round(pointsAmount),
        totalCost: costRounded > 0 ? costRounded : undefined,
        netProfit,
      });
    });

    return metrics.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
}
