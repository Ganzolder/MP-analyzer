/**
 * Отчёты по себестоимости
 */

import { round } from "../data-utils";
import type { AggregatedOrder, ProductMetrics } from "../types";

export class CostReportsCalculator {
  /**
   * Генерирует отчёты по себестоимости
   */
  generateCostReports(
    orders: AggregatedOrder[],
    productMetrics: ProductMetrics[],
    articlesComparison: { costArticles: string[]; orderArticles: string[] }
  ): {
    productsWithCost: ProductMetrics[];
    productsWithoutCost: ProductMetrics[];
    ordersWithCost: AggregatedOrder[];
    ordersWithoutCost: AggregatedOrder[];
    totalCost: number;
    totalCostSold: number;
    totalNetProfit: number;
    articlesComparison: { costArticles: string[]; orderArticles: string[] };
  } {
    const productsWithCost: ProductMetrics[] = [];
    const productsWithoutCost: ProductMetrics[] = [];
    const ordersWithCost: AggregatedOrder[] = [];
    const ordersWithoutCost: AggregatedOrder[] = [];

    let totalCost = 0;
    let totalCostSold = 0;
    let totalNetProfit = 0;

    for (const product of productMetrics) {
      if (product.hasCost && product.costPerUnit !== undefined) {
        productsWithCost.push(product);

        if (product.totalRevenue > 0 && product.totalCost !== undefined) {
          totalCostSold += product.totalCost;
        }
        if (product.totalRevenue > 0 && product.netProfit !== undefined) {
          totalNetProfit += product.netProfit;
        }
      } else {
        productsWithoutCost.push(product);
      }
    }

    for (const order of orders) {
      const hasRevenue = order.grossRevenue > 0;

      if (order.hasCost && order.totalCost !== undefined && hasRevenue) {
        ordersWithCost.push(order);
        totalCost += order.totalCost;

        if (order.status === "completed") {
          totalCostSold += order.totalCost;
        }
      } else {
        ordersWithoutCost.push(order);
      }
    }

    return {
      productsWithCost,
      productsWithoutCost,
      ordersWithCost,
      ordersWithoutCost,
      totalCost: round(totalCost),
      totalCostSold: round(totalCostSold),
      totalNetProfit: round(totalNetProfit),
      articlesComparison,
    };
  }
}
