/**
 * Утилита для экспорта данных в XLSX формат
 */

import * as XLSX from "xlsx";

/**
 * Экспортирует данные в XLSX файл
 */
export function exportToXLSX(
  data: any[],
  filename: string,
  sheetName: string = "Данные"
): void {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

/**
 * Экспортирует несколько листов в один XLSX файл
 */
export function exportMultipleSheets(
  sheets: Array<{ name: string; data: any[] }>,
  filename: string
): void {
  const workbook = XLSX.utils.book_new();
  
  sheets.forEach(({ name, data }) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  });
  
  XLSX.writeFile(workbook, filename);
}

/**
 * Форматирует число как валюту для экспорта
 */
function formatCurrencyForExport(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Форматирует число как процент для экспорта
 */
function formatPercentForExport(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return `${value.toFixed(1)}%`;
}

/**
 * Экспорт данных раздела "Обзор"
 */
export function exportOverviewData(
  summary: any,
  chargeTypeBreakdown: any[],
  profitTrends: any[],
  dailyMetrics: any[],
  filename: string = `Обзор_${new Date().toISOString().split("T")[0]}.xlsx`
): void {
  // chargeTypeBreakdown в анализе имеет вид:
  // [{ groupName, amount, count, chargeTypes: [{ name, amount, count }] }]
  const flatChargeTypes = (Array.isArray(chargeTypeBreakdown) ? chargeTypeBreakdown : [])
    .flatMap((g: any) => {
      const groupName = g?.groupName || g?.group || "-";
      const types = Array.isArray(g?.chargeTypes) ? g.chargeTypes : [];
      return types.map((ct: any) => ({
        groupName,
        name: ct?.name || ct?.type || "-",
        amount: ct?.amount ?? 0,
        count: ct?.count ?? 0,
      }));
    });

  const sheets = [
    {
      name: "Сводка",
      data: [
        { Параметр: "Выручка", Значение: formatCurrencyForExport(summary.grossRevenue) },
        { Параметр: "К выплате", Значение: formatCurrencyForExport(summary.netPayout) },
        { Параметр: "Всего заказов", Значение: summary.totalOrders || 0 },
        { Параметр: "Завершенных", Значение: summary.completedOrders || 0 },
        { Параметр: "Возвратов", Значение: summary.returnedOrders || 0 },
        { Параметр: "Частичных возвратов", Значение: summary.partialReturns || 0 },
        { Параметр: "Отмененных", Значение: summary.cancelledOrders || 0 },
        { Параметр: "В работе", Значение: summary.inProgressOrders || 0 },
        { Параметр: "% удержаний", Значение: formatPercentForExport(summary.feesPercent) },
        { Параметр: "% возвратов", Значение: formatPercentForExport(summary.returnRate) },
        // В анализаторе "чистая прибыль" хранится как totalNetProfit (netPayout - totalCostSold)
        { Параметр: "Чистая прибыль", Значение: formatCurrencyForExport(summary.totalNetProfit ?? summary.netProfit) },
      ],
    },
    {
      name: "Начисления по типам",
      data: flatChargeTypes.map((item: any) => ({
        Группа: item.groupName || "-",
        Тип: item.name || "-",
        Сумма: formatCurrencyForExport(item.amount),
        Количество: item.count || 0,
      })),
    },
    {
      name: "Динамика прибыли",
      data: profitTrends.map((item) => {
        const revenue = item?.revenue ?? 0;
        const netProfit = item?.netProfit;
        const margin = (netProfit !== undefined && revenue > 0)
          ? (netProfit / revenue) * 100
          : undefined;

        return {
          Дата: item.date ? new Date(item.date).toLocaleDateString("ru-RU") : "-",
          Выручка: formatCurrencyForExport(revenue),
          Прибыль: formatCurrencyForExport(netProfit ?? item?.profit),
          Маржа: formatPercentForExport(margin),
        };
      }),
    },
    {
      name: "Дневные метрики",
      data: dailyMetrics.map((item) => ({
        Дата: item.date ? new Date(item.date).toLocaleDateString("ru-RU") : "-",
        Заказов: item.ordersCount || 0,
        Выручка: formatCurrencyForExport(item.revenue),
        К_выплате: formatCurrencyForExport(item.netAmount),
        Комиссия: formatCurrencyForExport(item.commission),
        Логистика: formatCurrencyForExport(item.logistics),
      })),
    },
  ];
  
  exportMultipleSheets(sheets, filename);
}

/**
 * Экспорт данных раздела "Начисления"
 */
export function exportAccrualsData(
  chargeTypeBreakdown: any[],
  filename: string = `Начисления_${new Date().toISOString().split("T")[0]}.xlsx`
): void {
  const flatChargeTypes = (Array.isArray(chargeTypeBreakdown) ? chargeTypeBreakdown : [])
    .flatMap((g: any) => {
      const groupName = g?.groupName || g?.group || "-";
      const types = Array.isArray(g?.chargeTypes) ? g.chargeTypes : [];
      return types.map((ct: any) => ({
        groupName,
        name: ct?.name || ct?.type || "-",
        amount: ct?.amount ?? 0,
        count: ct?.count ?? 0,
      }));
    });

  const totalAbs = flatChargeTypes.reduce((sum: number, x: any) => sum + Math.abs(x.amount || 0), 0);

  const data = flatChargeTypes.map((item: any) => ({
    Группа: item.groupName || "-",
    Тип_начисления: item.name || "-",
    Сумма: formatCurrencyForExport(item.amount),
    Количество: item.count || 0,
    Процент: formatPercentForExport(totalAbs > 0 ? (Math.abs(item.amount || 0) / totalAbs) * 100 : 0),
  }));
  
  exportToXLSX(data, filename, "Начисления");
}

/**
 * Экспорт данных раздела "Товары"
 */
export function exportProductsData(
  products: any[],
  filename: string = `Товары_${new Date().toISOString().split("T")[0]}.xlsx`
): void {
  if (!Array.isArray(products) || products.length === 0) {
    exportToXLSX([{ Сообщение: "Нет данных для экспорта (список товаров пуст)." }], filename, "Товары");
    return;
  }

  // Поддерживаем оба формата:
  // - ProductMetrics (из анализатора): productName/totalSold/totalCommission/...
  // - UI topProducts: name/revenue/profit/...
  const data = products.map((product) => ({
    SKU: product.sku || "-",
    Артикул: product.article || "-",
    Наименование: product.productName || product.name || "-",

    Выручка: formatCurrencyForExport(product.totalRevenue ?? product.revenue),
    К_выплате: formatCurrencyForExport(product.netAmount ?? product.profit),

    Комиссия: formatCurrencyForExport(product.totalCommission ?? product.commissionAmount),
    Логистика: formatCurrencyForExport(product.totalLogistics ?? product.logisticsAmount),
    Возвраты: formatCurrencyForExport(product.totalReturnsAmount),

    Заказов: product.ordersCount ?? product.orders ?? 0,
    Количество: product.totalSold ?? product.totalQuantity ?? 0,
    Возвратов: product.returnsCount ?? 0,
    "%_возвратов": formatPercentForExport(product.returnRate),

    Себестоимость_ед: formatCurrencyForExport(product.costPerUnit),
    Общая_себестоимость: formatCurrencyForExport(product.totalCost),
    Чистая_прибыль: formatCurrencyForExport(product.netProfit),
    Маржа: formatPercentForExport(product.profitMarginPercent ?? product.profitMargin ?? product.marginPercent ?? product.margin),
  }));
  
  exportToXLSX(data, filename, "Товары");
}

/**
 * Экспорт данных раздела "Рентабельность заказов"
 */
export function exportOrdersData(
  orders: any[],
  filename: string = `Заказы_${new Date().toISOString().split("T")[0]}.xlsx`
): void {
  // В UI рентабельность считается не на "сырой" строке заказа, а на сгруппированном заказе
  // (см. `OrdersProfitabilityTable`). В экспорт повторяем ту же логику.
  const statusPriority: Record<string, number> = {
    returned: 5,
    partial_return: 4,
    cancelled: 3,
    in_progress: 2,
    completed: 1,
  };

  const toDateOrNull = (value: any): Date | null => {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  };

  const formatDateRu = (d: Date | null): string =>
    d ? d.toLocaleDateString("ru-RU") : "-";

  type Group = {
    orderNumber: string;
    status: string;
    date: Date | null;
    chargeDate: Date | null;
    grossRevenue: number;
    netAmount: number;
    totalCost: number;
    quantity: number;
    productNames: Set<string>;
    netProfit?: number;
    profitMargin?: number;
  };

  const groups = new Map<string, Group>();

  for (const order of orders) {
    const key = order?.orderNumber || "";
    if (!key) continue;

    const orderDate = toDateOrNull(order.orderDate) || toDateOrNull(order.chargeDate);
    const chargeDate = toDateOrNull(order.chargeDate);
    const incomingStatus = String(order.status || "completed");

    if (!groups.has(key)) {
      groups.set(key, {
        orderNumber: key,
        status: incomingStatus,
        date: orderDate,
        chargeDate,
        grossRevenue: 0,
        netAmount: 0,
        totalCost: 0,
        quantity: 0,
        productNames: new Set<string>(),
      });
    }

    const g = groups.get(key)!;

    // Статус: берем "более важный" (returned > partial_return > cancelled > in_progress > completed)
    const currentPriority = statusPriority[g.status] ?? 0;
    const incomingPriority = statusPriority[incomingStatus] ?? 0;
    if (incomingPriority > currentPriority) g.status = incomingStatus;

    // Даты: order date = минимальная, charge date = максимальная
    if (orderDate) {
      if (!g.date || orderDate.getTime() < g.date.getTime()) g.date = orderDate;
    }
    if (chargeDate) {
      if (!g.chargeDate || chargeDate.getTime() > g.chargeDate.getTime()) g.chargeDate = chargeDate;
    }

    g.grossRevenue += order.grossRevenue || 0;
    g.netAmount += order.totalAmountRub || 0;
    g.totalCost += order.totalCost || 0;
    g.quantity += order.quantity || 0;

    if (order.productName) g.productNames.add(String(order.productName));
  }

  // Рассчитываем чистую прибыль и маржу по той же логике, что и в таблице
  for (const g of groups.values()) {
    if (g.grossRevenue === 0) {
      // Если выручка = 0, себестоимость не учитываем
      g.netProfit = g.netAmount;
      g.profitMargin = 0;
      g.totalCost = 0;
    } else if (g.totalCost > 0) {
      g.netProfit = g.netAmount - g.totalCost;
      g.profitMargin = g.grossRevenue > 0 ? (g.netProfit / g.grossRevenue) * 100 : 0;
    }
  }

  const data = Array.from(groups.values()).map((g) => ({
    Номер_заказа: g.orderNumber,
    Статус: g.status || "-",
    Товары: Array.from(g.productNames).join("; ") || "-",
    Количество: g.quantity || 0,
    Выручка: formatCurrencyForExport(g.grossRevenue),
    К_выплате: formatCurrencyForExport(g.netAmount),
    Себестоимость: g.totalCost > 0 ? formatCurrencyForExport(g.totalCost) : (g.grossRevenue === 0 ? formatCurrencyForExport(0) : "-"),
    Чистая_прибыль: formatCurrencyForExport(g.netProfit),
    Маржа: formatPercentForExport(g.profitMargin),
    Дата_заказа: formatDateRu(g.date),
    Дата_начисления: formatDateRu(g.chargeDate),
  }));
  
  exportToXLSX(data, filename, "Заказы");
}

/**
 * Экспорт данных раздела "Себестоимость"
 */
export function exportCostReportsData(
  costReports: any,
  filename: string = `Себестоимость_${new Date().toISOString().split("T")[0]}.xlsx`
): void {
  const sheets = [];
  
  // Товары с себестоимостью
  if (costReports.productsWithCost?.length > 0) {
    sheets.push({
      name: "Товары с себестоимостью",
      data: costReports.productsWithCost.map((product: any) => ({
        SKU: product.sku || "-",
        Артикул: product.article || "-",
        Наименование: product.productName || product.name || "-",
        Себестоимость_ед: formatCurrencyForExport(product.costPerUnit),
        Количество: product.totalSold ?? product.quantity ?? 0,
        Общая_себестоимость: formatCurrencyForExport(product.totalCost),
        Выручка: formatCurrencyForExport(product.totalRevenue ?? product.revenue),
        К_выплате: formatCurrencyForExport(product.netAmount),
        Чистая_прибыль: formatCurrencyForExport(product.netProfit),
        Маржа: formatPercentForExport(product.profitMarginPercent ?? product.profitMargin ?? product.marginPercent),
      })),
    });
  }
  
  // Товары без себестоимости
  if (costReports.productsWithoutCost?.length > 0) {
    sheets.push({
      name: "Товары без себестоимости",
      data: costReports.productsWithoutCost.map((product: any) => ({
        SKU: product.sku || "-",
        Артикул: product.article || "-",
        Наименование: product.productName || product.name || "-",
        Выручка: formatCurrencyForExport(product.totalRevenue ?? product.revenue),
        К_выплате: formatCurrencyForExport(product.netAmount),
        Заказов: product.ordersCount || 0,
      })),
    });
  }
  
  // Заказы с себестоимостью
  if (costReports.ordersWithCost?.length > 0) {
    sheets.push({
      name: "Заказы с себестоимостью",
      data: costReports.ordersWithCost.map((order: any) => ({
        Номер_заказа: order.orderNumber || "-",
        Товар: order.productName || "-",
        Артикул: order.article || order.sku || "-",
        Количество: order.quantity || 0,
        Себестоимость_ед: formatCurrencyForExport(order.costPerUnit),
        Общая_себестоимость: formatCurrencyForExport(order.totalCost),
        Выручка: formatCurrencyForExport(order.grossRevenue),
        К_выплате: formatCurrencyForExport(order.totalAmountRub),
        Чистая_прибыль: formatCurrencyForExport(
          order.totalCost !== undefined ? (order.totalAmountRub - order.totalCost) : undefined
        ),
      })),
    });
  }
  
  // Сводка
  sheets.push({
    name: "Сводка",
    data: [
      { Параметр: "Товаров с себестоимостью", Значение: costReports.productsWithCost?.length || 0 },
      { Параметр: "Товаров без себестоимости", Значение: costReports.productsWithoutCost?.length || 0 },
      { Параметр: "Общая себестоимость", Значение: formatCurrencyForExport(costReports.totalCostSold) },
      { Параметр: "Чистая прибыль", Значение: formatCurrencyForExport(costReports.totalNetProfit) },
    ],
  });
  
  if (sheets.length > 0) {
    exportMultipleSheets(sheets, filename);
  }
}

/**
 * Экспорт данных раздела "Проблемы"
 */
export function exportProblemsData(
  cancellationReasons: any[],
  returnReasons: any[],
  filename: string = `Проблемы_${new Date().toISOString().split("T")[0]}.xlsx`
): void {
  const sheets = [
    {
      name: "Причины отмен",
      data: cancellationReasons.map((item) => ({
        Причина: item.reason || "-",
        Количество: item.count || 0,
        Процент: formatPercentForExport(item.percent),
      })),
    },
    {
      name: "Причины возвратов",
      data: returnReasons.map((item) => ({
        Причина: item.reason || "-",
        Количество: item.count || 0,
        Процент: formatPercentForExport(item.percent),
      })),
    },
  ];
  
  exportMultipleSheets(sheets, filename);
}
