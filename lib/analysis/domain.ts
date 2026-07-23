/**
 * Доменная модель нового пайплайна консолидации.
 *
 * Живёт параллельно старому lib/analysis/types.ts до перевода index.ts.
 * Основные сущности:
 *   - ChargeLine     — нормализованная строка из Excel (одна запись начисления).
 *   - Order/Shipment — результат консолидации.
 *   - OrderItem      — товар в рамках отправления.
 *   - ConsolidatedReport — полный снимок одного импорта (1..N файлов).
 */

import type { ChargeCategory, ChargeTypeName } from "./charge-types";

// ─────────────────────────────────────────────────────────────
// Сырая нормализованная строка
// ─────────────────────────────────────────────────────────────

/** Одна строка начислений после парсинга заголовков Excel. */
export interface ChargeLine {
  /** Какой файл принёс строку (имя). */
  sourceFile: string;
  /** Номер строки в исходном файле (для отладки). */
  sourceRow: number;

  chargeId: string;
  /** Ключ заказа — первые цифры до "-", либо null для подписок/пустых. */
  orderKey: string | null;
  /** Суффикс отправления (всё после первого "-"), null если нет. */
  shipmentSuffix: string | null;

  chargeDate: Date;
  serviceGroup: string;
  chargeType: ChargeTypeName;
  category: ChargeCategory;

  article: string;
  sku: string;
  productName: string;

  quantity: number;
  sellerPrice: number;

  orderDate: Date | null;
  platform: string;
  workScheme: string;
  ozonCommissionPercent: number;
  localizationIndex: number;
  avgDeliveryHours: number;

  /** Сумма "итого, руб." как пришла из файла (со знаком). */
  totalAmount: number;
  /** True, если это строка "Баллы за скидки" (в баллах, не в рублях). */
  isPoints: boolean;
}

// ─────────────────────────────────────────────────────────────
// Статусы
// ─────────────────────────────────────────────────────────────

/**
 * Статус заказа после классификации.
 *   success        — все 4 обязательных типа начислений + нет возврата.
 *   partial_return — часть отправлений/товаров вернули, часть осталась.
 *   full_return    — все отправления вернули.
 *   cancelled      — в строках есть отмена заказа (индекс ошибок+отмена, операционные ошибки: отмена и т.д.).
 *   incomplete     — не все обязательные типы присутствуют (например, заказ на границе периода).
 */
export type OrderClassification =
  | "success"
  | "partial_return"
  | "full_return"
  | "cancelled"
  | "incomplete";

/** Статус одного отправления внутри заказа. */
export type ShipmentClassification =
  | "delivered"
  | "returned"
  | "partially_returned"
  | "unknown";

// ─────────────────────────────────────────────────────────────
// Агрегаты
// ─────────────────────────────────────────────────────────────

export interface OrderItem {
  /** Отправление, которому принадлежит товар (shipmentSuffix или "" если нет). */
  shipmentKey: string;
  article: string;
  productName: string;
  sku: string;

  /** Сколько штук продано по отправлению — только сумма quantity из строк «Выручка» (без выручки = 0). */
  quantitySold: number;
  /** Сколько штук возвращено (посчитано по строкам возврата). */
  quantityReturned: number;

  /** Цена продавца за единицу (если встречается). */
  sellerPrice: number;

  /** Себестоимость за единицу (подставляется из файла). */
  costPerUnit: number | null;
  /** Себестоимость фактически проданных единиц (quantitySold - quantityReturned) * costPerUnit. */
  cogs: number;
}

export interface Shipment {
  /** Ключ отправления. Для заказа без суффикса — "". */
  shipmentKey: string;
  status: ShipmentClassification;
  items: OrderItem[];
  /**
   * Типы начислений, встретившиеся в этом отправлении.
   * Для проверок "есть ли возврат у отправления".
   */
  chargeTypes: Set<ChargeTypeName>;
}

