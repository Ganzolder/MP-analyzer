/**
 * Идентификация проблемных зон
 */

import { round } from "../data-utils";
import type { AggregatedOrder, ProductMetrics, CostBreakdown, ProblemArea } from "../types";

export class ProblemIdentifier {
  /**
   * Определяет проблемные зоны
   */
  identifyProblemAreas(
    orders: AggregatedOrder[],
    products: ProductMetrics[],
    costs: CostBreakdown
  ): ProblemArea[] {
    const problems: ProblemArea[] = [];

    // Высокий процент возвратов
    const highReturnProducts = products.filter(p => p.returnRate > 10);
    if (highReturnProducts.length > 0) {
      problems.push({
        type: "high_returns",
        severity: highReturnProducts.length > 5 ? "high" : "medium",
        title: "Высокий процент возвратов",
        description: `${highReturnProducts.length} товаров с возвратами выше 10%`,
        affectedItems: highReturnProducts.slice(0, 5).map(p => p.sku || p.article),
        potentialLoss: round(highReturnProducts.reduce((sum, p) => sum + p.totalReturnsAmount, 0)),
        recommendation: "Улучшите описания, фотографии и размерные сетки",
      });
    }

    // Убыточные товары
    const unprofitableProducts = products.filter(p => p.netAmount < 0);
    if (unprofitableProducts.length > 0) {
      problems.push({
        type: "negative_margin",
        severity: "critical",
        title: "Убыточные товары",
        description: `${unprofitableProducts.length} товаров продаются в минус`,
        affectedItems: unprofitableProducts.slice(0, 5).map(p => p.sku || p.article),
        potentialLoss: round(Math.abs(unprofitableProducts.reduce((sum, p) => sum + p.netAmount, 0))),
        recommendation: "Пересмотрите цены или снимите с продажи",
      });
    }

    // Штрафы
    if (costs.penalties > 500) {
      problems.push({
        type: "penalties",
        severity: costs.penalties > 3000 ? "high" : "medium",
        title: "Штрафы от маркетплейса",
        description: `Сумма штрафов: ${costs.penalties.toLocaleString()} ₽`,
        affectedItems: [],
        potentialLoss: costs.penalties,
        recommendation: "Проанализируйте причины штрафов",
      });
    }

    // Высокая комиссия
    const highCommissionProducts = products.filter(p => p.avgCommissionPercent > 20);
    if (highCommissionProducts.length > 3) {
      problems.push({
        type: "high_commission",
        severity: "medium",
        title: "Высокая комиссия",
        description: `${highCommissionProducts.length} товаров с комиссией выше 20%`,
        affectedItems: highCommissionProducts.slice(0, 5).map(p => p.sku || p.article),
        potentialLoss: round(highCommissionProducts.reduce((sum, p) => sum + p.totalCommission, 0) * 0.2),
        recommendation: "Рассмотрите смену категории товаров",
      });
    }

    return problems.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.severity] - order[b.severity];
    });
  }
}
