/**
 * Mock данные для разработки и тестирования
 * 
 * Генерирует реалистичные данные анализа отчётов Ozon
 */

import type {
  AnalysisResult,
  ProductMetrics,
  DailyMetrics,
  CostBreakdown,
  ProblemArea,
  Recommendation,
} from "@/lib/analysis/types";

// Временный тип Transaction для mock данных (не используется в реальном анализаторе)
interface Transaction {
  id: string;
  date: Date;
  orderNumber: string;
  sku: string;
  productName: string;
  quantity: number;
  salePrice: number;
  commission: number;
  logistics: number;
  lastMile: number;
  processing: number;
  returns: number;
  storageFee: number;
  advertising: number;
  otherFees: number;
  payout: number;
  category: string;
  brand: string;
}

// =============================================================================
// ГЕНЕРАТОРЫ ДАННЫХ
// =============================================================================

/**
 * Генерирует случайное число в диапазоне
 */
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Случайный выбор из массива
 */
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Округление до 2 знаков
 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// =============================================================================
// СПРАВОЧНЫЕ ДАННЫЕ
// =============================================================================

const PRODUCT_NAMES = [
  "Кроссовки мужские Nike Air Max",
  "Футболка женская базовая",
  "Джинсы slim fit синие",
  "Куртка зимняя пуховая",
  "Платье летнее цветочное",
  "Рюкзак городской 25л",
  "Часы наручные кварцевые",
  "Наушники беспроводные TWS",
  "Чехол для iPhone 15",
  "Зарядное устройство 65W",
  "Кабель USB-C 2м",
  "Портативная колонка JBL",
  "Фитнес-браслет Mi Band",
  "Термокружка 500мл",
  "Зонт автоматический",
  "Перчатки кожаные",
  "Шарф кашемировый",
  "Ремень мужской кожаный",
  "Сумка женская через плечо",
  "Кошелёк компактный",
];

const CATEGORIES = [
  "Одежда",
  "Обувь",
  "Аксессуары",
  "Электроника",
  "Товары для дома",
];

const BRANDS = [
  "Nike",
  "Adidas",
  "Zara",
  "H&M",
  "Samsung",
  "Xiaomi",
  "Apple",
  "Sony",
  "Casio",
  "NoName",
];

// =============================================================================
// ГЕНЕРАЦИЯ MOCK ДАННЫХ
// =============================================================================

/**
 * Генерирует mock транзакции
 */
function generateMockTransactions(count: number): Transaction[] {
  const transactions: Transaction[] = [];
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  for (let i = 0; i < count; i++) {
    const salePrice = randomBetween(500, 15000);
    const quantity = randomBetween(1, 5);
    const commissionRate = randomBetween(5, 25) / 100;
    const commission = round(salePrice * commissionRate);
    const logistics = randomBetween(50, 500);
    const lastMile = randomBetween(30, 200);
    const processing = randomBetween(10, 100);
    const hasReturn = Math.random() < 0.08;
    const returns = hasReturn ? round(salePrice * 0.5) : 0;
    const storageFee = randomBetween(0, 100);
    const advertising = Math.random() < 0.3 ? randomBetween(50, 500) : 0;
    const otherFees = randomBetween(0, 50);
    
    const totalFees = commission + logistics + lastMile + processing + returns + storageFee + advertising + otherFees;
    const payout = round(salePrice - totalFees);

    const date = new Date(startDate);
    date.setDate(date.getDate() + randomBetween(0, 30));

    transactions.push({
      id: `txn_${i}`,
      date,
      orderNumber: `ORD-${Date.now()}-${i}`,
      sku: `SKU-${1000 + (i % 20)}`,
      productName: PRODUCT_NAMES[i % PRODUCT_NAMES.length],
      quantity,
      salePrice,
      commission,
      logistics,
      lastMile,
      processing,
      returns,
      storageFee,
      advertising,
      otherFees,
      payout,
      category: randomChoice(CATEGORIES),
      brand: randomChoice(BRANDS),
    });
  }

  return transactions;
}

/**
 * Генерирует mock метрики по товарам
 */
