/**
 * Построение агрегированных метрик поверх Order[] + NonOrderCharge[] + Subscription[].
 *
 * Выходные структуры:
 *   - summary            — глобальная сводка (выручка, удержания, к выплате, заказы…).
 *   - productAggregates  — per-article агрегаты по всему импорту.
 *   - daily              — метрики по дням для графиков.
 *   - costBreakdown      — pie-chart удержаний.
 *   - schemeStats        — FBO/FBS/other.
 *   - chargeTypeBreakdown— drill-down по типам начислений.
 *
 * Ничего не знает о том, как это показывать в UI — только о доменной модели.
 */

import { round } from "../data-utils";
import {
  CATEGORY_GROUP_LABEL,
  FEE_CATEGORIES,
  type ChargeCategory,
} from "../charge-types";
import type {
  ChargeLine,
  DailyMetricPoint,
  NonOrderCharge,
  Order,
  OrderCategoryTotals,
  ProductAggregate,
  SubscriptionCharge,
} from "../domain";

export interface Summary {
  grossRevenue: number;
  revenueAmount: number;
  pointsAmount: number;
  partnerProgramsAmount: number;
  grossBySellerPrice: number;
  ozonFees: number;
  netPayout: number;
  actualPayout: number;
  feesPercent: number;

  totalOrders: number;
  successOrders: number;
  partialReturnOrders: number;
  fullReturnOrders: number;
  incompleteOrders: number;

  totalProducts: number;
  avgOrderValue: number;
  avgCommissionPercent: number;
  returnRate: number;

  totalCost: number;
  totalCostSold: number;
  totalNetProfit: number;

  productsWithCost: number;
  productsWithoutCost: number;
  ordersWithCost: number;
  ordersWithoutCost: number;
}

export interface CostBreakdown {
  commission: number;
  logistics: number;
  returns: number;
  storage: number;
  advertising: number;
  subscriptions: number;
  penalties: number;
  other: number;
  total: number;
}

export interface SchemeStats {
  fbo: { orders: number; amount: number };
  fbs: { orders: number; amount: number };
  other: { orders: number; amount: number };
}

export interface ChargeTypeBreakdownGroup {
  groupName: string;
  amount: number;
  count: number;
  chargeTypes: Array<{ name: string; amount: number; count: number }>;
}

export interface ConsolidationAnalytics {
  summary: Summary;
  costBreakdown: CostBreakdown;
  schemeStats: SchemeStats;
  chargeTypeBreakdown: ChargeTypeBreakdownGroup[];
  daily: DailyMetricPoint[];
  productAggregates: ProductAggregate[];
}

// ─────────────────────────────────────────────────────────────
//  Summary
// ─────────────────────────────────────────────────────────────

function sumFees(totals: OrderCategoryTotals): number {
  let sum = 0;
  for (const cat of FEE_CATEGORIES) {
    const key = cat as keyof OrderCategoryTotals;
    const v = totals[key];
    if (typeof v !== "number") continue;
    if (cat === "acquiring") {
      // NET по заказу: положительный эквайринг (возврат по заказу)
      // схлапывается с отрицательным (оплата). Если NET ≥ 0 — в удержания не идёт.
      sum += v < 0 ? Math.abs(v) : 0;
    } else {
      sum += Math.abs(v);
    }
  }
  return sum;
}

