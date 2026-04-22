/**
 * Адаптер: ConsolidationResult → FrontendAnalysisResult.
 *
 * Цель — не ломать существующий UI. Поля, которые UI ожидает, наполняются из новой модели
 * максимально близко к старому формату. При этом добавляется новое поле incompleteOrders
 * (массив заказов со статусом "incomplete"), которое UI может использовать отдельной секцией.
 */

import type { FrontendAnalysisResult, ProductData, ProfitTrendPoint } from "@/lib/types/analysis";
import type {
  Order,
  OrderClassification,
  ProductAggregate,
  ChargeLine,
} from "../domain";
import type { ConsolidationResult } from "./index";

export interface FrontendAdapterOptions {
  id: string;
  fileName: string;
  fileSize?: number;
}

/** Карта статусов нового пайплайна в статусы, знакомые UI (AggregatedOrder.status). */
function legacyStatus(classification: OrderClassification): "completed" | "returned" | "partial_return" | "in_progress" | "cancelled" {
  switch (classification) {
    case "success":
      return "completed";
    case "full_return":
      return "returned";
    case "partial_return":
      return "partial_return";
    case "incomplete":
      return "in_progress";
  }
}

function orderProductSummary(order: Order): {
  article: string;
  sku: string;
  productName: string;
  quantity: number;
  sellerPrice: number;
} {
  let article = "";
  let sku = "";
  let productName = "";
  let quantity = 0;
  let sellerPrice = 0;
  for (const s of order.shipments) {
    for (const it of s.items) {
      if (!article && it.article) article = it.article;
      if (!sku && it.sku) sku = it.sku;
      if (!productName && it.productName) productName = it.productName;
      const effectiveSold = Math.max(0, it.quantitySold - it.quantityReturned);
      quantity += effectiveSold;
      if (it.sellerPrice > sellerPrice) sellerPrice = it.sellerPrice;
    }
  }
  return { article, sku, productName, quantity, sellerPrice };
}

function toLegacyOrder(order: Order): any {
  const { article, sku, productName, quantity, sellerPrice } = orderProductSummary(order);
  const t = order.totals;
  const revenueAmount = t.revenue;
  const pointsAmount = order.pointsAmount;
  const commissionAmount = Math.abs(t.commission + t.returnCommission);
  const logisticsAmount = Math.abs(t.logistics);
  const acquiringAmount = t.acquiring;
  const returnAmount =
    Math.abs(t.returnLogistics) + Math.abs(t.returnProcessing) + Math.abs(t.partialReturn);
  const otherFeesAmount =
    Math.abs(t.storage) + Math.abs(t.advertising) + Math.abs(t.penalties) + Math.max(0, -t.other);
  const totalFees = commissionAmount + logisticsAmount + returnAmount + otherFeesAmount;

  const missing: string[] = [];
  if (!order.hasRevenue) missing.push("Выручка");
  if (!order.hasAcquiring) missing.push("Эквайринг");
  if (!order.hasLogistics) missing.push("Логистика");
  if (!order.hasCommission) missing.push("Вознаграждение за продажу");

  return {
    orderKey: order.orderKey,
    orderNumber: order.orderKey,
    status: legacyStatus(order.classification),
    classification: order.classification,
    missing,
    totalAmount: order.totalAmountRub,
    article,
    sku,
    productName: productName || "Неизвестный товар",
    quantity,
    sellerPrice,
    totalAmountRub: order.totalAmountRub,
    revenueAmount,
    pointsAmount,
    grossRevenue: revenueAmount + pointsAmount,
    commissionAmount,
    logisticsAmount,
    acquiringAmount,
    returnAmount,
    otherFeesAmount,
    totalFees,
    platform: order.platform,
    workScheme: order.workScheme,
    orderDate: order.orderDate,
    chargeDate: order.lastChargeDate,
    chargesCount: countCharges(order),
    chargeTypes: Array.from(order.chargeTypes),
    costPerUnit: firstItemCost(order) ?? undefined,
    totalCost: order.totalCost,
    hasCost: order.hasCost,
    shipments: order.shipments.map((s) => ({
      shipmentKey: s.shipmentKey,
      status: s.status,
      items: s.items.map((it) => ({
        article: it.article,
        sku: it.sku,
        productName: it.productName,
        quantitySold: it.quantitySold,
        quantityReturned: it.quantityReturned,
        sellerPrice: it.sellerPrice,
        costPerUnit: it.costPerUnit,
        cogs: it.cogs,
      })),
    })),
  };
}

function firstItemCost(order: Order): number | null {
  for (const s of order.shipments) {
    for (const it of s.items) {
      if (it.costPerUnit != null) return it.costPerUnit;
    }
  }
  return null;
}

