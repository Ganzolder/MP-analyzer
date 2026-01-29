/**
 * Конфигурация тарифных планов
 * Заготовка для будущей системы подписок
 */

export type PlanKey = "free" | "basic" | "pro";

export interface PlanFeature {
  text: string;
  included: boolean;
  highlight?: boolean;
}

export interface Plan {
  key: PlanKey;
  name: string;
  description: string;
  price: number; // в рублях за месяц
  priceYearly: number; // в рублях за год
  features: PlanFeature[];
  reportsLimit: number;
  aiEnabled: boolean;
  exportEnabled: boolean;
  historyEnabled: boolean;
  popularBadge?: boolean;
}

export const PLANS: Plan[] = [
  {
    key: "free",
    name: "Free",
    description: "Для начинающих селлеров",
    price: 0,
    priceYearly: 0,
    reportsLimit: 3,
    aiEnabled: false,
    exportEnabled: false,
    historyEnabled: false,
    features: [
      { text: "3 анализа в месяц", included: true },
      { text: "Базовые метрики", included: true },
      { text: "Графики и таблицы", included: true },
      { text: "AI рекомендации", included: false },
      { text: "Экспорт PDF/XLSX", included: false },
      { text: "История отчётов", included: false },
      { text: "Приоритетная поддержка", included: false },
    ],
  },
  {
    key: "basic",
    name: "Basic",
    description: "Для растущего бизнеса",
    price: 990,
    priceYearly: 9900,
    reportsLimit: 20,
    aiEnabled: true,
    exportEnabled: true,
    historyEnabled: true,
    popularBadge: true,
    features: [
      { text: "20 анализов в месяц", included: true },
      { text: "Все метрики и графики", included: true },
      { text: "AI рекомендации", included: true, highlight: true },
      { text: "Экспорт PDF/XLSX", included: true },
      { text: "История отчётов (30 дней)", included: true },
      { text: "Email поддержка", included: true },
      { text: "Приоритетная поддержка", included: false },
    ],
  },
  {
    key: "pro",
    name: "Pro",
    description: "Для серьёзных селлеров",
    price: 2490,
    priceYearly: 24900,
    reportsLimit: -1, // безлимит
    aiEnabled: true,
    exportEnabled: true,
    historyEnabled: true,
    features: [
      { text: "Безлимитные анализы", included: true, highlight: true },
      { text: "Все метрики и графики", included: true },
      { text: "AI рекомендации (GPT-4)", included: true },
      { text: "Экспорт PDF/XLSX", included: true },
      { text: "История отчётов (365 дней)", included: true },
      { text: "Сравнение периодов", included: true, highlight: true },
      { text: "Приоритетная поддержка 24/7", included: true },
    ],
  },
];

/**
 * Получение плана по ключу
 */
export function getPlan(key: PlanKey): Plan | undefined {
  return PLANS.find((plan) => plan.key === key);
}

/**
 * Проверка доступности фичи для плана
 */
export function canUsePlan(
  currentPlan: PlanKey,
  feature: "ai" | "export" | "history" | "unlimited"
): boolean {
  const plan = getPlan(currentPlan);
  if (!plan) return false;
  
  switch (feature) {
    case "ai":
      return plan.aiEnabled;
    case "export":
      return plan.exportEnabled;
    case "history":
      return plan.historyEnabled;
    case "unlimited":
      return plan.reportsLimit === -1;
    default:
      return false;
  }
}

/**
 * Форматирование цены
 */
export function formatPlanPrice(price: number): string {
  if (price === 0) return "Бесплатно";
  return `${price.toLocaleString("ru-RU")} ₽/мес`;
}