function generateMockProductMetrics(transactions: Transaction[]): ProductMetrics[] {
  const byProduct = new Map<string, Transaction[]>();
  
  for (const t of transactions) {
    const key = t.sku;
    if (!byProduct.has(key)) {
      byProduct.set(key, []);
    }
    byProduct.get(key)!.push(t);
  }

  const metrics: ProductMetrics[] = [];
  
  for (const [sku, txns] of Array.from(byProduct.entries())) {
    const totalQuantity = txns.reduce((sum: number, t: Transaction) => sum + t.quantity, 0);
    const totalRevenue = txns.reduce((sum: number, t: Transaction) => sum + t.salePrice, 0);
    const totalCommission = txns.reduce((sum: number, t: Transaction) => sum + t.commission, 0);
    const totalLogistics = txns.reduce((sum: number, t: Transaction) => sum + t.logistics + t.lastMile, 0);
    const totalReturnsAmount = txns.reduce((sum: number, t: Transaction) => sum + t.returns, 0);
    const returnsCount = txns.filter((t: Transaction) => t.returns > 0).length;
    const ordersCount = txns.length;
    const netAmount = totalRevenue - totalCommission - totalLogistics - totalReturnsAmount;
    const marginPercent = totalRevenue > 0 ? ((netAmount / totalRevenue) * 100) : 0;
    const returnRate = ordersCount > 0 ? ((returnsCount / ordersCount) * 100) : 0;
    const avgCommission = totalRevenue > 0 ? ((totalCommission / totalRevenue) * 100) : 0;

    metrics.push({
      sku,
      article: `ART-${sku}`,
      productName: txns[0].productName,
      totalSold: totalQuantity,
      totalReturned: returnsCount,
      ordersCount,
      returnsCount,
      totalRevenue: round(totalRevenue),
      totalCommission: round(totalCommission),
      totalLogistics: round(totalLogistics),
      totalReturnsAmount: round(totalReturnsAmount),
      netAmount: round(netAmount),
      avgOrderValue: ordersCount > 0 ? round(totalRevenue / ordersCount) : 0,
      avgCommissionPercent: round(avgCommission * 10) / 10,
      marginPercent: round(marginPercent * 10) / 10,
      returnRate: round(returnRate * 10) / 10,
      workScheme: "FBS",
      platform: "Ozon",
    });
  }

  return metrics.sort((a, b) => b.totalRevenue - a.totalRevenue);
}

/**
 * Генерирует mock метрики по дням
 */
function generateMockDailyMetrics(transactions: Transaction[]): DailyMetrics[] {
  const byDate = new Map<string, Transaction[]>();
  
  for (const t of transactions) {
    const dateKey = t.date.toISOString().split("T")[0];
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, []);
    }
    byDate.get(dateKey)!.push(t);
  }

  const metrics: DailyMetrics[] = [];
  
  for (const [date, txns] of Array.from(byDate.entries())) {
    const revenue = txns.reduce((sum: number, t: Transaction) => sum + t.salePrice, 0);
    const commission = txns.reduce((sum: number, t: Transaction) => sum + t.commission, 0);
    const logistics = txns.reduce((sum: number, t: Transaction) => sum + t.logistics + t.lastMile, 0);
    const returns = txns.reduce((sum: number, t: Transaction) => sum + t.returns, 0);
    const netAmount = revenue - commission - logistics - returns;
    const ordersCount = txns.length;
    const returnsCount = txns.filter((t: Transaction) => t.returns > 0).length;
    
    metrics.push({
      date,
      ordersCount,
      returnsCount,
      revenue: round(revenue),
      commission: round(commission),
      logistics: round(logistics),
      returns: round(returns),
      netAmount: round(netAmount),
      pointsAmount: 0,
    });
  }

  return metrics.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Генерирует mock структуру затрат
 */
