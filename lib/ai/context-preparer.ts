/**
 * Утилита для подготовки контекста данных для AI-анализа разных разделов отчёта
 */

import type { FrontendAnalysisResult } from "@/lib/types/analysis";

export type AnalysisType = "overview" | "costs" | "products" | "orders" | "cost-reports" | "problems";

/**
 * Подготавливает контекст данных для AI-анализа в зависимости от типа анализа
 */
export function prepareAnalysisContext(
  analysisType: AnalysisType,
  fullData: FrontendAnalysisResult
): { [key: string]: any } {
  const baseContext: any = {
    summary: fullData.summary,
  };

  switch (analysisType) {
    case "overview":
      // Обзор: summary, chargeTypeBreakdown, dailyMetrics, все товары
      return {
        ...baseContext,
        chargeTypeBreakdown: (fullData as any).chargeTypeBreakdown || [],
        dailyMetrics: fullData.dailyMetrics || [],
        topProducts: (fullData.topProducts || []).map(p => ({
          name: (p as any).productName || (p as any).name || "",
          revenue: (p as any).totalRevenue || (p as any).revenue || 0,
          profit: (p as any).netAmount || (p as any).profit || 0,
          profitMargin: (p as any).profitMarginPercent || (p as any).profitMargin || 0,
          returnRate: (p as any).returnRate || 0,
        })),
        // Добавляем все товары для полного контекста
        allProducts: (fullData.productMetrics || []).map(p => ({
          name: p.productName || "",
          sku: p.sku || "",
          article: p.article || "",
        })),
      };

    case "costs":
      // Начисления: chargeTypeBreakdown, costBreakdown, summary
      return {
        ...baseContext,
        chargeTypeBreakdown: (fullData as any).chargeTypeBreakdown || [],
        costBreakdown: fullData.costBreakdown || {},
      };

    case "products":
      // Товары: все товары с деталями + выделяем проблемные и прибыльные для конкретных рекомендаций
      const allProducts = (fullData.productMetrics || []).map(p => ({
        name: p.productName || "",
        sku: p.sku || "",
        article: p.article || "",
        revenue: p.totalRevenue || 0,
        profit: p.netAmount || 0,
        profitMargin: (p as any).profitMarginPercent || 0,
        returnRate: p.returnRate || 0,
        ordersCount: p.ordersCount || 0,
        totalSold: p.totalSold || 0,
        totalReturned: p.totalReturned || 0,
        totalCommission: p.totalCommission || 0,
        totalLogistics: p.totalLogistics || 0,
        costPerUnit: p.costPerUnit,
        totalCost: p.totalCost,
        netProfit: p.netProfit,
        avgCommissionPercent: p.avgCommissionPercent || 0,
      }));

      // Выделяем проблемные товары для конкретных рекомендаций
      const problematicProducts = allProducts
        .filter(p => 
          p.profit < 0 || // Убыточные
          p.returnRate > 10 || // Высокий процент возвратов
          (p.avgCommissionPercent > 20 && p.ordersCount > 0) // Высокая комиссия
        )
        .sort((a, b) => {
          // Сначала самые проблемные
          if (a.profit < 0 && b.profit >= 0) return -1;
          if (a.profit >= 0 && b.profit < 0) return 1;
          return (b.returnRate || 0) - (a.returnRate || 0);
        })
        .slice(0, 50); // Топ-50 проблемных

      // Выделяем прибыльные товары для анализа успешных практик
      const profitableProducts = allProducts
        .filter(p => p.profit > 0 && p.profitMargin > 20 && p.returnRate < 5)
        .sort((a, b) => b.profitMargin - a.profitMargin)
        .slice(0, 30); // Топ-30 прибыльных

      return {
        ...baseContext,
        allProducts: allProducts, // Все товары для контекста
        topProducts: (fullData.topProducts || []).map(p => ({
          name: (p as any).productName || (p as any).name || "",
          revenue: (p as any).totalRevenue || (p as any).revenue || 0,
          profit: (p as any).netAmount || (p as any).profit || 0,
          profitMargin: (p as any).profitMarginPercent || (p as any).profitMargin || 0,
          returnRate: (p as any).returnRate || 0,
        })),
        // Конкретные товары для анализа и рекомендаций
        problematicProducts: problematicProducts, // Убыточные, с высокими возвратами, высокой комиссией
        profitableProducts: profitableProducts, // Прибыльные с хорошими метриками
        note: "Проблемные товары требуют конкретных рекомендаций. Прибыльные товары - примеры успешных практик.",
      };

    case "orders":
      // Рентабельность заказов: агрегированная статистика по заказам (без деталей charges/products)
      // Передаём только ключевые метрики для уменьшения размера запроса
      const allOrders = fullData.orders || [];
      
      // Рассчитываем статистику по заказам
      const ordersStats = {
        total: allOrders.length,
        byStatus: {} as Record<string, number>,
        byProfitability: {
          profitable: 0,
          unprofitable: 0,
          neutral: 0,
        },
        totals: {
          totalRevenue: 0,
          totalNetAmount: 0,
          totalCost: 0,
          totalProfit: 0,
        },
        averages: {
          avgRevenue: 0,
          avgNetAmount: 0,
          avgProfit: 0,
          avgProfitMargin: 0,
        },
        // Топ-50 заказов (убыточные и самые прибыльные) для анализа
        topOrders: allOrders
          .map(order => ({
            orderNumber: order.orderNumber,
            status: order.status,
            grossRevenue: order.grossRevenue,
            // В агрегированном заказе "выплата" хранится как totalAmountRub
            netAmount: order.totalAmountRub,
            totalCost: order.totalCost || 0,
            netProfit: (order.totalAmountRub || 0) - (order.totalCost || 0),
            profitMargin:
              (order.grossRevenue || 0) > 0
                ? (((order.totalAmountRub || 0) - (order.totalCost || 0)) / (order.grossRevenue || 1)) * 100
                : 0,
            // Не передаём charges и products - только ключевые метрики
          }))
          .sort((a, b) => {
            // Сначала убыточные, потом самые прибыльные
            if (a.netProfit < 0 && b.netProfit >= 0) return -1;
            if (a.netProfit >= 0 && b.netProfit < 0) return 1;
            return b.netProfit - a.netProfit;
          })
          .slice(0, 50), // Ограничиваем топ-50 заказами
      };

      // Заполняем статистику
      allOrders.forEach(order => {
        // Статистика по статусам
        const status = order.status || "unknown";
        ordersStats.byStatus[status] = (ordersStats.byStatus[status] || 0) + 1;

        // Статистика по рентабельности
        const profit = (order.totalAmountRub || 0) - (order.totalCost || 0);
        if (profit > 0) ordersStats.byProfitability.profitable++;
        else if (profit < 0) ordersStats.byProfitability.unprofitable++;
        else ordersStats.byProfitability.neutral++;

        // Итоги
        ordersStats.totals.totalRevenue += order.grossRevenue || 0;
        ordersStats.totals.totalNetAmount += order.totalAmountRub || 0;
        ordersStats.totals.totalCost += order.totalCost || 0;
        ordersStats.totals.totalProfit += profit;
      });

      // Средние значения
      if (allOrders.length > 0) {
        ordersStats.averages.avgRevenue = ordersStats.totals.totalRevenue / allOrders.length;
        ordersStats.averages.avgNetAmount = ordersStats.totals.totalNetAmount / allOrders.length;
        ordersStats.averages.avgProfit = ordersStats.totals.totalProfit / allOrders.length;
        
        const profitMarginSum = allOrders.reduce((sum, order) => {
          const gross = order.grossRevenue || 0;
          if (gross <= 0) return sum;
          const profit = (order.totalAmountRub || 0) - (order.totalCost || 0);
          return sum + (profit / gross) * 100;
        }, 0);
        ordersStats.averages.avgProfitMargin = profitMarginSum / allOrders.length;
      }

      // Дополнительно: конкретные проблемные заказы с товарами для рекомендаций
      const problematicOrders = allOrders
        .filter(order => {
          const profit = (order.totalAmountRub || 0) - (order.totalCost || 0);
          return profit < 0 || order.status === "returned" || order.status === "cancelled";
        })
        .sort((a, b) => {
          const profitA = (a.totalAmountRub || 0) - (a.totalCost || 0);
          const profitB = (b.totalAmountRub || 0) - (b.totalCost || 0);
          return profitA - profitB; // Самые убыточные первые
        })
        .slice(0, 30) // Топ-30 проблемных заказов
        .map(order => ({
          orderNumber: order.orderNumber,
          status: order.status,
          productName: order.productName || "",
          sku: order.sku,
          article: order.article,
          grossRevenue: order.grossRevenue,
          netAmount: order.totalAmountRub,
          totalCost: order.totalCost || 0,
          netProfit: (order.totalAmountRub || 0) - (order.totalCost || 0),
          profitMargin:
            (order.grossRevenue || 0) > 0
              ? (((order.totalAmountRub || 0) - (order.totalCost || 0)) / (order.grossRevenue || 1)) * 100
              : 0,
          // Основные типы начислений (без деталей всех charges)
          hasHighCommission: (order.chargeTypes || []).some((t: string) => t.includes("Комиссия")),
          hasReturn: (order.chargeTypes || []).some((t: string) => t.includes("Возврат") || t.includes("Обратная")),
        }));

      return {
        ...baseContext,
        ordersStats, // Агрегированная статистика
        problematicOrders: problematicOrders, // Конкретные проблемные заказы с товарами для рекомендаций
        totalOrders: fullData.summary.totalOrders,
        completedOrders: fullData.summary.completedOrders,
        returnedOrders: fullData.summary.returnedOrders,
        cancelledOrders: fullData.summary.cancelledOrders,
        note: "Проблемные заказы требуют конкретных рекомендаций. Указывай конкретные номера заказов и наименования товаров.",
      };

    case "cost-reports":
      // Себестоимость: costReports, productsWithCost, ordersWithCost
      const costReports = (fullData as any).costReports;
      if (!costReports) {
        return baseContext;
      }

      return {
        ...baseContext,
        costReports: {
          productsWithCost: (costReports.productsWithCost || []).map((p: any) => ({
            name: p.productName || "",
            sku: p.sku,
            article: p.article,
            revenue: p.revenue || 0,
            profit: p.profit || 0,
            costPerUnit: p.costPerUnit,
            totalCost: p.totalCost,
            netProfit: p.netProfit,
            profitMargin: p.profitMargin,
          })),
          productsWithoutCost: (costReports.productsWithoutCost || []).map((p: any) => ({
            name: p.productName || "",
            sku: p.sku,
            article: p.article,
            revenue: p.revenue || 0,
            profit: p.profit || 0,
          })),
          ordersWithCost: (costReports.ordersWithCost || []).map((o: any) => ({
            orderNumber: o.orderNumber,
            productName: o.productName,
            quantity: o.quantity,
            costPerUnit: o.costPerUnit,
            totalCost: o.totalCost,
            revenue: o.revenue,
            profit: o.profit,
            netProfit: o.netProfit,
          })),
          totalCostSold: costReports.totalCostSold || 0,
          totalNetProfit: costReports.totalNetProfit || 0,
        },
      };

    case "problems":
      // Проблемы: problemAreas, summary
      // Преобразуем affectedItems (SKU/артикулы) в наименования товаров
      const problems = (fullData.problemAreas || []).map(problem => {
        const affectedItemNames = problem.affectedItems
          .map(skuOrArticle => {
            // Ищем товар по SKU или артикулу
            const product = 
              (fullData.topProducts || []).find(p => p.sku === skuOrArticle || p.article === skuOrArticle) ||
              (fullData.productMetrics || []).find(p => p.sku === skuOrArticle || p.article === skuOrArticle);
            if (!product) return skuOrArticle;
            // В разных местах товар может быть либо `ProductMetrics` (productName),
            // либо `ProductData` (name).
            const productName = (product as any).productName ?? (product as any).name;
            return productName || skuOrArticle;
          })
          .filter(name => name);

        return {
          ...problem,
          affectedItems: affectedItemNames,
        };
      });

      return {
        ...baseContext,
        problems,
      };

    default:
      return baseContext;
  }
}

