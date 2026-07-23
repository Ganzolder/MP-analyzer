/**
 * Типы данных для анализа финансовых отчётов Ozon
 */

import type { OrderAccrualDetail } from "./pipeline/order-accrual-detail";

/** Сырая строка из Excel файла */
export interface RawRow {
  "ID начисления"?: string | number | null;
  "Дата начисления"?: string | number | null;
  "Группа услуг"?: string | null;
  "Тип начисления"?: string | null;
  "Артикул"?: string | null;
  "SKU"?: string | null;
  "Название товара"?: string | null;
  "Количество"?: string | number | null;
  "Цена продавца"?: string | number | null;
  "Дата принятия заказа в обработку или оказания услуги"?: string | number | null;
  "Платформа продажи"?: string | null;
  "Схема работы"?: string | null;
  "Вознаграждение Ozon, %"?: string | number | null;
  "Индекс локализации, %"?: string | number | null;
  "Среднее время доставки, часы"?: string | number | null;
  "Сумма итого, руб."?: string | number | null;
  [key: string]: any;
}

/** Нормализованная строка начисления */
export interface ChargeRow {
  chargeId: string;              // ID начисления (оригинальный)
  orderNumber: string | null;    // Номер заказа (извлечённый)
  chargeDate: Date;              // Дата начисления
  serviceGroup: string;          // Группа услуг
  chargeType: string;            // Тип начисления
  article: string;               // Артикул
  sku: string;                   // SKU
  productName: string;           // Название товара
  quantity: number;              // Количество
  sellerPrice: number;           // Цена продавца
  orderDate: Date | null;        // Дата принятия заказа
  platform: string;              // Платформа продажи
  workScheme: string;            // Схема работы (FBO/FBS)
  ozonCommissionPercent: number; // Вознаграждение Ozon, %
  localizationIndex: number;     // Индекс локализации, %
  avgDeliveryHours: number;      // Среднее время доставки
  totalAmount: number;           // Сумма итого, руб.
  isPoints: boolean;             // Это баллы (не рубли)
}

/** Статус заказа */
export type OrderStatus = "completed" | "returned" | "partial_return" | "cancelled" | "in_progress";

/** Агрегированный заказ */
export interface AggregatedOrder {
  orderNumber: string;
  status: OrderStatus;
  
  // Данные товара (заполняются из строк)
  article: string;
  sku: string;
  productName: string;
  quantity: number;
  sellerPrice: number;
  
  // Финансы - итоги
  totalAmountRub: number;        // Итоговая сумма к выплате
  
  // Детализация доходов
  revenueAmount: number;         // Выручка (тип начисления "Выручка")
  pointsAmount: number;          // Баллы за скидки
  grossRevenue: number;          // Легаси: revenue + points (без партнёрок)
  /** Сумма продажи по цене продавца: Σ (доставлено × цена продавца) */
  grossBySellerPrice?: number;
  /** Валовая по начислениям: выручка + баллы + программы партнёров (колонка «Начислено» в заказах) */
  grossInflow?: number;
  /** Удержания Ozon (sumOrderFees по totals) */
  ozonFeesTotal?: number;

  // Детализация удержаний Ozon
  commissionAmount: number;      // Комиссия
  logisticsAmount: number;       // Логистика
  acquiringAmount: number;       // Эквайринг
  returnAmount: number;          // Обратная логистика
  otherFeesAmount: number;       // Прочие удержания
  totalFees: number;             // Всего удержано
  
  // Мета
  platform: string;
  workScheme: string;
  orderDate: Date | null;
  chargeDate: Date;
  chargesCount: number;          // Кол-во строк начислений
  
  // Типы начислений в заказе
  chargeTypes: string[];
  
  // Себестоимость
  costPerUnit?: number;          // Себестоимость за единицу (из файла себестоимости)
  totalCost?: number;            // Общая себестоимость = costPerUnit * quantity
  hasCost?: boolean;             // Есть ли себестоимость для этого заказа
  
  // Флаги
  isFromPreviousPeriod?: boolean; // Заказ из прошлого периода, не все начисления в текущем периоде

  /** Группы услуг → типы начислений (по сырым ChargeLine; только для свежих импортов) */
  accrualDetail?: OrderAccrualDetail;
}

/** Начисление без заказа (агрегированное по типу) */
export interface NonOrderCharge {
  serviceGroup: string;
  chargeType: string;
  totalAmountRub: number;
  totalAmountPoints: number;
  count: number;
  description: string;
}

/** Подписка/общие затраты магазина */
export interface SubscriptionCharge {
  period: string;                // Период (07.10.25-07.11.25)
  chargeType: string;            // Тип (Подписка Premium Pro)
  totalAmount: number;
  chargeDate: Date;
}

/** Метрики по товару (агрегированные из заказов) */
export interface ProductMetrics {
  sku: string;
  article: string;
  productName: string;
  
  // Количество
  totalSold: number;
  totalReturned: number;
  ordersCount: number;
  returnsCount: number;
  
  // Финансы
  totalRevenue: number;
  totalCommission: number;
  totalLogistics: number;
  totalReturnsAmount: number;
  netAmount: number;
  costPerUnit?: number;          // Себестоимость за единицу (из файла себестоимости)
  totalCost?: number;            // Общая себестоимость = costPerUnit * totalSold
  netProfit?: number;            // Чистая прибыль = netAmount - totalCost (если есть себестоимость)
  
