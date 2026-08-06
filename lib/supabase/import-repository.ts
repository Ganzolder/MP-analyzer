/**
 * Репозиторий импортов в Supabase.
 *
 * Сохраняет результат пайплайна (ConsolidationResult) в 7 таблиц, читает его
 * обратно при запросе истории / деталей и умеет удалять каскадно.
 *
 * ВАЖНО: все публичные методы принимают iaoUserId и сами фильтруют данные.
 * Service-role-ключ игнорирует RLS — изоляция по пользователю держится на уровне
 * репозитория.
 */

import "server-only";
import { getSupabaseServerClient } from "./server";
import type {
  ChargeLine,
  ConsolidatedReport,
  NonOrderCharge,
  Order,
  OrderItem,
  ProductAggregate,
  Shipment,
  SubscriptionCharge,
} from "@/lib/analysis/domain";
import type { ConsolidationAnalytics } from "@/lib/analysis/pipeline";

export interface ImportListEntry {
  id: string;
  fileNames: string[];
  fileSizes: number[];
  periodStart: string | null;
  periodEnd: string | null;
  periodLabel: string | null;
  createdAt: string;
  summary: Record<string, any>;
}

export interface FullImport {
  id: string;
  iaoUserId: string;
  fileNames: string[];
  fileSizes: number[];
  periodStart: Date | null;
  periodEnd: Date | null;
  periodLabel: string;
  summary: Record<string, any>;
  costBreakdown: Record<string, any>;
  schemeStats: Record<string, any>;
  chargeTypeBreakdown: any[];
  dailyMetrics: any[];
  createdAt: Date;

  orders: Order[];
  charges: ChargeLine[];
  nonOrderCharges: NonOrderCharge[];
  subscriptions: SubscriptionCharge[];
  productAggregates: ProductAggregate[];
}

export interface SaveImportInput {
  iaoUserId: string;
  report: ConsolidatedReport;
  analytics: ConsolidationAnalytics;
}

