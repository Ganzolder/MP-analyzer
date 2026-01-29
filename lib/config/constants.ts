/**
 * Константы приложения
 */

// Лимиты файлов
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const ALLOWED_FILE_TYPES = [".xls", ".xlsx"];
export const ALLOWED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

// Лимиты текста
export const MAX_CUSTOM_PROMPT_LENGTH = 1000;

// Цвета для графиков (темная тема)
export const CHART_COLORS = {
  primary: "hsl(263, 70%, 58%)",
  secondary: "hsl(173, 80%, 40%)",
  accent: "hsl(38, 92%, 50%)",
  success: "hsl(142, 76%, 45%)",
  destructive: "hsl(0, 84%, 60%)",
  muted: "hsl(215, 20%, 65%)",
  purple: "hsl(280, 70%, 50%)",
  blue: "hsl(200, 98%, 39%)",
  pink: "hsl(340, 82%, 52%)",
};

// Цвета для категорий затрат
export const COST_CATEGORY_COLORS: Record<string, string> = {
  "Комиссия Ozon": CHART_COLORS.primary,
  "Логистика": CHART_COLORS.secondary,
  "Обработка заказов": CHART_COLORS.accent,
  "Эквайринг": CHART_COLORS.pink,
  "Хранение": CHART_COLORS.blue,
  "Реклама": CHART_COLORS.purple,
  "Штрафы/Возвраты": CHART_COLORS.destructive,
  "Прочее": CHART_COLORS.muted,
};

// Категории рекомендаций
export const RECOMMENDATION_CATEGORIES = {
  strategy: { label: "Стратегия", icon: "TrendingUp" },
  pricing: { label: "Ценообразование", icon: "Tag" },
  assortment: { label: "Ассортимент", icon: "Package" },
  logistics: { label: "Логистика", icon: "Truck" },
  problems: { label: "Проблемные зоны", icon: "AlertTriangle" },
} as const;

// Приоритеты
export const PRIORITY_LABELS = {
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
} as const;

// Шаги анализа
export const ANALYSIS_STEPS = [
  { id: "upload", name: "Загрузка файла", duration: 500 },
  { id: "parse", name: "Парсинг данных", duration: 800 },
  { id: "analyze_orders", name: "Анализ заказов", duration: 1000 },
  { id: "calculate_metrics", name: "Расчёт метрик", duration: 800 },
  { id: "generate_insights", name: "Генерация рекомендаций (AI)", duration: 1200 },
  { id: "create_report", name: "Формирование отчёта", duration: 600 },
] as const;

// API endpoints
export const API_ENDPOINTS = {
  upload: "/api/upload",
  analyze: "/api/analyze",
  analysis: (id: string) => `/api/analysis/${id}`,
  status: (id: string) => `/api/analysis/${id}/status`,
  exportXlsx: (id: string) => `/api/export/xlsx/${id}`,
  exportPdf: (id: string) => `/api/export/pdf/${id}`,
  reports: "/api/reports",
} as const;

// Сообщения об ошибках
export const ERROR_MESSAGES = {
  UPLOAD_FAILED: "Не удалось загрузить файл. Попробуйте ещё раз.",
  ANALYSIS_FAILED: "Ошибка при анализе. Проверьте формат файла.",
  EXPORT_FAILED: "Не удалось экспортировать отчёт.",
  NETWORK_ERROR: "Проверьте подключение к интернету.",
  INVALID_FILE_TYPE: "Неподдерживаемый формат файла. Разрешены только .xls и .xlsx",
  FILE_TOO_LARGE: "Файл слишком большой. Максимальный размер: 50MB",
  UNAUTHORIZED: "Требуется авторизация для этого действия.",
} as const;

// Ссылки на документацию
export const DOCS_LINKS = {
  fileFormat: "https://docs.ozon.ru/...", // TODO: добавить реальную ссылку
  pricing: "/pricing",
  support: "mailto:support@example.com",
} as const;
