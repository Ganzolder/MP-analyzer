/**
 * Утилита для пересчёта анализа с исключением указанных артикулов
 * Полностью пересчитывает все метрики, исключая начисления по указанным SKU
 */

import type { FrontendAnalysisResult, ProductData } from "@/lib/types/analysis";
import type { AggregatedOrder, NonOrderCharge, SubscriptionCharge, ProductMetrics, ChargeRow } from "@/lib/analysis/types";
import { SummaryCalculator } from "../calculators/summary-calculator";
import { ChargeTypeBreakdownCalculator } from "../calculators/charge-type-breakdown-calculator";
import { DailyMetricsCalculator } from "../calculators/daily-metrics-calculator";
import { CostReportsCalculator } from "../calculators/cost-reports-calculator";
import { getChargeGroup } from "../charge-type-groups";
import { getChargeCategory } from "../constants";

const summaryCalculator = new SummaryCalculator();
const chargeTypeBreakdownCalculator = new ChargeTypeBreakdownCalculator();
const dailyMetricsCalculator = new DailyMetricsCalculator();
const costReportsCalculator = new CostReportsCalculator();

/**
 * Пересчитывает результаты анализа, исключая указанные артикулы (SKU)
 * 
 * @param originalData - Исходные данные анализа
 * @param excludedSkus - Массив SKU для исключения (если пустой, возвращает исходные данные)
 * @returns Пересчитанные данные анализа
 */
export function recalculateWithExclusions(
  originalData: FrontendAnalysisResult,
  excludedSkus: string[]
): FrontendAnalysisResult {
  // Если нет исключённых товаров, возвращаем исходные данные
  if (excludedSkus.length === 0) {
    return originalData;
  }

  const excludedSet = new Set(excludedSkus);

  // 1. Фильтруем заказы - исключаем все заказы с указанными SKU
  const filteredOrders = (originalData.orders || []).filter(
    (order) => {
      const orderSku = order.sku || order.article || "";
      return !excludedSet.has(orderSku);
    }
  );

  // 2. Фильтруем товары
  const filteredTopProducts = (originalData.topProducts || []).filter(
    (p) => !excludedSet.has(p.sku)
  );
  const filteredWorstProducts = (originalData.worstProducts || []).filter(
    (p) => !excludedSet.has(p.sku)
  );

  // 3. Фильтруем productMetrics
  const filteredProductMetrics: ProductMetrics[] = (originalData.productMetrics || []).filter(
    (pm) => {
      const pmSku = pm.sku || pm.article || "";
      return !excludedSet.has(pmSku);
    }
  );

  // 4. Фильтруем nonOrderCharges - исключаем те, что связаны с исключёнными товарами
  // (nonOrderCharges обычно не привязаны к конкретным товарам, но на всякий случай фильтруем)
  const filteredNonOrderCharges: NonOrderCharge[] = (originalData.nonOrderCharges || []).filter(
    (charge) => {
      // Если у charge есть SKU, проверяем его
      const chargeSku = (charge as any).sku || (charge as any).article || "";
      if (chargeSku) {
        return !excludedSet.has(chargeSku);
      }
      // Если SKU нет, оставляем (это общие начисления)
      return true;
    }
  );

  // 5. Фильтруем subscriptions (обычно не привязаны к товарам)
  const filteredSubscriptions = originalData.subscriptions || [];

  // 6. Пересчитываем summary используя SummaryCalculator
  const recalculatedSummary = summaryCalculator.calculateSummary(
    filteredOrders,
    filteredNonOrderCharges,
    filteredSubscriptions,
    filteredProductMetrics
  );

  // 7. Пересчитываем costBreakdown
  const recalculatedCostBreakdown = summaryCalculator.calculateCostBreakdown(
    filteredOrders,
    filteredNonOrderCharges,
    filteredSubscriptions
  );

  // 8. Пересчитываем dailyMetrics
  const recalculatedDailyMetrics = dailyMetricsCalculator.calculateDailyMetrics(
    filteredOrders
  );

  // 9. Пересчитываем profitTrends на основе dailyMetrics
  const recalculatedProfitTrends = recalculatedDailyMetrics.map((dm) => ({
    date: dm.date,
    revenue: dm.revenue || 0,
    costs: dm.totalCost || 0,
    profit: (dm.netAmount || 0) - (dm.totalCost || 0),
    orders: dm.ordersCount || 0,
    totalCost: dm.totalCost || 0,
    netProfit: (dm.netAmount || 0) - (dm.totalCost || 0),
  }));

  // 10. Пересчитываем chargeTypeBreakdown на основе отфильтрованных заказов
  // Создаём виртуальные chargeRows из отфильтрованных заказов
  const virtualChargeRows = createVirtualChargeRows(filteredOrders);
  const recalculatedChargeTypeBreakdown = chargeTypeBreakdownCalculator.calculateChargeTypeBreakdown(
    virtualChargeRows
  );

  // 11. Фильтруем другие списки заказов
  const filteredReturnedOrders = (originalData.returnedOrders || []).filter(
    (order) => {
      const orderSku = order.sku || order.article || "";
      return !excludedSet.has(orderSku);
    }
  );
  const filteredTopOrders = (originalData.topOrders || []).filter(
    (order) => {
      const orderSku = order.sku || order.article || "";
      return !excludedSet.has(orderSku);
    }
  );

  // 12. Пересчитываем costReports на основе отфильтрованных данных
  const originalArticlesComparison = (originalData as any).costReports?.articlesComparison || {
    costArticles: [],
    orderArticles: [],
  };
  const recalculatedCostReports = costReportsCalculator.generateCostReports(
    filteredOrders,
    filteredProductMetrics,
    originalArticlesComparison
  );

  // 13. Собираем результат
  const result: FrontendAnalysisResult = {
    ...originalData,
    // Заказы и товары
    orders: filteredOrders,
    topProducts: filteredTopProducts,
    worstProducts: filteredWorstProducts,
    returnedOrders: filteredReturnedOrders,
    topOrders: filteredTopOrders,
    productMetrics: filteredProductMetrics,
    // Начисления
    nonOrderCharges: filteredNonOrderCharges,
    subscriptions: filteredSubscriptions,
    // Пересчитанные метрики
    summary: recalculatedSummary,
    costBreakdown: recalculatedCostBreakdown,
    dailyMetrics: recalculatedDailyMetrics,
    profitTrends: recalculatedProfitTrends,
    chargeTypeBreakdown: recalculatedChargeTypeBreakdown,
    // Пересчитанные отчёты по себестоимости
    costReports: recalculatedCostReports as any,
  };

  return result;
}