function countCharges(order: Order): number {
  let n = 0;
  for (const s of order.shipments) n += s.items.length;
  return Math.max(n, order.chargeTypes.size);
}

function toProductData(p: ProductAggregate): ProductData {
  const margin = p.revenue > 0 ? (p.netAmount / p.revenue) * 100 : 0;
  const profitMargin = p.hasCost && p.revenue > 0 ? ((p.netProfit ?? 0) / p.revenue) * 100 : undefined;
  const returnRate =
    p.unitsSold + p.unitsReturned > 0
      ? (p.unitsReturned / (p.unitsSold + p.unitsReturned)) * 100
      : 0;

  return {
    sku: p.sku || p.article || "N/A",
    article: p.article,
    name: p.productName || `Товар ${p.article || p.sku || "N/A"}`,
    revenue: p.revenue,
    profit: p.netAmount,
    netProfit: p.netProfit ?? undefined,
    margin,
    profitMargin,
    orders: p.ordersCount,
    returnRate,
    totalSold: p.unitsSold,
    totalReturned: p.unitsReturned,
    returnsCount: p.returnsCount,
    totalCommission: p.commission,
    totalLogistics: p.logistics,
    totalReturnsAmount: p.returnsAmount,
    costPerUnit: p.costPerUnit ?? undefined,
    totalCost: p.totalCost,
    hasCost: p.hasCost,
  };
}

export function toFrontendAnalysis(
  res: ConsolidationResult,
  opts: FrontendAdapterOptions
): FrontendAnalysisResult & { incompleteOrders: any[]; orders: any[]; summary: any } {
  const { report, analytics } = res;
  const summary = analytics.summary;

  const orders = report.orders.map(toLegacyOrder);
  const incompleteOrders = orders.filter((o) => o.classification === "incomplete");
  const returnedOrders = orders.filter(
    (o) => o.classification === "full_return" || o.classification === "partial_return"
  );

  const products = analytics.productAggregates.map(toProductData);
  const topProducts = [...products].sort(
    (a, b) => ((b.netProfit ?? b.profit) || 0) - ((a.netProfit ?? a.profit) || 0)
  );
  const worstProducts = products
    .filter((p) => {
      const hasRevenue = p.revenue > 0;
      const netAmount = p.profit;
      const margin = p.margin;
      const rr = p.returnRate;
      if (!hasRevenue && (netAmount === 0 || netAmount >= 0)) return false;
      return (hasRevenue && margin < 15) || (hasRevenue && rr > 10) || netAmount < 0;
    })
    .sort((a, b) => (a.margin || 0) - (b.margin || 0));

  const profitTrends: ProfitTrendPoint[] = analytics.daily.map((d) => ({
    date: d.date,
    revenue: d.revenue,
    costs: d.commission + d.logistics + d.returns,
    profit: d.netAmount,
    orders: d.ordersCount,
    totalCost: d.totalCost || undefined,
    netProfit: d.netProfit || undefined,
  }));

  const costBreakdownPie = [
    { category: "Комиссия Ozon", amount: analytics.costBreakdown.commission, color: "#ef4444", percent: 0 },
    { category: "Логистика", amount: analytics.costBreakdown.logistics, color: "#f97316", percent: 0 },
    { category: "Возвраты", amount: analytics.costBreakdown.returns, color: "#eab308", percent: 0 },
    { category: "Хранение", amount: analytics.costBreakdown.storage, color: "#22c55e", percent: 0 },
    { category: "Реклама", amount: analytics.costBreakdown.advertising, color: "#3b82f6", percent: 0 },
    { category: "Подписки", amount: analytics.costBreakdown.subscriptions, color: "#8b5cf6", percent: 0 },
    { category: "Штрафы", amount: analytics.costBreakdown.penalties, color: "#ec4899", percent: 0 },
    { category: "Прочее", amount: analytics.costBreakdown.other, color: "#6b7280", percent: 0 },
  ].filter((c) => c.amount > 0);
  const totalPie = costBreakdownPie.reduce((s, c) => s + c.amount, 0);
  costBreakdownPie.forEach((c) => {
    c.percent = totalPie > 0 ? Math.round((c.amount / totalPie) * 100) : 0;
  });

  const dailyMetrics = analytics.daily.map((d) => ({
    date: d.date,
    ordersCount: d.ordersCount,
    returnsCount: d.returnsCount,
    revenue: d.revenue,
    commission: d.commission,
    logistics: d.logistics,
    returns: d.returns,
    netAmount: d.netAmount,
    pointsAmount: d.pointsAmount,
    totalCost: d.totalCost || undefined,
    netProfit: d.netProfit || undefined,
  }));

  const costReports = buildCostReports(orders, products);

  const result: any = {
    id: opts.id,
    fileName: opts.fileName,
    fileSize: opts.fileSize,
    uploadDate: new Date().toISOString(),
    analysisDate: new Date().toISOString(),
    analyzedAt: new Date(),

    period: {
      start: report.periodStart,
      end: report.periodEnd,
      label: report.periodLabel,
    },

    summary: {
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,

      grossRevenue: summary.grossRevenue,
      revenueAmount: summary.revenueAmount,
      pointsAmount: summary.pointsAmount,
      partnerProgramsAmount: summary.partnerProgramsAmount,
      grossBySellerPrice: summary.grossBySellerPrice,
      ozonFees: summary.ozonFees,
      netPayout: summary.netPayout,
      actualPayout: summary.actualPayout,
      feesPercent: summary.feesPercent,

      totalRevenue: summary.grossRevenue,
      totalCosts: summary.ozonFees,
      netProfit: summary.netPayout,
      marginPercent: 100 - summary.feesPercent,

      totalOrders: summary.totalOrders,
      averageOrderValue: summary.avgOrderValue,
      cancellationRate: 0,
      returnRate: summary.returnRate,
      roi: summary.grossRevenue > 0 ? (summary.netPayout / summary.grossRevenue) * 100 : 0,

      completedOrders: summary.successOrders,
      returnedOrders: summary.fullReturnOrders,
      partialReturns: summary.partialReturnOrders,
      cancelledOrders: 0,
      incompleteOrders: summary.incompleteOrders,
      totalProducts: summary.totalProducts,
      avgCommissionPercent: summary.avgCommissionPercent,

      totalCost: summary.totalCost || undefined,
      totalCostSold: summary.totalCostSold || undefined,
      totalNetProfit: summary.totalNetProfit || undefined,
      productsWithCost: summary.productsWithCost,
      productsWithoutCost: summary.productsWithoutCost,
      ordersWithCost: summary.ordersWithCost,
      ordersWithoutCost: summary.ordersWithoutCost,
    },

    costBreakdown: costBreakdownPie,
    profitTrends,
    dailyMetrics,
    chargeTypeBreakdown: analytics.chargeTypeBreakdown,

    topProducts,
    worstProducts,
    lossProducts: worstProducts,
    recommendations: [],
    returnReasons: [],
    cancellationReasons: [],

    orders,
    incompleteOrders,
    returnedOrders,

    nonOrderCharges: report.nonOrderCharges.map((c) => ({
      serviceGroup: c.serviceGroup,
      chargeType: c.chargeType,
      totalAmountRub: c.isPoints ? 0 : c.totalAmount,
      totalAmountPoints: c.isPoints ? c.totalAmount : 0,
      count: 1,
      description: "",
    })),
    subscriptions: report.subscriptions.map((s) => ({
      period: s.periodLabel,
      chargeType: s.chargeType,
      totalAmount: s.totalAmount,
      chargeDate: s.chargeDate,
    })),

    schemeStats: analytics.schemeStats,
    problemAreas: [],

    costReports,
  };

  return result;
}

