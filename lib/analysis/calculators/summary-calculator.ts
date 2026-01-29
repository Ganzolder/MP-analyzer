/**
 * Расчёт сводки и затрат
 */

import { round } from "../data-utils";
import type {
  AggregatedOrder,
  NonOrderCharge,
  SubscriptionCharge,
  ProductMetrics,
  CostBreakdown,
} from "../types";

export class SummaryCalculator {
  /**
   * Рассчитывает сводку
   */
  calculateSummary(
    orders: AggregatedOrder[],
    nonOrderCharges: NonOrderCharge[],
    subscriptions: SubscriptionCharge[],
    productMetrics?: ProductMetrics[]
  ): {
    grossRevenue: number;
    revenueAmount: number;
    pointsAmount: number;
    ozonFees: number;
    netPayout: number;
    feesPercent: number;
    totalOrders: number;
    completedOrders: number;
    returnedOrders: number;
    partialReturns: number;
    cancelledOrders: number;
    totalProducts: number;
    avgOrderValue: number;
    avgCommissionPercent: number;
    returnRate: number;
    totalCost?: number;
    totalCostSold?: number;
    totalNetProfit?: number;
    productsWithCost?: number;
    productsWithoutCost?: number;
    ordersWithCost?: number;
    ordersWithoutCost?: number;
  } {
    let revenueAmount = 0;
    let pointsAmount = 0;
    let totalFees = 0;
    let netPayout = 0;
    let commissionSum = 0;
    let completedOrders = 0;
    let returnedOrders = 0;
    let partialReturns = 0;
    let cancelledOrders = 0;

    let totalCost = 0;
    let totalCostSold = 0;
    let productsWithCost = 0;
    let productsWithoutCost = 0;
    let ordersWithCost = 0;
    let ordersWithoutCost = 0;

    const products = new Set<string>();

    for (const order of orders) {
      revenueAmount += order.revenueAmount;
      pointsAmount += order.pointsAmount;
      totalFees += order.totalFees;
      netPayout += order.totalAmountRub;
      commissionSum += order.commissionAmount;

      if (order.hasCost && order.totalCost !== undefined) {
        ordersWithCost++;
        totalCost += order.totalCost;

        if (order.status === "completed" && order.grossRevenue > 0) {
          totalCostSold += order.totalCost;
        }
      } else {
        ordersWithoutCost++;
      }

      if (order.status === "cancelled") {
        cancelledOrders++;
      } else if (order.status === "completed") {
        completedOrders++;
      } else if (order.status === "returned") {
        returnedOrders++;
      } else if (order.status === "partial_return") {
        partialReturns++;
      }
      // Статус "in_progress" не учитывается в статистике (заказы в работе)

      if (order.sku || order.article) {
        products.add(order.sku || order.article);
      }
    }

    if (productMetrics) {
      for (const product of productMetrics) {
        if (product.hasCost && product.costPerUnit !== undefined) {
          productsWithCost++;
        } else {
          productsWithoutCost++;
        }
      }
    }

    for (const charge of nonOrderCharges) {
      netPayout += charge.totalAmountRub;
      if (charge.totalAmountRub < 0) {
        totalFees += Math.abs(charge.totalAmountRub);
      } else {
        // ВАЖНО: Добавляем к revenueAmount только те nonOrderCharges, которые действительно являются выручкой
        // Проверяем тип начисления - если это "Выручка" или "Баллы за скидки", добавляем к соответствующему полю
        const chargeType = (charge.chargeType || "").toLowerCase();
        if (chargeType.includes("выручка") || chargeType.includes("k@cg:0")) {
          revenueAmount += charge.totalAmountRub;
        } else if (chargeType.includes("баллы") || chargeType.includes("0;;k")) {
          pointsAmount += charge.totalAmountRub;
        } else {
          // Остальные положительные начисления (компенсации и т.д.) не считаем выручкой
          // Они уже учтены в netPayout
        }
      }
    }

    for (const sub of subscriptions) {
      netPayout += sub.totalAmount;
      totalFees += Math.abs(sub.totalAmount);
    }

    const grossRevenue = revenueAmount + pointsAmount;
    const feesPercent = grossRevenue > 0 ? (totalFees / grossRevenue) * 100 : 0;
    const returnRate = orders.length > 0
      ? (returnedOrders / orders.length) * 100
      : 0;
    const avgCommission = grossRevenue > 0 ? (commissionSum / grossRevenue) * 100 : 0;
    const totalNetProfit = totalCostSold > 0 ? netPayout - totalCostSold : undefined;

    return {
      grossRevenue: round(grossRevenue),
      revenueAmount: round(revenueAmount),
      pointsAmount: round(pointsAmount),
      ozonFees: round(totalFees),
      netPayout: round(netPayout),
      feesPercent: round(feesPercent, 1),
      totalOrders: orders.length,
      completedOrders,
      returnedOrders,
      partialReturns,
      cancelledOrders,
      totalProducts: products.size,
      avgOrderValue: completedOrders > 0 ? round(grossRevenue / completedOrders) : 0,
      avgCommissionPercent: round(avgCommission, 1),
      returnRate: round(returnRate, 1),
      totalCost: totalCost > 0 ? round(totalCost) : undefined,
      totalCostSold: totalCostSold > 0 ? round(totalCostSold) : undefined,
      totalNetProfit: totalNetProfit !== undefined ? round(totalNetProfit) : undefined,
      productsWithCost: productsWithCost > 0 ? productsWithCost : undefined,
      productsWithoutCost: productsWithoutCost > 0 ? productsWithoutCost : undefined,
      ordersWithCost: ordersWithCost > 0 ? ordersWithCost : undefined,
      ordersWithoutCost: ordersWithoutCost > 0 ? ordersWithoutCost : undefined,
    };
  }

  /**
   * Рассчитывает структуру затрат
   */
  calculateCostBreakdown(
    orders: AggregatedOrder[],
    nonOrderCharges: NonOrderCharge[],
    subscriptions: SubscriptionCharge[]
  ): CostBreakdown {
    let commission = 0;
    let logistics = 0;
    let returns = 0;
    let storage = 0;
    let advertising = 0;
    let penalties = 0;
    let subscriptionsCost = 0;
    let other = 0;

    for (const order of orders) {
      commission += order.commissionAmount;
      logistics += order.logisticsAmount;
      returns += order.returnAmount;
    }

    for (const charge of nonOrderCharges) {
      const type = charge.chargeType.toLowerCase();
      const amount = Math.abs(charge.totalAmountRub);

      if (type.includes("хранен") || type.includes("размещен")) {
        storage += amount;
      } else if (type.includes("реклам") || type.includes("продвиж") || type.includes("трафарет")) {
        advertising += amount;
      } else if (type.includes("штраф")) {
        penalties += amount;
      } else if (charge.totalAmountRub < 0) {
        other += amount;
      }
    }

    for (const sub of subscriptions) {
      subscriptionsCost += Math.abs(sub.totalAmount);
    }

    const total = commission + logistics + returns + storage + advertising + penalties + subscriptionsCost + other;

    return {
      commission: round(commission),
      logistics: round(logistics),
      returns: round(returns),
      storage: round(storage),
      advertising: round(advertising),
      penalties: round(penalties),
      subscriptions: round(subscriptionsCost),
      other: round(other),
      total: round(total),
    };
  }
}
