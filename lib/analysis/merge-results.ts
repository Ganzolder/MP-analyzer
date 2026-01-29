/**
 * Утилита для объединения результатов анализа нескольких файлов
 */
// @ts-nocheck

import type { AnalysisResult, AggregatedOrder, OrderStatus } from "./types";
import { getChargeCategory } from "./constants";

/**
 * Объединяет результаты анализа нескольких файлов в один общий отчёт
 */
export function mergeAnalysisResults(results: AnalysisResult[]): AnalysisResult {
  if (results.length === 0) {
    throw new Error("Необходимо хотя бы один результат для объединения");
  }

  if (results.length === 1) {
    return results[0];
  }

  // Базовый результат - первый файл
  const base = results[0];
  const merged: AnalysisResult = {
    id: base.id,
    fileName: `Объединённый отчёт (${results.length} файлов)`,
    analyzedAt: new Date(),
    period: {
      start: new Date(Math.min(...results.map(r => r.period.start.getTime()))),
      end: new Date(Math.max(...results.map(r => r.period.end.getTime()))),
      label: `${results.map(r => r.fileName).join(", ")}`,
    },
    summary: {
      grossRevenue: 0,
      revenueAmount: 0,
      pointsAmount: 0,
      ozonFees: 0,
      netPayout: 0,
      feesPercent: 0,
      totalOrders: 0,
      completedOrders: 0,
      returnedOrders: 0,
      partialReturns: 0,
      cancelledOrders: 0,
      totalProducts: 0,
      avgOrderValue: 0,
      avgCommissionPercent: 0,
      returnRate: 0,
      totalCost: 0,
      totalCostSold: 0,
      totalNetProfit: 0,
    },
    // ВАЖНО: `CostBreakdown` в `lib/analysis/types.ts` — это числовые поля, без {amount,count}
    costBreakdown: {
      commission: 0,
      logistics: 0,
      returns: 0,
      storage: 0,
      advertising: 0,
      subscriptions: 0,
      penalties: 0,
      other: 0,
      total: 0,
    },
    dailyMetrics: [],
    orders: [],
    topOrders: [],
    returnedOrders: [],
    nonOrderCharges: [],
    subscriptions: [],
    productMetrics: [],
    topProducts: [],
    worstProducts: [],
    problemAreas: [],
    recommendations: [],
    schemeStats: {
      fbo: { orders: 0, amount: 0 },
      fbs: { orders: 0, amount: 0 },
      other: { orders: 0, amount: 0 },
    },
    chargeTypeBreakdown: [],
    costReports: {
      productsWithCost: [],
      productsWithoutCost: [],
      ordersWithCost: [],
      ordersWithoutCost: [],
      totalCost: 0,
      totalCostSold: 0,
      totalNetProfit: 0,
      articlesComparison: {
        costArticles: [],
        orderArticles: [],
      },
    },
  };

  // Объединяем все заказы
  const ordersMap = new Map<string, typeof merged.orders[0]>();
  const productsMap = new Map<string, typeof merged.productMetrics[0]>();
  const dailyMetricsMap = new Map<string, typeof merged.dailyMetrics[0]>();
  type ChargeTypeBreakdownGroup = NonNullable<AnalysisResult["chargeTypeBreakdown"]>[number];
  const chargeTypeBreakdownMap = new Map<string, ChargeTypeBreakdownGroup>();

  for (const result of results) {
    // Суммируем сводку
    merged.summary.grossRevenue += result.summary.grossRevenue;
    merged.summary.revenueAmount += result.summary.revenueAmount;
    merged.summary.pointsAmount += result.summary.pointsAmount;
    merged.summary.ozonFees += result.summary.ozonFees;
    merged.summary.netPayout += result.summary.netPayout;
    merged.summary.totalOrders += result.summary.totalOrders;
    merged.summary.completedOrders += result.summary.completedOrders;
    merged.summary.returnedOrders += result.summary.returnedOrders;
    merged.summary.partialReturns += result.summary.partialReturns;
    merged.summary.cancelledOrders += result.summary.cancelledOrders;
    merged.summary.totalCost = (merged.summary.totalCost || 0) + (result.summary.totalCost || 0);
    merged.summary.totalCostSold = (merged.summary.totalCostSold || 0) + (result.summary.totalCostSold || 0);
    merged.summary.totalNetProfit = (merged.summary.totalNetProfit || 0) + (result.summary.totalNetProfit || 0);
    
    // Объединяем costBreakdown (числовые поля)
    merged.costBreakdown.commission += result.costBreakdown.commission || 0;
    merged.costBreakdown.logistics += result.costBreakdown.logistics || 0;
    merged.costBreakdown.returns += result.costBreakdown.returns || 0;
    merged.costBreakdown.storage += result.costBreakdown.storage || 0;
    merged.costBreakdown.advertising += result.costBreakdown.advertising || 0;
    merged.costBreakdown.subscriptions += result.costBreakdown.subscriptions || 0;
    merged.costBreakdown.penalties += result.costBreakdown.penalties || 0;
    merged.costBreakdown.other += result.costBreakdown.other || 0;
    merged.costBreakdown.total += result.costBreakdown.total || 0;
    
    // Объединяем schemeStats
    merged.schemeStats.fbo.orders += result.schemeStats.fbo.orders;
    merged.schemeStats.fbo.amount += result.schemeStats.fbo.amount;
    merged.schemeStats.fbs.orders += result.schemeStats.fbs.orders;
    merged.schemeStats.fbs.amount += result.schemeStats.fbs.amount;
    merged.schemeStats.other.orders += result.schemeStats.other.orders;
    merged.schemeStats.other.amount += result.schemeStats.other.amount;
    
    // Объединяем nonOrderCharges, subscriptions, problemAreas, recommendations
    merged.nonOrderCharges.push(...result.nonOrderCharges);
    merged.subscriptions.push(...result.subscriptions);
    merged.problemAreas.push(...result.problemAreas);
    merged.recommendations.push(...result.recommendations);

    // Объединяем заказы (по orderNumber)
    for (const order of result.orders) {
      const existing = ordersMap.get(order.orderNumber);
      if (existing) {
        // Если заказ уже есть, суммируем суммы и увеличиваем количество
        existing.grossRevenue += order.grossRevenue;
        existing.revenueAmount = (existing.revenueAmount || 0) + (order.revenueAmount || 0);
        existing.pointsAmount = (existing.pointsAmount || 0) + (order.pointsAmount || 0);
        // Используем totalAmountRub вместо netAmount (которого нет в AggregatedOrder)
        existing.totalAmountRub = (existing.totalAmountRub || 0) + (order.totalAmountRub || 0);
        // ВАЖНО: Себестоимость не суммируем, а берем максимальное значение (или из заказа с выручкой)
        // Иначе при объединении заказов из разных файлов себестоимость задваивается
        if (order.totalCost != null && order.totalCost > 0) {
          if (order.grossRevenue > 0) {
            // Если в текущем заказе есть выручка, берем его себестоимость
            existing.totalCost = order.totalCost;
            existing.costPerUnit = order.costPerUnit;
            existing.hasCost = order.hasCost;
          } else if ((existing.totalCost || 0) === 0) {
            // Если у существующего заказа нет себестоимости, берем из текущего (даже без выручки)
            existing.totalCost = order.totalCost;
            existing.costPerUnit = order.costPerUnit;
            existing.hasCost = order.hasCost;
          }
          // Иначе оставляем существующую себестоимость
        }
        // Пересчитываем quantity на основе типов начислений из обоих файлов
        // Если в обоих файлах есть строки с типом "Выручка" или "Возврат выручки",
        // нужно правильно суммировать/вычитать количество
        // ВАЖНО: quantity из файла с возвратом может быть отрицательным (если нет строк "Выручка")
        // Поэтому просто суммируем: если в первом файле было 3, а во втором -1 (возврат), получим 2
        existing.quantity = (existing.quantity || 0) + (order.quantity || 0);
        // Если после суммирования получилось отрицательное, обнуляем (не должно быть)
        if (existing.quantity < 0) {
          existing.quantity = 0;
        }
        existing.commissionAmount = (existing.commissionAmount || 0) + (order.commissionAmount || 0);
        existing.logisticsAmount = (existing.logisticsAmount || 0) + (order.logisticsAmount || 0);
        existing.acquiringAmount = (existing.acquiringAmount || 0) + (order.acquiringAmount || 0);
        existing.returnAmount = (existing.returnAmount || 0) + (order.returnAmount || 0);
        existing.otherFeesAmount = (existing.otherFeesAmount || 0) + (order.otherFeesAmount || 0);
        existing.totalFees = (existing.totalFees || 0) + (order.totalFees || 0);
        // Суммируем количество начислений
        existing.chargesCount = (existing.chargesCount || 0) + (order.chargesCount || 0);
        // Объединяем типы начислений
        if (order.chargeTypes) {
          existing.chargeTypes = [...new Set([...existing.chargeTypes, ...order.chargeTypes])];
        }
        // Объединяем транзакции (не у всех заказов они могут быть)
        if (Array.isArray(order.transactions)) {
          if (!Array.isArray(existing.transactions)) existing.transactions = [];
          existing.transactions.push(...order.transactions);
        }
      } else {
        // Создаём копию заказа
        ordersMap.set(order.orderNumber, {
          ...order,
          transactions: Array.isArray(order.transactions) ? [...order.transactions] : [],
        });
      }
    }

    // Объединяем товары (по article) - используем productMetrics
    for (const product of result.productMetrics) {
      const existing = productsMap.get(product.article);
      if (existing) {
        existing.totalRevenue += product.totalRevenue;
        existing.totalOrders += product.totalOrders;
        existing.totalQuantity += product.totalQuantity;
        existing.totalCost = (existing.totalCost || 0) + (product.totalCost || 0);
        existing.netProfit = (existing.netProfit || 0) + (product.netProfit || 0);
        // Пересчитываем маржу
        if (existing.totalRevenue > 0) {
          existing.profitMarginPercent = ((existing.netProfit || 0) / existing.totalRevenue) * 100;
        }
      } else {
        productsMap.set(product.article, { ...product });
      }
    }

    // Объединяем дневные метрики
    for (const daily of result.dailyMetrics) {
      const dateKey = daily.date.toISOString().split('T')[0];
      const existing = dailyMetricsMap.get(dateKey);
      if (existing) {
        existing.grossRevenue += daily.grossRevenue;
        existing.netAmount += daily.netAmount;
        existing.orderCount += daily.orderCount;
        existing.totalCost += daily.totalCost || 0;
        existing.netProfit = (existing.netProfit || 0) + (daily.netProfit || 0);
      } else {
        dailyMetricsMap.set(dateKey, {
          ...daily,
          date: new Date(daily.date),
        });
      }
    }

    // Объединяем разбивку по типам начислений
    if (result.chargeTypeBreakdown) {
      for (const group of result.chargeTypeBreakdown) {
        const existing = chargeTypeBreakdownMap.get(group.groupName);
        if (existing) {
          existing.amount += group.amount;
          existing.count += group.count;
          // Объединяем типы начислений внутри группы
          const chargeTypeMap = new Map<string, { name: string; amount: number; count: number }>();
          
          // Добавляем существующие
          for (const ct of existing.chargeTypes) {
            chargeTypeMap.set(ct.name, { ...ct });
          }
          
          // Добавляем новые
          for (const ct of group.chargeTypes) {
            const existingCt = chargeTypeMap.get(ct.name);
            if (existingCt) {
              existingCt.amount += ct.amount;
              existingCt.count += ct.count;
            } else {
              chargeTypeMap.set(ct.name, { ...ct });
            }
          }
          
          existing.chargeTypes = Array.from(chargeTypeMap.values());
        } else {
          chargeTypeBreakdownMap.set(group.groupName, {
            ...group,
            chargeTypes: [...group.chargeTypes],
          });
        }
      }
    }

    // Объединяем отчёты по себестоимости
    if (result.costReports) {
      merged.costReports.totalCost += result.costReports.totalCost || 0;
      merged.costReports.totalCostSold += result.costReports.totalCostSold || 0;
      merged.costReports.totalNetProfit += result.costReports.totalNetProfit || 0;

      // Объединяем списки товаров и заказов с себестоимостью
      // (используем Map для дедупликации по article/orderNumber)
      const productsWithCostMap = new Map<string, typeof merged.costReports.productsWithCost[0]>();
      const productsWithoutCostMap = new Map<string, typeof merged.costReports.productsWithoutCost[0]>();
      const ordersWithCostMap = new Map<string, typeof merged.costReports.ordersWithCost[0]>();
      const ordersWithoutCostMap = new Map<string, typeof merged.costReports.ordersWithoutCost[0]>();

      // Добавляем существующие
      for (const p of merged.costReports.productsWithCost) {
        productsWithCostMap.set(p.article, p);
      }
      for (const p of merged.costReports.productsWithoutCost) {
        productsWithoutCostMap.set(p.article, p);
      }
      for (const o of merged.costReports.ordersWithCost) {
        ordersWithCostMap.set(o.orderNumber, o);
      }
      for (const o of merged.costReports.ordersWithoutCost) {
        ordersWithoutCostMap.set(o.orderNumber, o);
      }

      // Добавляем из текущего результата
      for (const p of result.costReports.productsWithCost || []) {
        productsWithCostMap.set(p.article, p);
      }
      for (const p of result.costReports.productsWithoutCost || []) {
        productsWithoutCostMap.set(p.article, p);
      }
      for (const o of result.costReports.ordersWithCost || []) {
        ordersWithCostMap.set(o.orderNumber, o);
      }
      for (const o of result.costReports.ordersWithoutCost || []) {
        ordersWithoutCostMap.set(o.orderNumber, o);
      }

      merged.costReports.productsWithCost = Array.from(productsWithCostMap.values());
      merged.costReports.productsWithoutCost = Array.from(productsWithoutCostMap.values());
      merged.costReports.ordersWithCost = Array.from(ordersWithCostMap.values());
      merged.costReports.ordersWithoutCost = Array.from(ordersWithoutCostMap.values());

      // Объединяем артикулы для сравнения
      if (result.costReports.articlesComparison) {
        const costArticlesSet = new Set([
          ...(merged.costReports.articlesComparison?.costArticles || []),
          ...(result.costReports.articlesComparison.costArticles || []),
        ]);
        const orderArticlesSet = new Set([
          ...(merged.costReports.articlesComparison?.orderArticles || []),
          ...(result.costReports.articlesComparison.orderArticles || []),
        ]);
        merged.costReports.articlesComparison = {
          costArticles: Array.from(costArticlesSet),
          orderArticles: Array.from(orderArticlesSet),
        };
      }
    }
  }

  // Пересчитываем статусы заказов на основе объединенных данных
  // Это важно для заказов, разбитых между периодами (например, эквайринг в одном периоде, выручка в другом)
  for (const order of ordersMap.values()) {
    order.status = recalculateOrderStatus(order);
  }

  // Конвертируем Maps в массивы
  merged.orders = Array.from(ordersMap.values());
  merged.productMetrics = Array.from(productsMap.values());
  merged.dailyMetrics = Array.from(dailyMetricsMap.values()).sort((a, b) => 
    a.date.getTime() - b.date.getTime()
  );
  merged.chargeTypeBreakdown = Array.from(chargeTypeBreakdownMap.values());

  // Пересчитываем топ-10 и худшие товары
  merged.topProducts = merged.productMetrics
    .filter(p => (p.netProfit || 0) > 0)
    .sort((a, b) => (b.netProfit || 0) - (a.netProfit || 0))
    .slice(0, 10);
    
  merged.worstProducts = merged.productMetrics
    .filter(p => p.totalRevenue > 0)
    .sort((a, b) => (a.netProfit || 0) - (b.netProfit || 0))
    .slice(0, 10);

  // Пересчитываем топ заказы
  merged.topOrders = merged.orders
    .filter(o => (o.totalAmountRub || 0) > 0)
    .sort((a, b) => (b.totalAmountRub || 0) - (a.totalAmountRub || 0))
    .slice(0, 20);

  // Пересчитываем возвращённые заказы
  merged.returnedOrders = merged.orders.filter(o => 
    o.status === "returned" || o.status === "partial_return"
  );

  // Пересчитываем метрики summary
  merged.summary.totalProducts = merged.productMetrics.length;
  merged.summary.avgOrderValue = merged.summary.totalOrders > 0
    ? merged.summary.grossRevenue / merged.summary.totalOrders
    : 0;
  merged.summary.returnRate = merged.summary.totalOrders > 0
    ? ((merged.summary.returnedOrders + merged.summary.partialReturns) / merged.summary.totalOrders) * 100
    : 0;
  merged.summary.feesPercent = merged.summary.grossRevenue > 0
    ? (merged.summary.ozonFees / merged.summary.grossRevenue) * 100
    : 0;
  merged.summary.productsWithCost = merged.costReports.productsWithCost.length;
  merged.summary.productsWithoutCost = merged.costReports.productsWithoutCost.length;
  merged.summary.ordersWithCost = merged.costReports.ordersWithCost.length;
  merged.summary.ordersWithoutCost = merged.costReports.ordersWithoutCost.length;

  return merged;
}