function generateMockCostBreakdown(transactions: Transaction[]): CostBreakdown {
  const commission = round(transactions.reduce((sum: number, t: Transaction) => sum + t.commission, 0));
  const logistics = round(transactions.reduce((sum: number, t: Transaction) => sum + t.logistics + t.lastMile, 0));
  const returns = round(transactions.reduce((sum: number, t: Transaction) => sum + t.returns, 0));
  const storage = round(transactions.reduce((sum: number, t: Transaction) => sum + t.storageFee, 0));
  const advertising = round(transactions.reduce((sum: number, t: Transaction) => sum + t.advertising, 0));
  const subscriptions = round(transactions.reduce((sum: number, t: Transaction) => sum + t.processing, 0));
  const other = round(transactions.reduce((sum: number, t: Transaction) => sum + t.otherFees, 0));
  const total = commission + logistics + returns + storage + advertising + subscriptions + other;
  
  return {
    commission,
    logistics,
    returns,
    storage,
    advertising,
    subscriptions,
    penalties: 0,
    other,
    total,
  };
}

/**
 * Генерирует mock детализацию по типам начислений
 * Новая структура: группы с типами начислений внутри
 */
function generateMockChargeTypeBreakdown(): Array<{
  groupName: string;
  amount: number;
  count: number;
  chargeTypes: Array<{ name: string; amount: number; count: number }>;
}> {
  return [
    {
      groupName: "Вознаграждение OZON",
      amount: 456395,
      count: 703,
      chargeTypes: [
        { name: "Вознаграждение за продажу", amount: 350000, count: 450 },
        { name: "Вознаграждение за продажу (FBS)", amount: 106395, count: 253 },
      ],
    },
    {
      groupName: "Логистика",
      amount: 149874,
      count: 753,
      chargeTypes: [
        { name: "Доставка до места выдачи", amount: 58000, count: 180 },
        { name: "Магистральная доставка", amount: 35000, count: 120 },
        { name: "Последняя миля", amount: 28000, count: 100 },
        { name: "Доставка до РЦ (FBO)", amount: 15874, count: 213 },
        { name: "Обработка отправления Drop-off партнёрами (АПВЗ)", amount: 5000, count: 50 },
        { name: "Drop-off (АПВЗ)", amount: 8000, count: 90 },
      ],
    },
    {
      groupName: "Эквайринг",
      amount: 20000,
      count: 722,
      chargeTypes: [
        { name: "Эквайринг банковский перевод", amount: 12000, count: 350 },
        { name: "Эквайринг", amount: 8000, count: 372 },
      ],
    },
    {
      groupName: "Подписка",
      amount: 24990,
      count: 1,
      chargeTypes: [
        { name: "Подписка Premium Pro", amount: 24990, count: 1 },
      ],
    },
    {
      groupName: "Продвижение",
      amount: 184,
      count: 4,
      chargeTypes: [
        { name: "Бонусы продавца", amount: -500, count: 1 },
        { name: "Программы партнёров", amount: 300, count: 1 },
        { name: "Продвижение бренда", amount: 200, count: 1 },
        { name: "Штрафы", amount: 184, count: 1 },
      ],
    },
  ];
}

/**
 * Генерирует mock проблемные зоны
 */
function generateMockProblemAreas(): ProblemArea[] {
  return [
    {
      type: "high_commission",
      severity: "high",
      title: "Высокая комиссия в категории Электроника",
      description: "5 товаров имеют комиссию выше 20%",
      affectedItems: ["SKU-1001", "SKU-1005", "SKU-1008", "SKU-1012", "SKU-1015"],
      potentialLoss: 15420,
      recommendation: "Рассмотрите перенос товаров в категорию с меньшей комиссией или участие в акциях Ozon",
    },
    {
      type: "high_returns",
      severity: "medium",
      title: "Высокий процент возвратов",
      description: "3 товара имеют возвраты выше 12%",
      affectedItems: ["SKU-1003", "SKU-1007", "SKU-1019"],
      potentialLoss: 8750,
      recommendation: "Улучшите описание товаров, добавьте размерную сетку и больше фотографий",
    },
    {
      type: "negative_margin",
      severity: "critical",
      title: "Товары с отрицательной маржой",
      description: "2 товара продаются в убыток",
      affectedItems: ["SKU-1011", "SKU-1017"],
      potentialLoss: 4200,
      recommendation: "Срочно пересмотрите цены или снимите товары с продажи",
    },
    {
      type: "high_logistics",
      severity: "medium",
      title: "Высокие затраты на логистику",
      description: "4 товара имеют логистику выше 18% от выручки",
      affectedItems: ["SKU-1002", "SKU-1006", "SKU-1014", "SKU-1018"],
      potentialLoss: 6300,
      recommendation: "Оптимизируйте упаковку или рассмотрите переход на FBO",
    },
  ];
}