/**
 * Создаёт виртуальные ChargeRow из отфильтрованных заказов для пересчёта chargeTypeBreakdown
 */
function createVirtualChargeRows(filteredOrders: AggregatedOrder[]): ChargeRow[] {
  const virtualChargeRows: ChargeRow[] = [];

  for (const order of filteredOrders) {
    if (!order.chargeTypes || !Array.isArray(order.chargeTypes) || order.chargeTypes.length === 0) {
      continue;
    }

    // Для каждого типа начисления в заказе создаём виртуальную строку
    // Распределяем суммы из заказа по типам начислений
    for (const chargeType of order.chargeTypes) {
      let amount = 0;

      // Определяем сумму начисления в зависимости от категории
      const category = getChargeCategory(chargeType);
      
      // Подсчитываем количество типов начислений той же категории для пропорционального распределения
      const sameCategoryTypes = order.chargeTypes.filter(ct => getChargeCategory(ct) === category);
      const categoryCount = sameCategoryTypes.length || 1;

      switch (category) {
        case "revenue":
          amount = (order.revenueAmount || 0) / categoryCount;
          break;
        case "points":
          amount = (order.pointsAmount || 0) / categoryCount;
          break;
        case "commission":
          amount = (order.commissionAmount || 0) / categoryCount;
          break;
        case "logistics":
          amount = (order.logisticsAmount || 0) / categoryCount;
          break;
        case "acquiring":
          amount = (order.acquiringAmount || 0) / categoryCount;
          break;
        case "returnLogistics":
        case "returnRevenue":
        case "returnCommission":
        case "returnProcessing":
          const returnCategoryCount = order.chargeTypes.filter(ct => {
            const cat = getChargeCategory(ct);
            return cat === "returnLogistics" || cat === "returnRevenue" || 
                   cat === "returnCommission" || cat === "returnProcessing";
          }).length || 1;
          amount = (order.returnAmount || 0) / returnCategoryCount;
          break;
        default:
          const otherCategoryCount = order.chargeTypes.filter(ct => 
            getChargeCategory(ct) === "other"
          ).length || 1;
          amount = (order.otherFeesAmount || 0) / otherCategoryCount;
      }

      // Добавляем только если сумма значимая
      if (Math.abs(amount) > 0.01) {
        virtualChargeRows.push({
          chargeId: `${order.orderNumber}-${chargeType}-${virtualChargeRows.length}`,
          orderNumber: order.orderNumber,
          chargeDate: order.chargeDate,
          serviceGroup: getChargeGroup(chargeType),
          chargeType,
          article: order.article || "",
          sku: order.sku || "",
          productName: order.productName || "Без названия",
          quantity: order.quantity || 0,
          sellerPrice: order.sellerPrice || 0,
          orderDate: order.orderDate,
          platform: order.platform || "",
          workScheme: order.workScheme || "",
          ozonCommissionPercent: 0,
          localizationIndex: 0,
          avgDeliveryHours: 0,
          totalAmount: amount,
          isPoints: false,
        });
      }
    }
  }

  return virtualChargeRows;
}
