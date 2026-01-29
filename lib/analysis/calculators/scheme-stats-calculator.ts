/**
 * Статистика по схемам работы (FBO/FBS)
 */

import { round } from "../data-utils";
import type { AggregatedOrder } from "../types";

export class SchemeStatsCalculator {
  /**
   * Рассчитывает статистику по схемам
   */
  calculateSchemeStats(orders: AggregatedOrder[]): {
    fbo: { orders: number; amount: number };
    fbs: { orders: number; amount: number };
    other: { orders: number; amount: number };
  } {
    const stats = {
      fbo: { orders: 0, amount: 0 },
      fbs: { orders: 0, amount: 0 },
      other: { orders: 0, amount: 0 },
    };

    for (const order of orders) {
      const scheme = order.workScheme.toUpperCase();

      if (scheme.includes("FBO")) {
        stats.fbo.orders++;
        stats.fbo.amount += order.totalAmountRub;
      } else if (scheme.includes("FBS")) {
        stats.fbs.orders++;
        stats.fbs.amount += order.totalAmountRub;
      } else {
        stats.other.orders++;
        stats.other.amount += order.totalAmountRub;
      }
    }

    stats.fbo.amount = round(stats.fbo.amount);
    stats.fbs.amount = round(stats.fbs.amount);
    stats.other.amount = round(stats.other.amount);

    return stats;
  }
}