/**
 * Генерирует mock рекомендации
 */
function generateMockRecommendations(): Recommendation[] {
  return [
    {
      id: "rec_1",
      type: "profit",
      priority: "high",
      title: "Оптимизируйте ценовую политику",
      description: "Средняя маржа 18% ниже рекомендуемых 22-25% для вашей категории",
      impact: "Потенциальный рост прибыли на 45 000 ₽/мес",
      actions: [
        "Повысьте цены на товары с высоким спросом на 5-10%",
        "Уберите из ассортимента товары с маржой ниже 10%",
        "Используйте динамическое ценообразование",
      ],
    },
    {
      id: "rec_2",
      type: "cost",
      priority: "high",
      title: "Сократите затраты на логистику",
      description: "Логистика составляет 16% от выручки, что выше нормы",
      impact: "Экономия до 25 000 ₽/мес",
      actions: [
        "Переведите 8 товаров на FBO для снижения стоимости доставки",
        "Оптимизируйте упаковку крупногабаритных товаров",
        "Консолидируйте отправки в один регион",
      ],
    },
    {
      id: "rec_3",
      type: "growth",
      priority: "medium",
      title: "Расширьте ассортимент",
      description: "Топ-5 товаров дают 60% выручки — высокая зависимость",
      impact: "Рост выручки на 20-30% за 2 месяца",
      actions: [
        "Добавьте 10-15 сопутствующих товаров",
        "Протестируйте смежные категории",
        "Создайте комплекты из популярных товаров",
      ],
    },
    {
      id: "rec_4",
      type: "risk",
      priority: "medium",
      title: "Снизьте процент возвратов",
      description: "8% возвратов — выше среднего по категории (5%)",
      impact: "Сокращение потерь на 12 000 ₽/мес",
      actions: [
        "Улучшите фотографии и описания товаров",
        "Добавьте видео-обзоры",
        "Уточните размерную сетку",
        "Улучшите качество упаковки",
      ],
    },
    {
      id: "rec_5",
      type: "profit",
      priority: "low",
      title: "Участвуйте в акциях Ozon",
      description: "Участие в распродажах может увеличить оборот",
      impact: "Рост продаж на 15-25% в период акций",
      actions: [
        "Подключитесь к программе Ozon Premium",
        "Участвуйте в сезонных распродажах",
        "Используйте промокоды для повторных покупок",
      ],
    },
  ];
}

// =============================================================================
// ГЛАВНАЯ ФУНКЦИЯ
// =============================================================================

/**
 * Возвращает полный mock результат анализа
 */