/**
 * Получает название раздела для отображения
 */
/**
 * Подготавливает контекст для анализа одного товара
 */
/**
 * Подготавливает контекст ТОЛЬКО для одного товара
 * НЕ использует общие данные (summary) - все рассчитывается только по заказам товара
 */
export function prepareSingleProductContext(
  product: {
    name: string;
    sku?: string;
    article?: string;
    revenue?: number;
    profit?: number;
    netProfit?: number;
    profitMargin?: number;
    returnRate?: number;
    orders?: number;
    [key: string]: any;
  },
  orders: any[],
  summary?: any // Не используется, оставлен для совместимости
): Record<string, any> {
  // Фильтруем заказы по товару
  const productKey = (product.sku || product.article || "").trim();
  const productOrders = orders
    .filter(order => {
      const orderSku = (order.sku || "").trim();
      const orderArticle = (order.article || "").trim();
      return orderSku === productKey || orderArticle === productKey;
    })
    .map(order => ({
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      chargeDate: order.chargeDate,
      status: order.status,
      grossRevenue: order.grossRevenue,
      netAmount: order.netAmount,
      totalCost: order.totalCost,
      netProfit: order.netProfit !== undefined ? order.netProfit : (order.netAmount - (order.totalCost || 0)),
      profitMargin: order.profitMargin,
      // Детализация начислений для анализа
      commissionAmount: order.commissionAmount || 0,
      logisticsAmount: order.logisticsAmount || 0,
      acquiringAmount: order.acquiringAmount || 0,
      returnAmount: order.returnAmount || 0,
      // Типы начислений для понимания проблем
      chargeTypes: order.chargeTypes || [],
      // Количество товара в заказе
      quantity: order.quantity || 0,
      // Цена продажи
      sellerPrice: order.sellerPrice || 0,
    }));

  // Рассчитываем статистику по заказам товара
  const ordersStats = {
    total: productOrders.length,
    byStatus: {} as Record<string, number>,
    totals: {
      totalRevenue: 0,
      totalNetAmount: 0,
      totalCost: 0,
      totalProfit: 0,
    },
    averages: {
      avgRevenue: 0,
      avgProfit: 0,
      avgProfitMargin: 0,
    },
  };

  productOrders.forEach(order => {
    const status = order.status || "unknown";
    ordersStats.byStatus[status] = (ordersStats.byStatus[status] || 0) + 1;
    ordersStats.totals.totalRevenue += order.grossRevenue || 0;
    ordersStats.totals.totalNetAmount += order.netAmount || 0;
    ordersStats.totals.totalCost += order.totalCost || 0;
    ordersStats.totals.totalProfit += order.netProfit || 0;
  });

  if (productOrders.length > 0) {
    ordersStats.averages.avgRevenue = ordersStats.totals.totalRevenue / productOrders.length;
    ordersStats.averages.avgProfit = ordersStats.totals.totalProfit / productOrders.length;
    const profitMarginSum = productOrders.reduce((sum, order) => sum + (order.profitMargin || 0), 0);
    ordersStats.averages.avgProfitMargin = profitMarginSum / productOrders.length;
  }

  // Рассчитываем summary ТОЛЬКО по этому товару
  const productSummary = {
    totalRevenue: ordersStats.totals.totalRevenue,
    totalNetAmount: ordersStats.totals.totalNetAmount,
    totalCost: ordersStats.totals.totalCost,
    totalProfit: ordersStats.totals.totalProfit,
    totalOrders: productOrders.length,
    completedOrders: ordersStats.byStatus["completed"] || 0,
    returnedOrders: ordersStats.byStatus["returned"] || 0,
    cancelledOrders: ordersStats.byStatus["cancelled"] || 0,
    returnRate: product.returnRate || 0,
    avgRevenue: ordersStats.averages.avgRevenue,
    avgProfit: ordersStats.averages.avgProfit,
    avgProfitMargin: ordersStats.averages.avgProfitMargin,
  };

  // ВОЗВРАЩАЕМ ТОЛЬКО ДАННЫЕ ЭТОГО ТОВАРА, БЕЗ ОБЩИХ ДАННЫХ
  return {
    // Summary ТОЛЬКО по этому товару (не общий summary по всем товарам)
    summary: productSummary,
    // Данные ТОЛЬКО этого товара
    product: {
      name: product.name,
      sku: product.sku,
      article: product.article,
      // Финансы
      revenue: product.revenue || 0,
      profit: product.profit || 0,
      netProfit: product.netProfit,
      profitMargin: product.profitMargin,
      // Метрики
      returnRate: product.returnRate || 0,
      ordersCount: product.orders || productOrders.length,
      // Дополнительные поля, если есть
      totalSold: (product as any).totalSold,
      totalReturned: (product as any).totalReturned,
      totalCommission: (product as any).totalCommission,
      totalLogistics: (product as any).totalLogistics,
      costPerUnit: (product as any).costPerUnit,
      totalCost: (product as any).totalCost,
      avgCommissionPercent: (product as any).avgCommissionPercent,
      avgOrderValue: (product as any).avgOrderValue,
    },
    // Все заказы товара (без ограничений, так как их немного)
    productOrders: productOrders,
    ordersStats,
    note: "Анализ КОНКРЕТНОГО ТОВАРА. ВСЕ данные относятся только к этому товару. ВСЕГДА указывай полное наименование товара в рекомендациях. Дай 3-5 конкретных рекомендаций именно по этому товару с конкретными шагами действий. Не анализируй общую ситуацию по бизнесу - только этот товар.",
  };
}

export function getAnalysisTypeName(analysisType: AnalysisType): string {
  const names: Record<AnalysisType, string> = {
    overview: "Обзор",
    costs: "Начисления",
    products: "Товары",
    orders: "Рентабельность заказов",
    "cost-reports": "Себестоимость",
    problems: "Проблемы",
  };
  return names[analysisType] || analysisType;
}