export function buildSummary(
  orders: Order[],
  nonOrder: NonOrderCharge[],
  subscriptions: SubscriptionCharge[],
  products: ProductAggregate[]
): Summary {
  let revenueAmount = 0;
  let pointsAmount = 0;
  let partnerProgramsAmount = 0;
  let grossBySellerPrice = 0;
  let totalFees = 0;
  let actualPayout = 0;
  let commissionSum = 0;

  let successOrders = 0;
  let partialReturnOrders = 0;
  let fullReturnOrders = 0;
  let incompleteOrders = 0;
  let ordersWithCost = 0;
  let ordersWithoutCost = 0;
  let totalCost = 0;
  let totalCostSold = 0;

  for (const o of orders) {
    revenueAmount += o.totals.revenue + o.totals.returnRevenue;
    pointsAmount += o.pointsAmount;
    partnerProgramsAmount += o.totals.partnerPrograms;
    totalFees += sumFees(o.totals);
    actualPayout += o.totalAmountRub;
    commissionSum += Math.abs(o.totals.commission);

    // Валовая по цене продавца: per-item, только доставленные единицы.
    for (const s of o.shipments) {
      for (const it of s.items) {
        const delivered = Math.max(0, it.quantitySold - it.quantityReturned);
        grossBySellerPrice += delivered * (it.sellerPrice || 0);
      }
    }

    switch (o.classification) {
      case "success":
        successOrders++;
        break;
      case "partial_return":
        partialReturnOrders++;
        break;
      case "full_return":
        fullReturnOrders++;
        break;
      case "incomplete":
        incompleteOrders++;
        break;
    }

    if (o.hasCost) {
      ordersWithCost++;
      totalCost += o.totalCost;
      if (o.classification === "success" || o.classification === "partial_return") {
        totalCostSold += o.totalCost;
      }
    } else {
      ordersWithoutCost++;
    }
  }

  for (const ch of nonOrder) {
    actualPayout += ch.totalAmount;
    if (ch.category === "acquiring") {
      if (ch.totalAmount < 0) totalFees += Math.abs(ch.totalAmount);
    } else if (ch.totalAmount < 0) {
      totalFees += Math.abs(ch.totalAmount);
    }
    if (ch.category === "revenue") revenueAmount += ch.totalAmount;
    if (ch.category === "points") pointsAmount += ch.totalAmount;
    if (ch.category === "partnerPrograms") partnerProgramsAmount += ch.totalAmount;
  }

  for (const s of subscriptions) {
    actualPayout += s.totalAmount;
    totalFees += Math.abs(s.totalAmount);
  }

  const grossRevenue = revenueAmount + pointsAmount + partnerProgramsAmount;
  // Новая формула «Итого начислено»: валовая по цене продавца − удержания Ozon.
  const netPayout = grossBySellerPrice - totalFees;
  const feesPercent = grossBySellerPrice > 0 ? (totalFees / grossBySellerPrice) * 100 : 0;
  const totalOrders = orders.length;
  const completedLike = successOrders + partialReturnOrders;
  const avgOrderValue = completedLike > 0 ? grossRevenue / completedLike : 0;
  const returnRate =
    totalOrders > 0 ? ((fullReturnOrders + partialReturnOrders) / totalOrders) * 100 : 0;
  const avgCommission = grossRevenue > 0 ? (commissionSum / grossRevenue) * 100 : 0;
  const productsWithCost = products.filter((p) => p.hasCost).length;
  const productsWithoutCost = products.length - productsWithCost;
  const totalNetProfit = totalCostSold > 0 ? netPayout - totalCostSold : 0;

  return {
    grossRevenue: round(grossRevenue),
    revenueAmount: round(revenueAmount),
    pointsAmount: round(pointsAmount),
    partnerProgramsAmount: round(partnerProgramsAmount),
    grossBySellerPrice: round(grossBySellerPrice),
    ozonFees: round(totalFees),
    netPayout: round(netPayout),
    actualPayout: round(actualPayout),
    feesPercent: round(feesPercent, 1),

    totalOrders,
    successOrders,
    partialReturnOrders,
    fullReturnOrders,
    incompleteOrders,

    totalProducts: products.length,
    avgOrderValue: round(avgOrderValue),
    avgCommissionPercent: round(avgCommission, 1),
    returnRate: round(returnRate, 1),

    totalCost: round(totalCost),
    totalCostSold: round(totalCostSold),
    totalNetProfit: round(totalNetProfit),

    productsWithCost,
    productsWithoutCost,
    ordersWithCost,
    ordersWithoutCost,
  };
}

// ─────────────────────────────────────────────────────────────
//  CostBreakdown
// ─────────────────────────────────────────────────────────────

export function buildCostBreakdown(
  orders: Order[],
  nonOrder: NonOrderCharge[],
  subscriptions: SubscriptionCharge[]
): CostBreakdown {
  let commission = 0;
  let logistics = 0;
  let returns = 0;
  let storage = 0;
  let advertising = 0;
  let penalties = 0;
  let subs = 0;
  let other = 0;

  for (const o of orders) {
    commission += Math.abs(o.totals.commission + o.totals.returnCommission);
    logistics += Math.abs(o.totals.logistics);
    returns +=
      Math.abs(o.totals.returnLogistics) +
      Math.abs(o.totals.returnProcessing) +
      Math.abs(o.totals.partialReturn);
    storage += Math.abs(o.totals.storage);
    advertising += Math.abs(o.totals.advertising);
    penalties += Math.abs(o.totals.penalties);
    if (o.totals.other < 0) other += Math.abs(o.totals.other);
  }

  for (const ch of nonOrder) {
    const amt = Math.abs(ch.totalAmount);
    if (ch.totalAmount >= 0) continue;
    switch (ch.category) {
      case "storage":
        storage += amt;
        break;
      case "advertising":
        advertising += amt;
        break;
      case "penalties":
        penalties += amt;
        break;
      case "logistics":
        logistics += amt;
        break;
      case "commission":
      case "returnCommission":
        commission += amt;
        break;
      case "returnLogistics":
      case "returnProcessing":
      case "partialReturn":
        returns += amt;
        break;
      default:
        other += amt;
    }
  }

  for (const s of subscriptions) subs += Math.abs(s.totalAmount);

  const total = commission + logistics + returns + storage + advertising + penalties + subs + other;

  return {
    commission: round(commission),
    logistics: round(logistics),
    returns: round(returns),
    storage: round(storage),
    advertising: round(advertising),
    subscriptions: round(subs),
    penalties: round(penalties),
    other: round(other),
    total: round(total),
  };
}