export function getMockAnalysisResult(analysisId?: string): any {
  const transactions = generateMockTransactions(150);
  const productMetrics = generateMockProductMetrics(transactions);
  const dailyMetrics = generateMockDailyMetrics(transactions);
  const costBreakdown = generateMockCostBreakdown(transactions);
  const chargeTypeBreakdown = generateMockChargeTypeBreakdown();

  const totalRevenue = transactions.reduce((sum, t) => sum + t.salePrice, 0);
  const totalCosts = costBreakdown.total;
  const netProfit = totalRevenue - totalCosts;
  const uniqueOrders = new Set(transactions.map(t => t.orderNumber)).size;
  const uniqueProducts = new Set(transactions.map(t => t.sku)).size;
  const returnsCount = transactions.filter(t => t.returns > 0).length;
  const completedOrders = transactions.filter(t => t.returns === 0).length;
  const returnedOrders = transactions.filter(t => t.returns > 0).length;
  const partialReturns = Math.floor(returnsCount * 0.3);

  const dates = transactions.map(t => t.date);
  const startDate = new Date(Math.min(...dates.map(d => d.getTime())));
  const endDate = new Date(Math.max(...dates.map(d => d.getTime())));
  const periodLabel = `${formatDate(startDate)} — ${formatDate(endDate)}`;

  const revenueAmount = round(totalRevenue * 0.6);
  const pointsAmount = round(totalRevenue * 0.4);
  const grossRevenue = revenueAmount + pointsAmount;
  const ozonFees = totalCosts;
  const netPayout = grossRevenue - ozonFees;
  const feesPercent = round((ozonFees / grossRevenue) * 100);

  return {
    id: analysisId || `analysis_${Date.now()}`,
    fileName: "отчёт_ozon_январь_2025.xlsx",
    analyzedAt: new Date(),
    period: {
      start: startDate,
      end: endDate,
      label: periodLabel,
    },
    summary: {
      grossRevenue,
      revenueAmount,
      pointsAmount,
      ozonFees,
      netPayout,
      feesPercent,
      totalOrders: uniqueOrders,
      completedOrders,
      returnedOrders,
      partialReturns,
      cancelledOrders: 0, // Mock значение
      totalProducts: uniqueProducts,
      avgOrderValue: round(grossRevenue / uniqueOrders),
      avgCommissionPercent: round((costBreakdown.commission / revenueAmount) * 100),
      returnRate: round((returnsCount / transactions.length) * 100),
    },
    costBreakdown,
    dailyMetrics,
    orders: [],
    topOrders: [],
    returnedOrders: [],
    nonOrderCharges: [],
    subscriptions: [],
    productMetrics,
    topProducts: productMetrics.slice(0, 10),
    worstProducts: productMetrics
      .filter(p => p.marginPercent < 15)
      .sort((a, b) => a.marginPercent - b.marginPercent)
      .slice(0, 10),
    problemAreas: generateMockProblemAreas(),
    recommendations: generateMockRecommendations(),
    schemeStats: {
      fbo: { orders: Math.floor(uniqueOrders * 0.4), amount: round(totalRevenue * 0.4) },
      fbs: { orders: Math.floor(uniqueOrders * 0.5), amount: round(totalRevenue * 0.5) },
      other: { orders: Math.floor(uniqueOrders * 0.1), amount: round(totalRevenue * 0.1) },
    },
    chargeTypeBreakdown,
    // Дополнительные поля для совместимости с page.tsx
    profitTrends: dailyMetrics.map(d => ({
      date: d.date,
      revenue: d.revenue,
      costs: d.commission + d.logistics + d.returns,
      profit: d.netAmount,
      orders: d.ordersCount,
    })),
    lossProducts: productMetrics
      .filter(p => p.marginPercent < 15)
      .sort((a, b) => a.marginPercent - b.marginPercent)
      .slice(0, 10)
      .map(p => ({
        name: p.productName,
        sku: p.sku,
        revenue: p.totalRevenue,
        profit: p.netAmount,
        margin: p.marginPercent,
        orders: p.ordersCount,
        returnRate: p.returnRate,
        cancellationRate: 0,
      })),
    cancellationReasons: [
      { reason: "Нет в наличии", count: 15, percent: 30 },
      { reason: "Отмена заказчиком", count: 12, percent: 24 },
      { reason: "Техническая ошибка", count: 8, percent: 16 },
      { reason: "Другое", count: 15, percent: 30 },
    ],
    returnReasons: [
      { reason: "Не подошёл размер", count: 20, percent: 40 },
      { reason: "Товар не соответствует описанию", count: 10, percent: 20 },
      { reason: "Брак или повреждения", count: 8, percent: 16 },
      { reason: "Передумал", count: 12, percent: 24 },
    ],
  };
}

function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Симулирует задержку анализа
 */
export async function simulateAnalysis(
  onProgress: (step: number, percent: number) => void
): Promise<AnalysisResult> {
  const steps = [
    { delay: 500, step: 0, percent: 10 },
    { delay: 800, step: 1, percent: 25 },
    { delay: 1000, step: 2, percent: 45 },
    { delay: 800, step: 3, percent: 65 },
    { delay: 1200, step: 4, percent: 85 },
    { delay: 600, step: 5, percent: 100 },
  ];

  for (const { delay, step, percent } of steps) {
    await new Promise(resolve => setTimeout(resolve, delay));
    onProgress(step, percent);
  }

  return getMockAnalysisResult();
}