export interface OrderCategoryTotals {
  revenue: number;
  commission: number;
  logistics: number;
  acquiring: number;
  returnRevenue: number;
  returnLogistics: number;
  returnCommission: number;
  returnProcessing: number;
  partialReturn: number;
  advertising: number;
  storage: number;
  penalties: number;
  compensation: number;
  partnerPrograms: number;
  other: number;
}

export interface Order {
  orderKey: string;
  classification: OrderClassification;

  /** Дата первой и последней записи начисления по заказу. */
  firstChargeDate: Date;
  lastChargeDate: Date;
  /** Дата принятия заказа (первая непустая по строкам). */
  orderDate: Date | null;

  /** Схема работы (FBO / FBS / …). Берётся первая непустая. */
  workScheme: string;
  platform: string;

  shipments: Shipment[];
  /** Все типы начислений, встретившиеся в заказе (для быстрых проверок). */
  chargeTypes: Set<ChargeTypeName>;

  /** Агрегаты по категориям (со знаками как в файле). */
  totals: OrderCategoryTotals;
  /** Сумма всех totalAmount (кроме баллов). */
  totalAmountRub: number;
  /** Сумма "Баллы за скидки" (отдельно). */
  pointsAmount: number;

  /** Флаги по обязательным типам начислений для success. */
  hasAcquiring: boolean;
  hasLogistics: boolean;
  hasRevenue: boolean;
  hasCommission: boolean;
  hasReturnLogisticsOrProcessing: boolean;

  /**
   * Суммы |quantity| по всем строкам заказа (для classify / «обработка отмен» vs логистика).
   * Агрегируются в consolidate по category logistics / returnLogistics / returnProcessing.
   */
  qtySumLogistics: number;
  qtySumReturnLogistics: number;
  qtySumReturnProcessing: number;

  /** Себестоимость заказа (с учётом возвратов). */
  totalCost: number;
  hasCost: boolean;

  /**
   * True, если в текущем отчёте нет эквайринга, но выручка есть и нет «Возврат выручки»
   * — типично заказ, оплата по которому в прошлом периоде (classify → success + этот флаг).
   */
  isFromPreviousPeriod?: boolean;
}

/** Начисление без привязки к заказу (orderKey === null, но не подписка). */
export interface NonOrderCharge {
  chargeId: string;
  chargeDate: Date;
  serviceGroup: string;
  chargeType: ChargeTypeName;
  category: ChargeCategory;
  totalAmount: number;
  isPoints: boolean;
  /** Имя файла-источника. */
  sourceFile: string;
}

/** Подписка (ID вида DD.MM.YY-DD.MM.YY). */
export interface SubscriptionCharge {
  periodLabel: string;
  chargeDate: Date;
  chargeType: ChargeTypeName;
  totalAmount: number;
  sourceFile: string;
}

/** Агрегат по товару на уровне всего импорта. */
export interface ProductAggregate {
  article: string;
  sku: string;
  productName: string;

  unitsSold: number;
  unitsReturned: number;
  ordersCount: number;
  returnsCount: number;

  revenue: number;
  commission: number;
  logistics: number;
  returnsAmount: number;
  netAmount: number;

  costPerUnit: number | null;
  totalCost: number;
  netProfit: number | null;
  hasCost: boolean;
}

export interface DailyMetricPoint {
  /** YYYY-MM-DD */
  date: string;
  ordersCount: number;
  returnsCount: number;
  revenue: number;
  commission: number;
  logistics: number;
  returns: number;
  netAmount: number;
  pointsAmount: number;
  totalCost: number;
  netProfit: number;
}

export interface ConsolidatedReport {
  /** Период (min/max по всем файлам). */
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;

  /** Имена исходных файлов и их размеры. */
  sourceFiles: Array<{ fileName: string; size: number }>;

  orders: Order[];
  nonOrderCharges: NonOrderCharge[];
  subscriptions: SubscriptionCharge[];

  /** Все ChargeLine после нормализации — пригодны для записи в Supabase как "сырые". */
  charges: ChargeLine[];
}
