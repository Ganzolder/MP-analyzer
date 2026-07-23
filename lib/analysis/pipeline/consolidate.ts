/**
 * Консолидация ChargeLine[] → Order[] + NonOrderCharge[] + Subscription[].
 *
 * Ключевые правила ТЗ:
 *   - Один заказ — все строки с одним orderKey (префикс ID до первого дефиса).
 *   - Внутри заказа — отправления по shipmentSuffix (может быть null → один "shipment" ""),
 *     это поддерживает кейс "заказ из 4-х шин, отправляемый двумя посылками".
 *   - Товары в одном отправлении группируются по (article || productName).
 *     Количество «продано» (quantitySold) берётся только из строк категории «Выручка» (revenue);
 *     без выручки в отчёте — 0 (заказ «в работе», см. classify).
 *     По категориям quantity суммируется внутри категории; возврат — MAX между return-категориями.
 *   - Штрафы без артикула, относящиеся ко всему заказу, — остаются частью totals заказа,
 *     но не превращаются в OrderItem.
 *   - Баллы за скидки — отдельное pointsAmount, в рубли не попадают.
 *   - Классификация (success / partial_return / full_return / cancelled / incomplete) — в pipeline/classify.ts.
 */

import {
  classifyChargeType,
  isReturnCategory,
  type ChargeCategory,
  type ChargeTypeName,
} from "../charge-types";
import type {
  ChargeLine,
  NonOrderCharge,
  Order,
  OrderCategoryTotals,
  OrderItem,
  Shipment,
  SubscriptionCharge,
} from "../domain";
import { isSubscriptionCharge } from "../keys";

export interface ConsolidationBuckets {
  orders: Order[];
  nonOrderCharges: NonOrderCharge[];
  subscriptions: SubscriptionCharge[];
}

function emptyTotals(): OrderCategoryTotals {
  return {
    revenue: 0,
    commission: 0,
    logistics: 0,
    acquiring: 0,
    returnRevenue: 0,
    returnLogistics: 0,
    returnCommission: 0,
    returnProcessing: 0,
    partialReturn: 0,
    advertising: 0,
    storage: 0,
    penalties: 0,
    compensation: 0,
    partnerPrograms: 0,
    other: 0,
  };
}

function addToTotals(totals: OrderCategoryTotals, category: ChargeCategory, amount: number): void {
  switch (category) {
    case "revenue":
      totals.revenue += amount;
      break;
    case "commission":
      totals.commission += amount;
      break;
    case "logistics":
      totals.logistics += amount;
      break;
    case "acquiring":
      totals.acquiring += amount;
      break;
    case "returnRevenue":
      totals.returnRevenue += amount;
      break;
    case "returnLogistics":
      totals.returnLogistics += amount;
      break;
    case "returnCommission":
      totals.returnCommission += amount;
      break;
    case "returnProcessing":
      totals.returnProcessing += amount;
      break;
    case "partialReturn":
      totals.partialReturn += amount;
      break;
    case "advertising":
      totals.advertising += amount;
      break;
    case "storage":
      totals.storage += amount;
      break;
    case "penalties":
      totals.penalties += amount;
      break;
    case "compensation":
      totals.compensation += amount;
      break;
    case "partnerPrograms":
      totals.partnerPrograms += amount;
      break;
    case "subscription":
      // Внутри заказов такого быть не должно (подписки — это не-заказ),
      // но на всякий случай относим к "other".
      totals.other += amount;
      break;
    case "points":
      // Баллы учитываются отдельно полем pointsAmount — не здесь.
      break;
    case "other":
    default:
      totals.other += amount;
      break;
  }
}

/** Ключ товара внутри отправления: артикул приоритетнее имени. */
function itemKey(article: string, productName: string): string {
  const a = article.trim();
  if (a) return `A:${a}`;
  const n = productName.trim();
  if (n) return `N:${n}`;
  return "";
}

interface ShipmentBuilder {
  shipmentKey: string;
  chargeTypes: Set<ChargeTypeName>;
  items: Map<string, OrderItem>;
  /**
   * Для каждого товара — суммированные quantity по категории начисления.
   * Итоговая quantitySold/quantityReturned:
   *   sold     = только qty из "revenue"
   *   returned = max qty среди return-категорий (не сумма по разным аспектам одного возврата)
   */
  qtyByCatByItem: Map<string, Map<ChargeCategory, number>>;
}

interface OrderBuilder {
  orderKey: string;
  firstChargeDate: Date;
  lastChargeDate: Date;
  orderDate: Date | null;
  workScheme: string;
  platform: string;

  chargeTypes: Set<ChargeTypeName>;
  totals: OrderCategoryTotals;
  totalAmountRub: number;
  pointsAmount: number;
  /** Сумма единиц по строкам (см. Order) */
  qtySumLogistics: number;
  qtySumReturnLogistics: number;
  qtySumReturnProcessing: number;