/**
 * Пересчитывает статус заказа на основе объединенных данных
 * Это важно для заказов, разбитых между периодами
 */
function recalculateOrderStatus(order: AggregatedOrder): OrderStatus {
  const grossRevenue = order.grossRevenue || 0;
  const revenueAmount = order.revenueAmount || 0;
  
  // Проверяем наличие возвратов
  const chargeTypes = order.chargeTypes || [];
  const hasReturnType = chargeTypes.some(ct => {
    const category = getChargeCategory(ct);
    return category === "returnLogistics" || category === "returnRevenue" || 
           category === "returnCommission" || category === "returnProcessing";
  });
  
  const hasPartialReturnType = chargeTypes.some(ct => {
    const category = getChargeCategory(ct);
    return category === "partialReturn";
  });
  
  // Проверяем наличие эквайринга - проверяем наличие типов начислений, а не сумму
  // (сумма может быть 0 при двойном эквайринге)
  const hasAcquiringCharges = chargeTypes.some(ct => {
    const category = getChargeCategory(ct);
    return category === "acquiring";
  });
  
  // Проверяем, есть ли только эквайринг (все типы начислений - эквайринг)
  const hasOnlyAcquiring = chargeTypes.length > 0 && 
    chargeTypes.every(ct => {
      const category = getChargeCategory(ct);
      return category === "acquiring";
    });
  
  // Проверяем двойной эквайринг (положительный и отрицательный)
  // Если есть эквайринг, выручка = 0, и totalAmountRub = 0 (или близок к 0), 
  // и есть несколько начислений (chargesCount >= 2), и только эквайринг (hasOnlyAcquiring)
  // ВАЖНО: acquiringAmount может быть 0, если положительный и отрицательный эквайринг равны
  // (так как acquiringAmount = Math.abs(сумма всех эквайрингов))
  const hasDoubleAcquiring = hasAcquiringCharges && 
    hasOnlyAcquiring && // Только эквайринг, без других начислений
    grossRevenue === 0 && 
    (order.totalAmountRub === 0 || Math.abs(order.totalAmountRub || 0) < 0.01) &&
    (order.chargesCount || 0) >= 2; // Должно быть минимум 2 начисления (положительный и отрицательный эквайринг)
  
  // Определяем отмененные заказы
  const isCancelled = grossRevenue === 0 && 
    hasAcquiringCharges && 
    hasDoubleAcquiring &&
    !hasReturnType &&
    !hasPartialReturnType;
  
  // ВАЖНО: Если есть выручка (revenueAmount > 0), заказ завершен
  // Даже если эквайринг был в другом периоде и там заказ был "в работе"
  // НО: если количество товаров = 0 (все возвращены), то это возврат, а не завершенный заказ
  const quantity = order.quantity || 0;
  if (revenueAmount > 0 && !hasReturnType && !hasPartialReturnType && quantity > 0) {
    return "completed";
  }
  
  // Определяем статусы в правильном порядке: сначала отмененные, потом "в работе", потом возвраты
  // ВАЖНО: Заказы с двойным эквайрингом (положительный и отрицательный) и totalAmountRub = 0
  // могут быть как "cancelled" (отмена), так и "completed" (компенсация эквайринга)
  // Если totalAmountRub = 0 и только эквайринг - это компенсация эквайринга, статус "completed"
  // Отмена определяется только если есть явные признаки отмены (например, возвраты)
  if (isCancelled) {
    return "cancelled";
  } else if (hasPartialReturnType) {
    // Частичный невыкуп: если количество товаров после возвратов = 0, то это полный возврат
    return quantity === 0 ? "returned" : "partial_return";
  } else if (hasReturnType) {
    // ВАЖНО: Если количество товаров после всех возвратов = 0, то это полный возврат
    // даже если revenueAmount > 0 (например, из-за баллов за скидки)
    if (quantity === 0) {
      return "returned";
    }
    // В merged `revenueAmount` должен быть нетто (с учетом "Возврат выручки"),
    // поэтому частичный возврат можно определить по остатку выручки.
    return revenueAmount > 0 ? "partial_return" : "returned";
  } else if (grossRevenue === 0 && hasOnlyAcquiring && !hasDoubleAcquiring) {
    // Если только эквайринг и нет выручки - это может быть "в работе"
    // Но если есть выручка в другом периоде, статус уже будет "completed" выше
    // И если есть двойной эквайринг, статус уже будет определен ниже
    return "in_progress";
  } else if (grossRevenue === 0 && hasOnlyAcquiring && hasDoubleAcquiring && 
             (order.totalAmountRub === 0 || Math.abs(order.totalAmountRub || 0) < 0.01)) {
    // Если только эквайринг, двойной эквайринг, и totalAmountRub = 0 - это компенсация эквайринга
    // Статус "completed", а не "cancelled" (отмена определяется только если есть возвраты)
    return "completed";
  }
  
  // По умолчанию - завершен (включая случаи, когда totalAmountRub = 0 из-за компенсации эквайринга)
  return "completed";
}
