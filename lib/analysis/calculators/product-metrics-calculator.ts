/**
 * Расчёт метрик по товарам
 */

import { round } from "../data-utils";
import { isReturnChargeType } from "../constants";
import type { AggregatedOrder, ProductMetrics } from "../types";

export class ProductMetricsCalculator {
  /**
   * Рассчитывает метрики по товарам
   */
  calculateProductMetrics(
    orders: AggregatedOrder[],
    costData?: Map<string, number>
  ): ProductMetrics[] {
    const productMap = new Map<string, AggregatedOrder[]>();

    // Группируем заказы по SKU/артикулу
    for (const order of orders) {
      const key = order.sku || order.article;
      if (!key) continue;

      if (!productMap.has(key)) {
        productMap.set(key, []);
      }
      productMap.get(key)!.push(order);
    }

    const metrics: ProductMetrics[] = [];

    Array.from(productMap.entries()).forEach(([key, productOrders]) => {
      const firstOrder = productOrders[0];

      let totalSold = 0;
      let totalReturned = 0;
      let ordersCount = 0;
      let ordersWithReturnsCount = 0; // Количество заказов с возвратными типами начислений
      let totalRevenue = 0;
      let totalCommission = 0;
      let totalLogistics = 0;
      let totalReturnsAmount = 0;
      let totalAmountRub = 0;
      let totalCost = 0;
      let totalCostSold = 0;
      let hasCost = false;

      for (const order of productOrders) {
        const qty = order.quantity || 1;
        
        // Проверяем, есть ли у заказа возвратные типы начислений
        // ВАЖНО: Возвраты считаем строго по заказам, у которых есть возвратные типы начислений
        const hasReturnChargeTypes = order.chargeTypes?.some(chargeType => 
          isReturnChargeType(chargeType)
        ) || false;
        
        // Считаем все заказы (кроме отмененных и в работе)
        if (order.status === "completed" || order.status === "partial_return" || order.status === "returned") {
          ordersCount++;
        }
        
        // Считаем заказы с возвратами только если есть возвратные типы начислений
        if (hasReturnChargeTypes) {
          ordersWithReturnsCount++;
        }
        
        if (order.status === "completed") {
          // Завершенный заказ - полностью учитываем в выручке
          totalSold += qty;
          totalRevenue += order.grossRevenue;

          if (order.grossRevenue > 0 && order.hasCost && order.costPerUnit !== undefined) {
            totalCostSold += order.totalCost || (order.costPerUnit * qty);
            hasCost = true;
          }
        } else if (order.status === "partial_return") {
          // Частичный возврат - учитываем в выручке, но вычитаем сумму возврата
          // grossRevenue = revenueAmount + pointsAmount (выручка от проданной части)
          // returnAmount - сумма возврата (положительное число)
          // Выручка от проданной части = grossRevenue (уже без возврата)
          
          // Учитываем заказ как частично проданный
          totalSold += qty; // Вся партия, но часть возвращена
          ordersCount++;
          
          // Частичный возврат всегда считается заказом с возвратом
          ordersWithReturnsCount++;
          
          // Выручка от проданной части (grossRevenue уже не содержит возврат)
          if (order.grossRevenue > 0) {
            totalRevenue += order.grossRevenue;
          }
          
          // Учитываем возврат
          totalReturned += qty; // Вся партия считается с возвратом
          totalReturnsAmount += Math.abs(order.returnAmount || 0);

          if (order.grossRevenue > 0 && order.hasCost && order.costPerUnit !== undefined) {
            // Себестоимость считаем пропорционально проданной части
            // Ориентируемся на соотношение grossRevenue к общей сумме заказа
            // Если grossRevenue > 0, значит часть товаров продана
            // Приблизительно: себестоимость проданной части
            // Используем пропорцию: если grossRevenue составляет X% от (grossRevenue + returnAmount), 
            // то и себестоимость берем X% от totalCost
            const totalOrderValue = order.grossRevenue + Math.abs(order.returnAmount || 0);
            if (totalOrderValue > 0) {
              const soldRatio = order.grossRevenue / totalOrderValue;
              const costForSold = (order.totalCost || (order.costPerUnit * qty)) * soldRatio;
              totalCostSold += costForSold;
            } else {
              // Если totalOrderValue = 0, значит весь заказ возвращен, себестоимость не учитываем
            }
            hasCost = true;
          }
        } else if (order.status === "returned") {
          // Полный возврат - не учитываем в выручке
          totalReturned += qty;
          ordersWithReturnsCount++; // Полный возврат всегда считается заказом с возвратом
          totalReturnsAmount += Math.abs(order.returnAmount || 0);
        } else {
          // Другие статусы (cancelled, in_progress) - не считаем как заказы с возвратами
          // Но если у них есть возвратные типы начислений, учитываем
          if (hasReturnChargeTypes) {
            ordersWithReturnsCount++;
          }
        }

        // Всегда учитываем комиссию, логистику и итоговую сумму (для netAmount)
        totalCommission += order.commissionAmount;
        totalLogistics += order.logisticsAmount;
        totalAmountRub += order.totalAmountRub;

        // Себестоимость для всех заказов (для расчета общей себестоимости)
        if (order.grossRevenue > 0 && order.hasCost && order.totalCost !== undefined) {
          totalCost += order.totalCost;
          hasCost = true;
        }
      }

      const netAmount = totalAmountRub;
      const marginPercent = totalRevenue > 0 ? (netAmount / totalRevenue) * 100 : 0;
      // Процент возвратов = количество заказов с возвратными типами начислений / общее количество заказов
      // ВАЖНО: Считаем только по заказам, у которых есть возвратные типы начислений
      const returnRate = ordersCount > 0
        ? (ordersWithReturnsCount / ordersCount) * 100
        : 0;
      const avgCommission = totalRevenue > 0 ? (totalCommission / totalRevenue) * 100 : 0;

      const productName = firstOrder.productName || "";
      const article = firstOrder.article || "";

      // Получаем себестоимость из файла себестоимости
      let costPerUnit: number | undefined = undefined;
      let productHasCost = false;

      if (costData && article) {
        if (costData.has(article)) {
          costPerUnit = costData.get(article);
          productHasCost = true;
        } else {
          // Попытка без учета регистра
          const lowerArticle = article.toLowerCase();
          for (const [costArt, cost] of Array.from(costData.entries())) {
            if (costArt.toLowerCase() === lowerArticle) {
              costPerUnit = cost;
              productHasCost = true;
              break;
            }
          }

          // Попытка без пробелов
          if (costPerUnit === undefined) {
            const noSpacesArticle = article.replace(/\s/g, "");
            for (const [costArt, cost] of Array.from(costData.entries())) {
              if (costArt.replace(/\s/g, "").toLowerCase() === noSpacesArticle.toLowerCase()) {
                costPerUnit = cost;
                productHasCost = true;
                break;
              }
            }
          }
        }
      }

      const netProfit = (productHasCost && totalCostSold > 0 && totalRevenue > 0)
        ? netAmount - totalCostSold
        : undefined;
      const profitMarginPercent = netProfit !== undefined && totalRevenue > 0
        ? (netProfit / totalRevenue) * 100
        : undefined;

      metrics.push({
        sku: firstOrder.sku || key,
        article: article,
        productName: productName,
        totalSold,
        totalReturned,
        ordersCount,
        returnsCount: ordersWithReturnsCount, // Количество заказов с возвратами
        totalRevenue: round(totalRevenue),
        totalCommission: round(totalCommission),
        totalLogistics: round(totalLogistics),
        totalReturnsAmount: round(totalReturnsAmount),
        netAmount: round(netAmount),
        costPerUnit: costPerUnit !== undefined ? round(costPerUnit) : undefined,
        totalCost: (productHasCost && totalCostSold > 0) ? round(totalCostSold) : undefined,
        netProfit: netProfit !== undefined ? round(netProfit) : undefined,
        avgOrderValue: ordersCount > 0 ? round(totalRevenue / ordersCount) : 0,
        avgCommissionPercent: round(avgCommission, 1),
        marginPercent: round(marginPercent, 1),
        profitMarginPercent: profitMarginPercent !== undefined ? round(profitMarginPercent, 1) : undefined,
        returnRate: round(returnRate, 1),
        hasCost: productHasCost,
        workScheme: firstOrder.workScheme,
        platform: firstOrder.platform,
      });
    });

    return metrics.sort((a, b) => b.netAmount - a.netAmount);
  }
}