  shipments: Map<string, ShipmentBuilder>;
}

function ensureOrder(map: Map<string, OrderBuilder>, orderKey: string, line: ChargeLine): OrderBuilder {
  let b = map.get(orderKey);
  if (!b) {
    b = {
      orderKey,
      firstChargeDate: line.chargeDate,
      lastChargeDate: line.chargeDate,
      orderDate: line.orderDate,
      workScheme: line.workScheme,
      platform: line.platform,
      chargeTypes: new Set<ChargeTypeName>(),
      totals: emptyTotals(),
      totalAmountRub: 0,
      pointsAmount: 0,
      qtySumLogistics: 0,
      qtySumReturnLogistics: 0,
      qtySumReturnProcessing: 0,
      shipments: new Map(),
    };
    map.set(orderKey, b);
  }
  return b;
}

function ensureShipment(order: OrderBuilder, shipmentKey: string): ShipmentBuilder {
  let s = order.shipments.get(shipmentKey);
  if (!s) {
    s = {
      shipmentKey,
      chargeTypes: new Set<ChargeTypeName>(),
      items: new Map(),
      qtyByCatByItem: new Map(),
    };
    order.shipments.set(shipmentKey, s);
  }
  return s;
}

function recordItem(
  shipment: ShipmentBuilder,
  line: ChargeLine,
  _isReturn: boolean
): void {
  void _isReturn;
  const key = itemKey(line.article, line.productName);
  if (!key) return;

  const qty = Math.abs(line.quantity);

  // Накапливаем qty по категории (sum внутри одной категории — на случай,
  // если Ozon разбил Выручку/возврат на несколько строк).
  if (qty > 0) {
    let byCat = shipment.qtyByCatByItem.get(key);
    if (!byCat) {
      byCat = new Map();
      shipment.qtyByCatByItem.set(key, byCat);
    }
    byCat.set(line.category, (byCat.get(line.category) || 0) + qty);
  }

  const existing = shipment.items.get(key);
  if (!existing) {
    shipment.items.set(key, {
      shipmentKey: shipment.shipmentKey,
      article: line.article.trim(),
      productName: line.productName.trim(),
      sku: line.sku.trim(),
      quantitySold: 0, // Итоговый подсчёт — в finalizeOrders (по qtyByCatByItem).
      quantityReturned: 0,
      sellerPrice: 0,
      costPerUnit: null,
      cogs: 0,
    });
  } else {
    if (!existing.article && line.article) existing.article = line.article.trim();
    if (!existing.productName && line.productName) existing.productName = line.productName.trim();
    if (!existing.sku && line.sku) existing.sku = line.sku.trim();
  }
  const it = shipment.items.get(key)!;

  // Цена продавца — предпочитаем значение из «Выручка»-строки.
  // Если она ещё не установлена — берём из любой строки, где оно > 0.
  if (line.sellerPrice > 0) {
    if (line.category === "revenue" || it.sellerPrice === 0) {
      it.sellerPrice = line.sellerPrice;
    }
  }
}

/**
 * Группирует набор строк (возможно, из нескольких файлов) в сущности.
 * Возвращает заказы без classification и без себестоимости — это делают дальнейшие шаги.
 */
export function consolidate(charges: ChargeLine[]): ConsolidationBuckets {
  const orders = new Map<string, OrderBuilder>();
  const nonOrder: NonOrderCharge[] = [];
  const subscriptions: SubscriptionCharge[] = [];

  for (const line of charges) {
    // Подписка (ID вида DD.MM.YY-DD.MM.YY).
    if (isSubscriptionCharge(line.chargeId)) {
      subscriptions.push({
        periodLabel: line.chargeId,
        chargeDate: line.chargeDate,
        chargeType: line.chargeType,
        totalAmount: line.totalAmount,
        sourceFile: line.sourceFile,
      });
      continue;
    }

    if (!line.orderKey) {
      nonOrder.push({
        chargeId: line.chargeId,
        chargeDate: line.chargeDate,
        serviceGroup: line.serviceGroup,
        chargeType: line.chargeType,
        category: line.category,
        totalAmount: line.totalAmount,
        isPoints: line.isPoints,
        sourceFile: line.sourceFile,
      });
      continue;
    }

    const order = ensureOrder(orders, line.orderKey, line);
    const shipmentKey = line.shipmentSuffix || "";
    const shipment = ensureShipment(order, shipmentKey);

    order.chargeTypes.add(line.chargeType);
    shipment.chargeTypes.add(line.chargeType);

    if (line.orderDate && (!order.orderDate || line.orderDate < order.orderDate)) {
      order.orderDate = line.orderDate;
    }
    if (line.chargeDate < order.firstChargeDate) order.firstChargeDate = line.chargeDate;
    if (line.chargeDate > order.lastChargeDate) order.lastChargeDate = line.chargeDate;
    if (!order.workScheme && line.workScheme) order.workScheme = line.workScheme;
    if (!order.platform && line.platform) order.platform = line.platform;

    if (line.isPoints) {
      order.pointsAmount += line.totalAmount;
    } else {
      order.totalAmountRub += line.totalAmount;
      addToTotals(order.totals, line.category, line.totalAmount);
    }

    const lineQty = Math.abs(line.quantity);
    if (lineQty > 0 && !line.isPoints) {
      if (line.category === "logistics") {
        order.qtySumLogistics += lineQty;
      } else if (line.category === "returnLogistics") {
        order.qtySumReturnLogistics += lineQty;
      } else if (line.category === "returnProcessing") {
        order.qtySumReturnProcessing += lineQty;
      }
    }

    // Регистрируем товар в отправлении.
    if (line.article || line.productName) {
      recordItem(shipment, line, isReturnCategory(line.category));
    }
  }

  return {
    orders: finalizeOrders(orders),
    nonOrderCharges: nonOrder,
    subscriptions,
  };
}