function buildCostReports(orders: any[], products: ProductData[]) {
  const productsWithCost = products.filter((p) => p.hasCost);
  const productsWithoutCost = products.filter((p) => !p.hasCost);
  const ordersWithCost = orders.filter((o) => o.hasCost);
  const ordersWithoutCost = orders.filter((o) => !o.hasCost);

  const totalCost = productsWithCost.reduce((s, p) => s + (p.totalCost || 0), 0);
  const totalCostSold = ordersWithCost.reduce(
    (s, o) => (o.classification === "success" || o.classification === "partial_return" ? s + (o.totalCost || 0) : s),
    0
  );
  const totalNetProfit = ordersWithCost.reduce((s, o) => s + ((o.totalAmountRub || 0) - (o.totalCost || 0)), 0);

  return {
    productsWithCost,
    productsWithoutCost,
    ordersWithCost,
    ordersWithoutCost,
    totalCost,
    totalCostSold,
    totalNetProfit,
    articlesComparison: {
      costArticles: [],
      orderArticles: [],
    },
  };
}

/**
 * Утилита: извлекает ChargeLine из отчёта по orderKey, пригодна для экспорта.
 */
export function chargesByOrderKey(charges: ChargeLine[]): Map<string, ChargeLine[]> {
  const out = new Map<string, ChargeLine[]>();
  for (const c of charges) {
    if (!c.orderKey) continue;
    let arr = out.get(c.orderKey);
    if (!arr) {
      arr = [];
      out.set(c.orderKey, arr);
    }
    arr.push(c);
  }
  return out;
}