// ─────────────────────────────────────────────────────────────
//  Scheme stats
// ─────────────────────────────────────────────────────────────

export function buildSchemeStats(orders: Order[]): SchemeStats {
  const stats: SchemeStats = {
    fbo: { orders: 0, amount: 0 },
    fbs: { orders: 0, amount: 0 },
    other: { orders: 0, amount: 0 },
  };
  for (const o of orders) {
    const scheme = (o.workScheme || "").toLowerCase();
    const amount = o.totalAmountRub;
    if (scheme.includes("fbo") || scheme.includes("фбо")) {
      stats.fbo.orders++;
      stats.fbo.amount += amount;
    } else if (scheme.includes("fbs") || scheme.includes("фбс")) {
      stats.fbs.orders++;
      stats.fbs.amount += amount;
    } else {
      stats.other.orders++;
      stats.other.amount += amount;
    }
  }
  stats.fbo.amount = round(stats.fbo.amount);
  stats.fbs.amount = round(stats.fbs.amount);
  stats.other.amount = round(stats.other.amount);
  return stats;
}

// ─────────────────────────────────────────────────────────────
//  ChargeTypeBreakdown
// ─────────────────────────────────────────────────────────────

export function buildChargeTypeBreakdown(charges: ChargeLine[]): ChargeTypeBreakdownGroup[] {
  const groups = new Map<
    ChargeCategory,
    { amount: number; count: number; types: Map<string, { amount: number; count: number }> }
  >();

  for (const line of charges) {
    if (line.isPoints) continue; // баллы не деньги
    const cat = line.category;
    let g = groups.get(cat);
    if (!g) {
      g = { amount: 0, count: 0, types: new Map() };
      groups.set(cat, g);
    }
    g.amount += line.totalAmount;
    g.count += 1;
    let t = g.types.get(line.chargeType);
    if (!t) {
      t = { amount: 0, count: 0 };
      g.types.set(line.chargeType, t);
    }
    t.amount += line.totalAmount;
    t.count += 1;
  }

  const out: ChargeTypeBreakdownGroup[] = [];
  for (const [cat, g] of groups) {
    out.push({
      groupName: CATEGORY_GROUP_LABEL[cat],
      amount: round(g.amount),
      count: g.count,
      chargeTypes: Array.from(g.types.entries())
        .map(([name, data]) => ({ name, amount: round(data.amount), count: data.count }))
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    });
  }
  out.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  return out;
}

// ─────────────────────────────────────────────────────────────
//  Daily
// ─────────────────────────────────────────────────────────────