function finalizeOrders(map: Map<string, OrderBuilder>): Order[] {
  const out: Order[] = [];
  for (const b of map.values()) {
    const shipments: Shipment[] = [];
    for (const sb of b.shipments.values()) {
      const items: OrderItem[] = [];
      for (const [key, it] of sb.items) {
        const byCat = sb.qtyByCatByItem.get(key);

        // quantitySold: только «Выручка». Без неё — 0 (не подставляем qty из эквайринга/логистики).
        let sold = 0;
        if (byCat) {
          sold = byCat.get("revenue") || 0;
        }

        // quantityReturned: max qty среди return-категорий (не сумма).
        // «Обратная логистика», «Возврат выручки», «Обработка возвратов» — это
        // разные аспекты одного физического возврата, поэтому берём МАКС.
        let returned = 0;
        if (byCat) {
          for (const [cat, q] of byCat) {
            if (isReturnCategory(cat) && q > returned) returned = q;
          }
        }

        items.push({
          ...it,
          quantitySold: sold,
          quantityReturned: Math.min(returned, sold || returned),
        });
      }
      shipments.push({
        shipmentKey: sb.shipmentKey,
        status: "unknown",
        items,
        chargeTypes: sb.chargeTypes,
      });
    }

    const t = b.totals;
    const hasAcquiring = t.acquiring !== 0 || hasCategoryInChargeTypes(b, "acquiring");
    const hasLogistics = t.logistics !== 0 || hasCategoryInChargeTypes(b, "logistics");
    const hasRevenue = t.revenue !== 0 || hasCategoryInChargeTypes(b, "revenue");
    const hasCommission = t.commission !== 0 || hasCategoryInChargeTypes(b, "commission");
    const hasReturn =
      t.returnLogistics !== 0 ||
      t.returnProcessing !== 0 ||
      t.partialReturn !== 0 ||
      t.returnRevenue !== 0 ||
      t.returnCommission !== 0 ||
      hasReturnCategoryInChargeTypes(b);

    out.push({
      orderKey: b.orderKey,
      classification: "incomplete", // будет уточнено на шаге classify
      firstChargeDate: b.firstChargeDate,
      lastChargeDate: b.lastChargeDate,
      orderDate: b.orderDate,
      workScheme: b.workScheme,
      platform: b.platform,
      shipments,
      chargeTypes: b.chargeTypes,
      totals: b.totals,
      totalAmountRub: b.totalAmountRub,
      pointsAmount: b.pointsAmount,
      hasAcquiring,
      hasLogistics,
      hasRevenue,
      hasCommission,
      hasReturnLogisticsOrProcessing: hasReturn,
      qtySumLogistics: b.qtySumLogistics,
      qtySumReturnLogistics: b.qtySumReturnLogistics,
      qtySumReturnProcessing: b.qtySumReturnProcessing,
      totalCost: 0,
      hasCost: false,
    });
  }
  return out;
}

/**
 * Грубая эвристика: заглянуть в chargeTypes и увидеть, что есть запись данной категории,
 * даже если суммарно totals оказался ровно 0 (редко, но возможно).
 */
function hasCategoryInChargeTypes(b: OrderBuilder, category: ChargeCategory): boolean {
  for (const ct of b.chargeTypes) {
    if (classifyChargeType(ct) === category) return true;
  }
  return false;
}

/** Сумма по return-* в totals могла сойти в 0, но тип «Обратная логистика» в строках есть. */
function hasReturnCategoryInChargeTypes(b: OrderBuilder): boolean {
  for (const ct of b.chargeTypes) {
    if (isReturnCategory(classifyChargeType(ct))) return true;
  }
  return false;
}