  // Расчётные
  avgOrderValue: number;
  avgCommissionPercent: number;
  marginPercent: number;
  profitMarginPercent?: number;  // Рентабельность = (netProfit / totalRevenue) * 100 (если есть себестоимость)
  returnRate: number;
  
  // Флаг наличия себестоимости
  hasCost?: boolean;             // Есть ли себестоимость для этого товара
  
  // Мета
  workScheme: string;
  platform: string;
}

/** Метрики по дате */
export interface DailyMetrics {
  date: string;
  ordersCount: number;
  returnsCount: number;
  revenue: number;
  commission: number;
  logistics: number;
  returns: number;
  netAmount: number;
  pointsAmount: number;
  totalCost?: number; // Себестоимость за день (только для проданных товаров с выручкой > 0)
  netProfit?: number; // Чистая прибыль = netAmount - totalCost (если есть себестоимость)
}

/** Структура затрат */
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

/** Проблемная зона */
export interface ProblemArea {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  affectedItems: string[];
  potentialLoss: number;
  recommendation: string;
}

/** Рекомендация */
export interface Recommendation {
  id: string;
  type: "profit" | "cost" | "growth" | "risk";
  priority: "low" | "medium" | "high";
  title: string;
  description: string;
  impact: string;
  actions: string[];
}

/** Полный результат анализа */
export interface AnalysisResult {
  id: string;
  fileName: string;
  analyzedAt: Date;

  // Период из файла
  period: {
    start: Date;
    end: Date;
    label: string;
  };

  // Сводка - ключевые финансовые метрики
  summary: {
    // Валовая выручка (Выручка + Баллы за скидки)
    grossRevenue: number;
    // Только "Выручка" (без баллов)
    revenueAmount: number;
    // Баллы за скидки (компенсация от Ozon)
    pointsAmount: number;
    // Удержания Ozon (комиссия + логистика + подписка и т.д.)
    ozonFees: number;
    // Итого начислено (то что поступит на счёт)
    netPayout: number;
    // Процент удержаний от валовой выручки
    feesPercent: number;

    /** Проданных единиц товара (доставлено − возвраты по позициям) */
    soldUnits: number;

    // Заказы
    totalOrders: number;
    completedOrders: number;
    returnedOrders: number;
    partialReturns: number;
    cancelledOrders: number;  // Отмененные заказы (только эквайринг)
    /** «В работе» — неполный набор начислений в отчёте (pipeline: incomplete) */
    incompleteOrders?: number;

    // Прочее
    totalProducts: number;
    avgOrderValue: number;
    avgCommissionPercent: number;
    returnRate: number;
    
    // Себестоимость (если есть файл себестоимости)
    totalCost?: number;           // Общая себестоимость
    totalCostSold?: number;       // Себестоимость проданных товаров
    totalNetProfit?: number;      // Общая чистая прибыль (netPayout - totalCostSold)
    productsWithCost?: number;    // Количество товаров с себестоимостью
    productsWithoutCost?: number; // Количество товаров без себестоимости
    ordersWithCost?: number;      // Количество заказов с себестоимостью
    ordersWithoutCost?: number;   // Количество заказов без себестоимости
  };

  // Детализация
  costBreakdown: CostBreakdown;
  dailyMetrics: DailyMetrics[];

  // Заказы
  orders: AggregatedOrder[];
  topOrders: AggregatedOrder[];
  returnedOrders: AggregatedOrder[];

  // Начисления без заказов
  nonOrderCharges: NonOrderCharge[];
  subscriptions: SubscriptionCharge[];

  // Товары
  productMetrics: ProductMetrics[];
  topProducts: ProductMetrics[];
  worstProducts: ProductMetrics[];

  // Проблемы и рекомендации
  problemAreas: ProblemArea[];
  recommendations: Recommendation[];

  // Статистика по схемам
  schemeStats: {
    fbo: { orders: number; amount: number };
    fbs: { orders: number; amount: number };
    other: { orders: number; amount: number };
  };

  // Детализация по типам начислений (группировка)
  chargeTypeBreakdown?: Array<{
    groupName: string;
    amount: number;
    count: number;
    chargeTypes: Array<{ name: string; amount: number; count: number }>;
  }>;
  
  // Отчёты по себестоимости
  costReports?: {
    productsWithCost: ProductMetrics[];      // Товары с себестоимостью
    productsWithoutCost: ProductMetrics[];   // Товары без себестоимости
    ordersWithCost: AggregatedOrder[];       // Заказы с себестоимостью
    ordersWithoutCost: AggregatedOrder[];    // Заказы без себестоимости
    totalCost: number;                       // Общая себестоимость (всего)
    totalCostSold: number;                   // Себестоимость проданных товаров
    totalNetProfit: number;                  // Общая чистая прибыль (с учётом себестоимости)
    articlesComparison?: {                   // Списки артикулов для визуального сравнения
      costArticles: string[];                // Артикулы из файла себестоимости
      orderArticles: string[];                // Артикулы из файла начислений
    };
  };
}