function dateKey(d: Date): string {
  if (!d || isNaN(d.getTime())) return "1970-01-01";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildDaily(orders: Order[]): DailyMetricPoint[] {
  const map = new Map<string, DailyMetricPoint>();
  const ensure = (key: string): DailyMetricPoint => {
    let p = map.get(key);
    if (!p) {
      p = {
        date: key,
        ordersCount: 0,
        returnsCount: 0,
        revenue: 0,
        commission: 0,
        logistics: 0,
        returns: 0,
        netAmount: 0,
        pointsAmount: 0,
        totalCost: 0,
        netProfit: 0,
      };
      map.set(key, p);
    }
    return p;
  };

  for (const o of orders) {
    const key = dateKey(o.firstChargeDate);
    const p = ensure(key);
    p.ordersCount += 1;
    if (o.classification === "full_return" || o.classification === "partial_return") {
      p.returnsCount += 1;
    }
    p.revenue += o.totals.revenue + o.totals.returnRevenue;
    p.commission += Math.abs(o.totals.commission + o.totals.returnCommission);
    p.logistics += Math.abs(o.totals.logistics);
    p.returns +=
      Math.abs(o.totals.returnLogistics) +
      Math.abs(o.totals.returnProcessing) +
      Math.abs(o.totals.partialReturn);
    p.netAmount += o.totalAmountRub;
    p.pointsAmount += o.pointsAmount;
    if (o.hasCost) {
      p.totalCost += o.totalCost;
      p.netProfit += o.totalAmountRub - o.totalCost;
    } else {
      p.netProfit += o.totalAmountRub;
    }
  }

  return Array.from(map.values())
    .map((p) => ({
      ...p,
      revenue: round(p.revenue),
      commission: round(p.commission),
      logistics: round(p.logistics),
      returns: round(p.returns),
      netAmount: round(p.netAmount),
      pointsAmount: round(p.pointsAmount),
      totalCost: round(p.totalCost),
      netProfit: round(p.netProfit),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─────────────────────────────────────────────────────────────
//  Product aggregates
// ─────────────────────────────────────────────────────────────

export function buildProductAggregates(orders: Order[]): ProductAggregate[] {
  const map = new Map<string, ProductAggregate>();

  for (const order of orders) {
    const orderFeesByItem = distributeOrderFeesToItems(order);

    for (const s of order.shipments) {
      for (const it of s.items) {
        const key = productKey(it.article, it.productName);
        if (!key) continue;

        let agg = map.get(key);
        if (!agg) {
          agg = {
            article: it.article,
            sku: it.sku,
            productName: it.productName,
            unitsSold: 0,
            unitsReturned: 0,
            ordersCount: 0,
            returnsCount: 0,
            revenue: 0,
            commission: 0,
            logistics: 0,
            returnsAmount: 0,
            netAmount: 0,
            costPerUnit: it.costPerUnit,
            totalCost: 0,
            netProfit: null,
            hasCost: false,
          };
          map.set(key, agg);
        } else {
          if (!agg.article && it.article) agg.article = it.article;
          if (!agg.productName && it.productName) agg.productName = it.productName;
          if (!agg.sku && it.sku) agg.sku = it.sku;
          if (agg.costPerUnit == null && it.costPerUnit != null) agg.costPerUnit = it.costPerUnit;
        }

        const fees = orderFeesByItem.get(itemFeeKey(s.shipmentKey, key)) || {
          revenue: 0,
          commission: 0,
          logistics: 0,
          returns: 0,
          net: 0,
        };

        agg.unitsSold += Math.max(0, it.quantitySold - it.quantityReturned);
        agg.unitsReturned += it.quantityReturned;
        agg.ordersCount += 1;
        if (it.quantityReturned > 0) agg.returnsCount += 1;

        agg.revenue += fees.revenue;
        agg.commission += fees.commission;
        agg.logistics += fees.logistics;
        agg.returnsAmount += fees.returns;
        agg.netAmount += fees.net;
        agg.totalCost += it.cogs;
        if (it.costPerUnit != null) agg.hasCost = true;
      }
    }
  }

  const out: ProductAggregate[] = [];
  for (const agg of map.values()) {
    agg.revenue = round(agg.revenue);
    agg.commission = round(agg.commission);
    agg.logistics = round(agg.logistics);
    agg.returnsAmount = round(agg.returnsAmount);
    agg.netAmount = round(agg.netAmount);
    agg.totalCost = round(agg.totalCost);
    agg.netProfit = agg.hasCost ? round(agg.netAmount - agg.totalCost) : null;
    out.push(agg);
  }
  return out;
}

function productKey(article: string, productName: string): string {
  if (article && article.trim()) return `A:${article.trim()}`;
  if (productName && productName.trim()) return `N:${productName.trim()}`;
  return "";
}

function itemFeeKey(shipmentKey: string, pKey: string): string {
  return `${shipmentKey}||${pKey}`;
}

interface ItemFeeAggregate {
  revenue: number;
  commission: number;
  logistics: number;
  returns: number;
  net: number;
}

/**
 * Распределяет суммы заказа по (shipmentKey, itemKey) пропорционально количеству проданных
 * единиц. Для заказа с одним товаром — всё идёт целиком в него. Для мультитоварных — делится
 * по quantitySold.
 */
function distributeOrderFeesToItems(order: Order): Map<string, ItemFeeAggregate> {
  const out = new Map<string, ItemFeeAggregate>();
  const items: Array<{ key: string; qty: number }> = [];
  for (const s of order.shipments) {
    for (const it of s.items) {
      const pk = productKey(it.article, it.productName);
      if (!pk) continue;
      items.push({ key: itemFeeKey(s.shipmentKey, pk), qty: it.quantitySold });
    }
  }

  if (items.length === 0) return out;

  const totalQty = items.reduce((acc, it) => acc + it.qty, 0) || items.length;
  const t = order.totals;
  const totalRevenue = t.revenue + t.returnRevenue;
  const totalCommission = Math.abs(t.commission + t.returnCommission);
  const totalLogistics = Math.abs(t.logistics);
  const totalReturns =
    Math.abs(t.returnLogistics) + Math.abs(t.returnProcessing) + Math.abs(t.partialReturn);
  const totalNet = order.totalAmountRub;

  for (const it of items) {
    const share = it.qty > 0 ? it.qty / totalQty : 1 / items.length;
    out.set(it.key, {
      revenue: totalRevenue * share,
      commission: totalCommission * share,
      logistics: totalLogistics * share,
      returns: totalReturns * share,
      net: totalNet * share,
    });
  }

  return out;
}