export interface SaveImportResult {
  importId: string;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────
//  Save
// ─────────────────────────────────────────────────────────────

export async function saveImport(input: SaveImportInput): Promise<SaveImportResult> {
  const supabase = getSupabaseServerClient();
  const { iaoUserId, report, analytics } = input;

  const { data: imp, error: impErr } = await supabase
    .from("mp_imports")
    .insert({
      iao_user_id: iaoUserId,
      file_names: report.sourceFiles.map((f) => f.fileName),
      file_sizes: report.sourceFiles.map((f) => f.size),
      period_start: report.periodStart.toISOString(),
      period_end: report.periodEnd.toISOString(),
      period_label: report.periodLabel,
      status: "ready",
      summary: analytics.summary as any,
      cost_breakdown: analytics.costBreakdown as any,
      scheme_stats: analytics.schemeStats as any,
      charge_type_breakdown: analytics.chargeTypeBreakdown as any,
      daily_metrics: analytics.daily as any,
    })
    .select("id, created_at")
    .single();

  if (impErr || !imp) {
    throw new Error(`Не удалось создать импорт: ${impErr?.message ?? "неизвестная ошибка"}`);
  }
  const importId = imp.id as string;

  try {
    await insertOrders(importId, iaoUserId, report.orders);
    await insertOrderCharges(importId, iaoUserId, report.charges, report.orders);
    await insertNonOrderCharges(importId, iaoUserId, report.nonOrderCharges);
    await insertSubscriptions(importId, iaoUserId, report.subscriptions);
    await insertProductAggregates(importId, iaoUserId, analytics.productAggregates);
  } catch (err) {
    await supabase.from("mp_imports").delete().eq("id", importId);
    throw err;
  }

  return { importId, createdAt: imp.created_at as string };
}

async function insertOrders(importId: string, userId: string, orders: Order[]): Promise<void> {
  if (!orders.length) return;
  const supabase = getSupabaseServerClient();

  const orderRows = orders.map((o) => ({
    import_id: importId,
    iao_user_id: userId,
    order_key: o.orderKey,
    classification: o.classification,
    first_charge_date: dateOrNull(o.firstChargeDate),
    last_charge_date: dateOrNull(o.lastChargeDate),
    order_date: dateOrNull(o.orderDate),
    work_scheme: o.workScheme,
    platform: o.platform,
    totals: o.totals as any,
    total_amount_rub: o.totalAmountRub,
    points_amount: o.pointsAmount,
    has_acquiring: o.hasAcquiring,
    has_logistics: o.hasLogistics,
    has_revenue: o.hasRevenue,
    has_commission: o.hasCommission,
    has_return: o.hasReturnLogisticsOrProcessing,
    total_cost: o.totalCost,
    has_cost: o.hasCost,
    charge_types: Array.from(o.chargeTypes),
  }));

  const { data: insertedOrders, error } = await supabase
    .from("mp_orders")
    .insert(orderRows)
    .select("id, order_key");
  if (error || !insertedOrders) {
    throw new Error(`Не удалось сохранить заказы: ${error?.message ?? "empty"}`);
  }

  const orderIdByKey = new Map<string, string>();
  for (const row of insertedOrders) orderIdByKey.set(row.order_key as string, row.id as string);

  const shipmentRows: any[] = [];
  const itemRows: any[] = [];
  const shipmentIndex: Array<{ orderKey: string; shipmentKey: string; shipment: Shipment }> = [];

  for (const o of orders) {
    const orderId = orderIdByKey.get(o.orderKey);
    if (!orderId) continue;
    for (const s of o.shipments) {
      shipmentRows.push({
        order_id: orderId,
        import_id: importId,
        iao_user_id: userId,
        shipment_key: s.shipmentKey,
        status: s.status,
        charge_types: Array.from(s.chargeTypes),
      });
      shipmentIndex.push({ orderKey: o.orderKey, shipmentKey: s.shipmentKey, shipment: s });
    }
  }

  if (shipmentRows.length) {
    const { data: insertedShipments, error: sErr } = await supabase
      .from("mp_shipments")
      .insert(shipmentRows)
      .select("id, order_id, shipment_key");
    if (sErr || !insertedShipments) {
      throw new Error(`Не удалось сохранить отправления: ${sErr?.message ?? "empty"}`);
    }
    const shipmentIdByKey = new Map<string, string>();
    for (const row of insertedShipments) {
      shipmentIdByKey.set(`${row.order_id}||${row.shipment_key}`, row.id as string);
    }

    for (const { orderKey, shipmentKey, shipment } of shipmentIndex) {
      const orderId = orderIdByKey.get(orderKey)!;
      const shipmentId = shipmentIdByKey.get(`${orderId}||${shipmentKey}`);
      if (!shipmentId) continue;
      for (const it of shipment.items) {
        itemRows.push(itemToRow(importId, orderId, shipmentId, userId, it));
      }
    }
  }

  if (itemRows.length) {
    const { error: iErr } = await supabase.from("mp_order_items").insert(itemRows);
    if (iErr) throw new Error(`Не удалось сохранить позиции: ${iErr.message}`);
  }

  (insertOrders as any)._orderIdByKey = orderIdByKey;
}

function itemToRow(
  importId: string,
  orderId: string,
  shipmentId: string,
  userId: string,
  it: OrderItem
) {
  return {
    import_id: importId,
    order_id: orderId,
    shipment_id: shipmentId,
    iao_user_id: userId,
    article: it.article,
    sku: it.sku,
    product_name: it.productName,
    quantity_sold: it.quantitySold,
    quantity_returned: it.quantityReturned,
    seller_price: it.sellerPrice,
    cost_per_unit: it.costPerUnit,
    cogs: it.cogs,
  };
}

async function insertOrderCharges(
  importId: string,
  userId: string,
  charges: ChargeLine[],
  orders: Order[]
): Promise<void> {
  if (!charges.length) return;
  const supabase = getSupabaseServerClient();

  const orderIdByKey: Map<string, string> | undefined = (insertOrders as any)._orderIdByKey;

  const rows = charges.map((c) => ({
    import_id: importId,
    iao_user_id: userId,
    order_id: c.orderKey && orderIdByKey ? orderIdByKey.get(c.orderKey) ?? null : null,
    source_file: c.sourceFile,
    source_row: c.sourceRow,
    charge_id: c.chargeId,
    order_key: c.orderKey,
    shipment_suffix: c.shipmentSuffix,
    charge_date: dateOrNull(c.chargeDate),
    service_group: c.serviceGroup,
    charge_type: c.chargeType,
    category: c.category,
    article: c.article,
    sku: c.sku,
    product_name: c.productName,
    quantity: Math.round(c.quantity || 0),
    seller_price: c.sellerPrice,
    order_date: dateOrNull(c.orderDate),
    platform: c.platform,
    work_scheme: c.workScheme,
    ozon_commission_percent: c.ozonCommissionPercent,
    localization_index: c.localizationIndex,
    avg_delivery_hours: c.avgDeliveryHours,
    total_amount: c.totalAmount,
    is_points: c.isPoints,
  }));
  void orders;

  await insertInChunks(supabase, "mp_order_charges", rows, 500);
}

async function insertNonOrderCharges(
  importId: string,
  userId: string,
  charges: NonOrderCharge[]
): Promise<void> {
  if (!charges.length) return;
  const supabase = getSupabaseServerClient();
  const rows = charges.map((c) => ({
    import_id: importId,
    iao_user_id: userId,
    charge_id: c.chargeId,
    charge_date: dateOrNull(c.chargeDate),
    service_group: c.serviceGroup,
    charge_type: c.chargeType,
    category: c.category,
    total_amount: c.totalAmount,
    is_points: c.isPoints,
    source_file: c.sourceFile,
  }));
  await insertInChunks(supabase, "mp_non_order_charges", rows, 500);
}

async function insertSubscriptions(
  importId: string,
  userId: string,
  subs: SubscriptionCharge[]
): Promise<void> {
  if (!subs.length) return;
  const supabase = getSupabaseServerClient();
  const rows = subs.map((s) => ({
    import_id: importId,
    iao_user_id: userId,
    period_label: s.periodLabel,
    charge_date: dateOrNull(s.chargeDate),
    charge_type: s.chargeType,
    total_amount: s.totalAmount,
    source_file: s.sourceFile,
  }));
  await insertInChunks(supabase, "mp_subscriptions", rows, 500);
}

async function insertProductAggregates(
  importId: string,
  userId: string,
  products: ProductAggregate[]
): Promise<void> {
  if (!products.length) return;
  const supabase = getSupabaseServerClient();
  const rows = products.map((p) => ({
    import_id: importId,
    iao_user_id: userId,
    article: p.article,
    sku: p.sku,
    product_name: p.productName,
    units_sold: p.unitsSold,
    units_returned: p.unitsReturned,
    orders_count: p.ordersCount,
    returns_count: p.returnsCount,
    revenue: p.revenue,
    commission: p.commission,
    logistics: p.logistics,
    returns_amount: p.returnsAmount,
    net_amount: p.netAmount,
    cost_per_unit: p.costPerUnit,
    total_cost: p.totalCost,
    net_profit: p.netProfit,
    has_cost: p.hasCost,
  }));
  await insertInChunks(supabase, "mp_products_agg", rows, 500);
}

// ─────────────────────────────────────────────────────────────
//  Read
// ─────────────────────────────────────────────────────────────

/** PostgREST (Supabase) отдаёт не более 1000 строк за один запрос. */
const SUPABASE_PAGE_SIZE = 1000;

async function selectAllByImportId(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  table: string,
  importId: string
): Promise<any[]> {
  const rows: any[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("import_id", importId)
      .order("id", { ascending: true })
      .range(offset, offset + SUPABASE_PAGE_SIZE - 1);
    if (error) throw new Error(`loadImport select ${table}: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < SUPABASE_PAGE_SIZE) break;
    offset += SUPABASE_PAGE_SIZE;
  }
  return rows;
}

export async function listImports(iaoUserId: string): Promise<ImportListEntry[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("mp_imports")
    .select(
      "id, file_names, file_sizes, period_start, period_end, period_label, created_at, summary"
    )
    .eq("iao_user_id", iaoUserId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listImports: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    fileNames: row.file_names ?? [],
    fileSizes: (row.file_sizes ?? []).map((n: string | number) => Number(n)),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    periodLabel: row.period_label,
    createdAt: row.created_at,
    summary: row.summary ?? {},
  }));
}

export async function loadImport(iaoUserId: string, importId: string): Promise<FullImport | null> {
  const supabase = getSupabaseServerClient();
  const { data: imp, error } = await supabase
    .from("mp_imports")
    .select("*")
    .eq("iao_user_id", iaoUserId)
    .eq("id", importId)
    .maybeSingle();
  if (error) throw new Error(`loadImport: ${error.message}`);
  if (!imp) return null;

  const [
    ordersRows,
    shipmentsRows,
    itemsRows,
    chargesRows,
    nonOrderRows,
    subsRows,
    productsRows,
  ] = await Promise.all([
    selectAllByImportId(supabase, "mp_orders", importId),
    selectAllByImportId(supabase, "mp_shipments", importId),
    selectAllByImportId(supabase, "mp_order_items", importId),
    selectAllByImportId(supabase, "mp_order_charges", importId),
    selectAllByImportId(supabase, "mp_non_order_charges", importId),
    selectAllByImportId(supabase, "mp_subscriptions", importId),
    selectAllByImportId(supabase, "mp_products_agg", importId),
  ]);

  const shipmentsByOrder = groupBy(shipmentsRows, (r: any) => r.order_id as string);
  const itemsByShipment = groupBy(itemsRows, (r: any) => r.shipment_id as string);

  const orders: Order[] = ordersRows.map((row: any) => {
    const shipments: Shipment[] = (shipmentsByOrder.get(row.id) ?? []).map((s: any) => ({
      shipmentKey: s.shipment_key ?? "",
      status: s.status,
      chargeTypes: new Set<string>(s.charge_types ?? []),
      items: (itemsByShipment.get(s.id) ?? []).map((it: any) => ({
        shipmentKey: s.shipment_key ?? "",
        article: it.article ?? "",
        productName: it.product_name ?? "",
        sku: it.sku ?? "",
        quantitySold: Number(it.quantity_sold ?? 0),
        quantityReturned: Number(it.quantity_returned ?? 0),
        sellerPrice: Number(it.seller_price ?? 0),
        costPerUnit: it.cost_per_unit != null ? Number(it.cost_per_unit) : null,
        cogs: Number(it.cogs ?? 0),
      })),
    }));

    return {
      orderKey: row.order_key,
      classification: row.classification,
      firstChargeDate: row.first_charge_date ? new Date(row.first_charge_date) : new Date(0),
      lastChargeDate: row.last_charge_date ? new Date(row.last_charge_date) : new Date(0),
      orderDate: row.order_date ? new Date(row.order_date) : null,
      workScheme: row.work_scheme ?? "",
      platform: row.platform ?? "",
      shipments,
      chargeTypes: new Set<string>(row.charge_types ?? []),
      totals: row.totals ?? {},
      totalAmountRub: Number(row.total_amount_rub ?? 0),
      pointsAmount: Number(row.points_amount ?? 0),
      hasAcquiring: !!row.has_acquiring,
      hasLogistics: !!row.has_logistics,
      hasRevenue: !!row.has_revenue,
      hasCommission: !!row.has_commission,
      hasReturnLogisticsOrProcessing: !!row.has_return,
      qtySumLogistics: Number((row as any).qty_sum_logistics ?? 0),
      qtySumReturnLogistics: Number((row as any).qty_sum_return_logistics ?? 0),
      qtySumReturnProcessing: Number((row as any).qty_sum_return_processing ?? 0),
      totalCost: Number(row.total_cost ?? 0),
      hasCost: !!row.has_cost,
    };
  });

  const charges: ChargeLine[] = chargesRows.map((c: any) => ({
    sourceFile: c.source_file ?? "",
    sourceRow: c.source_row ?? 0,
    chargeId: c.charge_id ?? "",
    orderKey: c.order_key ?? null,
    shipmentSuffix: c.shipment_suffix ?? null,
    chargeDate: c.charge_date ? new Date(c.charge_date) : new Date(0),
    serviceGroup: c.service_group ?? "",
    chargeType: c.charge_type ?? "",
    category: c.category ?? "other",
    article: c.article ?? "",
    sku: c.sku ?? "",
    productName: c.product_name ?? "",
    quantity: Number(c.quantity ?? 0),
    sellerPrice: Number(c.seller_price ?? 0),
    orderDate: c.order_date ? new Date(c.order_date) : null,
    platform: c.platform ?? "",
    workScheme: c.work_scheme ?? "",
    ozonCommissionPercent: Number(c.ozon_commission_percent ?? 0),
    localizationIndex: Number(c.localization_index ?? 0),
    avgDeliveryHours: Number(c.avg_delivery_hours ?? 0),
    totalAmount: Number(c.total_amount ?? 0),
    isPoints: !!c.is_points,
  }));

  const nonOrderCharges: NonOrderCharge[] = nonOrderRows.map((c: any) => ({
    chargeId: c.charge_id ?? "",
    chargeDate: c.charge_date ? new Date(c.charge_date) : new Date(0),
    serviceGroup: c.service_group ?? "",
    chargeType: c.charge_type ?? "",
    category: c.category ?? "other",
    totalAmount: Number(c.total_amount ?? 0),
    isPoints: !!c.is_points,
    sourceFile: c.source_file ?? "",
  }));

  const subscriptions: SubscriptionCharge[] = subsRows.map((s: any) => ({
    periodLabel: s.period_label ?? "",
    chargeDate: s.charge_date ? new Date(s.charge_date) : new Date(0),
    chargeType: s.charge_type ?? "",
    totalAmount: Number(s.total_amount ?? 0),
    sourceFile: s.source_file ?? "",
  }));

  const productAggregates: ProductAggregate[] = productsRows.map((p: any) => ({
    article: p.article ?? "",
    sku: p.sku ?? "",
    productName: p.product_name ?? "",
    unitsSold: Number(p.units_sold ?? 0),
    unitsReturned: Number(p.units_returned ?? 0),
    ordersCount: Number(p.orders_count ?? 0),
    returnsCount: Number(p.returns_count ?? 0),
    revenue: Number(p.revenue ?? 0),
    commission: Number(p.commission ?? 0),
    logistics: Number(p.logistics ?? 0),
    returnsAmount: Number(p.returns_amount ?? 0),
    netAmount: Number(p.net_amount ?? 0),
    costPerUnit: p.cost_per_unit != null ? Number(p.cost_per_unit) : null,
    totalCost: Number(p.total_cost ?? 0),
    netProfit: p.net_profit != null ? Number(p.net_profit) : null,
    hasCost: !!p.has_cost,
  }));

  return {
    id: imp.id,
    iaoUserId,
    fileNames: imp.file_names ?? [],
    fileSizes: (imp.file_sizes ?? []).map((n: string | number) => Number(n)),
    periodStart: imp.period_start ? new Date(imp.period_start) : null,
    periodEnd: imp.period_end ? new Date(imp.period_end) : null,
    periodLabel: imp.period_label ?? "",
    summary: imp.summary ?? {},
    costBreakdown: imp.cost_breakdown ?? {},
    schemeStats: imp.scheme_stats ?? {},
    chargeTypeBreakdown: imp.charge_type_breakdown ?? [],
    dailyMetrics: imp.daily_metrics ?? [],
    createdAt: imp.created_at ? new Date(imp.created_at) : new Date(0),
    orders,
    charges,
    nonOrderCharges,
    subscriptions,
    productAggregates,
  };
}

export async function deleteImport(iaoUserId: string, importId: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { error, count } = await supabase
    .from("mp_imports")
    .delete({ count: "exact" })
    .eq("iao_user_id", iaoUserId)
    .eq("id", importId);
  if (error) throw new Error(`deleteImport: ${error.message}`);
  return (count ?? 0) > 0;
}

// ─────────────────────────────────────────────────────────────
//  Cost uploads
// ─────────────────────────────────────────────────────────────

export async function getCostMap(iaoUserId: string): Promise<Map<string, number> | undefined> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("mp_user_cost_uploads")
    .select("cost_map")
    .eq("iao_user_id", iaoUserId)
    .maybeSingle();
  if (error) throw new Error(`getCostMap: ${error.message}`);
  if (!data || !data.cost_map) return undefined;
  const raw = data.cost_map as Record<string, number | string>;
  const map = new Map<string, number>();
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(v);
    if (!isNaN(n)) map.set(k, n);
  }
  return map.size ? map : undefined;
}

export async function upsertCostMap(
  iaoUserId: string,
  fileName: string,
  map: Map<string, number>
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const costMap: Record<string, number> = {};
  for (const [k, v] of map) costMap[k] = v;
  const { error } = await supabase
    .from("mp_user_cost_uploads")
    .upsert(
      {
        iao_user_id: iaoUserId,
        file_name: fileName,
        cost_map: costMap,
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: "iao_user_id" }
    );
  if (error) throw new Error(`upsertCostMap: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

function dateOrNull(d: Date | null | undefined): string | null {
  if (!d) return null;
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function groupBy<T, K>(arr: T[], keyFn: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of arr) {
    const k = keyFn(item);
    let list = out.get(k);
    if (!list) {
      list = [];
      out.set(k, list);
    }
    list.push(item);
  }
  return out;
}

async function insertInChunks(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  table: string,
  rows: any[],
  chunkSize: number
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`insert ${table}: ${error.message}`);
  }
}
