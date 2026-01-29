/**
 * Сервис для работы с AI провайдерами
 */

import { openai, createOpenAI } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { getProviderConfig, buildAnalysisPrompt, ANALYSIS_SYSTEM_PROMPT, type AIProviderKey } from "@/lib/config/ai-providers";
import type { AnalysisResult } from "@/lib/analysis/types";

// Динамический импорт generateText для избежания проблем с webpack на клиенте
async function getGenerateText() {
  if (typeof window !== "undefined") {
    throw new Error("generateText is only available on the server");
  }
  const aiModule = await import("ai");
  return aiModule.generateText;
}

export interface AIAnalysisRequest {
  analysisData: {
    summary: AnalysisResult["summary"];
    topProducts?: Array<{
      name: string;
      revenue: number;
      profit: number;
      profitMargin: number;
      returnRate: number;
    }>;
    allProducts?: Array<{
      name: string;
      sku?: string;
      article?: string;
      [key: string]: any;
    }>;
    problems?: AnalysisResult["problemAreas"];
    costBreakdown?: AnalysisResult["costBreakdown"];
    chargeTypeBreakdown?: any;
    orders?: any[];
    costReports?: any;
    dailyMetrics?: any[];
    [key: string]: any; // Дополнительные поля для разных типов анализа
  };
  customPrompt?: string;
  analysisType?: "overview" | "costs" | "products" | "orders" | "cost-reports" | "problems";
  provider?: AIProviderKey;
}

export interface AIAnalysisResponse {
  recommendations: Array<{
    id: string;
    type: string;
    priority: "high" | "medium" | "low";
    title: string;
    description: string;
    impact: string;
    actions: string[];
  }>;
  insights: string;
  summary: string;
}

export class AIService {
  /**
   * Анализирует данные отчёта с помощью AI
   */
  async analyzeReport(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    const provider = request.provider || "google";
    const config = getProviderConfig(provider);

    // Проверяем наличие API ключа
    const apiKey = process.env[config.apiKeyEnv];
    if (!apiKey) {
      throw new Error(`API ключ для ${config.name} не найден. Установите ${config.apiKeyEnv} в переменных окружения.`);
    }

    // Выбираем модель в зависимости от провайдера
    // NOTE: типы моделей у разных провайдеров в Vercel AI SDK могут расходиться по версиям,
    // а `generateText` ожидает унифицированный `LanguageModel`. Для рантайма это ок,
    // поэтому здесь явно используем `any`, чтобы не блокировать сборку.
    let model: any;
    if (provider === "zai") {
      // z.ai использует OpenAI-совместимый API
      // По документации: https://api.z.ai/api/paas/v4/chat/completions
      // Vercel AI SDK добавляет /chat/completions автоматически, поэтому baseURL должен быть до этого пути
      const zaiProvider = createOpenAI({
        baseURL: "https://api.z.ai/api/paas/v4", // Без слэша в конце, SDK добавит /chat/completions
        apiKey: apiKey,
      });
      model = zaiProvider(config.model);
    } else if (provider === "openai") {
      model = openai(config.model);
    } else if (provider === "google") {
      model = google(config.model);
    } else {
      model = anthropic(config.model);
    }

    // Проверяем, это анализ одного товара? (если есть product и нет allProducts/problematicProducts)
    const isSingleProductAnalysis = 
      request.analysisType === "products" && 
      request.analysisData.product && 
      !request.analysisData.allProducts && 
      !request.analysisData.problematicProducts;

    // Подготавливаем данные для анализа
    let analysisData: any;
    
    // Для анализа одного товара используем ВСЕ переданные данные как есть (они уже рассчитаны только по товару)
    if (isSingleProductAnalysis) {
      // Используем данные как есть - они уже содержат ТОЛЬКО данные товара (summary, product, productOrders, ordersStats, note)
      // НЕ передаем никаких общих данных по бизнесу или другим товарам
      analysisData = { ...request.analysisData };
    } else {
      // Для других анализов преобразуем summary из общего формата и добавляем дополнительные поля
      analysisData = {
        summary: {
          totalRevenue: (request.analysisData.summary as any).grossRevenue || (request.analysisData.summary as any).totalRevenue || 0,
          netPayout: (request.analysisData.summary as any).netPayout || 0,
          totalOrders: (request.analysisData.summary as any).totalOrders || 0,
          completedOrders: (request.analysisData.summary as any).completedOrders || 0,
          returnedOrders: (request.analysisData.summary as any).returnedOrders || 0,
          returnRate: (request.analysisData.summary as any).returnRate || 0,
          feesPercent: (request.analysisData.summary as any).feesPercent || 0,
        },
        // Остальные данные передаются как есть (зависят от типа анализа)
        ...(request.analysisData.topProducts && {
          topProducts: (request.analysisData.topProducts || []).slice(0, 10).map((p: any) => ({
            name: p.name || "",
            revenue: p.revenue || 0,
            profit: p.profit || 0,
            profitMargin: p.profitMargin || 0,
            returnRate: p.returnRate || 0,
          })),
        }),
        ...(request.analysisData.allProducts && {
          allProducts: request.analysisData.allProducts,
        }),
        ...(request.analysisData.problems && {
          problems: request.analysisData.problems,
        }),
        ...(request.analysisData.costBreakdown && {
          costBreakdown: {
            commission: request.analysisData.costBreakdown.commission || 0,
            logistics: request.analysisData.costBreakdown.logistics || 0,
            returns: request.analysisData.costBreakdown.returns || 0,
            storage: request.analysisData.costBreakdown.storage || 0,
            advertising: request.analysisData.costBreakdown.advertising || 0,
            penalties: request.analysisData.costBreakdown.penalties || 0,
          },
        }),
        // Дополнительные поля для разных типов анализа
        ...(request.analysisData.chargeTypeBreakdown && {
          chargeTypeBreakdown: request.analysisData.chargeTypeBreakdown,
        }),
        ...(request.analysisData.orders && {
          orders: request.analysisData.orders,
        }),
        ...(request.analysisData.costReports && {
          costReports: request.analysisData.costReports,
        }),
        ...(request.analysisData.dailyMetrics && {
          dailyMetrics: request.analysisData.dailyMetrics,
        }),
      };
    }

    // Строим промпт с учетом типа анализа
    const userPrompt = buildAnalysisPrompt(analysisData, request.customPrompt, request.analysisType);

    try {
      // Динамически импортируем generateText
      const generateTextFn = await getGenerateText();
      
      // Генерируем ответ от AI
      const { text } = await generateTextFn({
        model,
        system: ANALYSIS_SYSTEM_PROMPT,
        prompt: userPrompt,
        maxOutputTokens: config.maxTokens,
        temperature: config.temperature,
      });

      // Парсим ответ AI (ожидаем JSON)
      const parsed = this.parseAIResponse(text);

      return {
        recommendations: parsed.recommendations || [],
        insights: parsed.insights || text,
        summary: parsed.summary || "",
      };
    } catch (error) {
      console.error("AI анализ ошибка:", error);
      
      // Обрабатываем специфические ошибки z.ai
      if (error instanceof Error) {
        if (error.message.includes("429") || error.message.includes("Insufficient balance") || error.message.includes("no resource package")) {
          throw new Error("Недостаточно баланса на аккаунте z.ai. Пожалуйста, пополните баланс на https://z.ai");
        }
        if (error.message.includes("401") || error.message.includes("Unauthorized")) {
          throw new Error("API ключ z.ai неверный или истёк. Проверьте ZAI_API_KEY в .env.local");
        }
      }
      
      throw new Error(`Ошибка при анализе с помощью AI: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
    }
  }

  /**
   * Парсит ответ AI (пытается извлечь JSON или структурированные данные)
   */
  private parseAIResponse(text: string): {
    recommendations?: Array<{
      id: string;
      type: string;
      priority: "high" | "medium" | "low";
      title: string;
      description: string;
      impact: string;
      actions: string[];
    }>;
    insights?: string;
    summary?: string;
  } {
    // Пытаемся найти JSON в ответе
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        const json = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return json;
      } catch (e) {
        // Если не удалось распарсить JSON, возвращаем текст как есть
      }
    }

    // Если JSON не найден, пытаемся извлечь структурированные данные из текста
    const recommendations: Array<{
      id: string;
      type: string;
      priority: "high" | "medium" | "low";
      title: string;
      description: string;
      impact: string;
      actions: string[];
    }> = [];

    // Простой парсинг текстового формата (если AI вернул не JSON)
    const recSections = text.split(/\d+\./).filter(s => s.trim());
    recSections.forEach((section, index) => {
      const lines = section.split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        recommendations.push({
          id: `ai_rec_${index}`,
          type: "strategy",
          priority: section.toLowerCase().includes("критично") || section.toLowerCase().includes("высокий") ? "high" : "medium",
          title: lines[0].trim(),
          description: lines.slice(1, 3).join(' ').trim(),
          impact: lines.find(l => l.includes("эффект") || l.includes("экономия")) || "",
          actions: lines.filter(l => l.includes("-") || l.includes("•")).map(l => l.replace(/^[-•]\s*/, "").trim()),
        });
      }
    });

    return {
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      insights: text,
    };
  }

  /**
   * Генерирует краткое резюме анализа
   */
  async generateSummary(analysisData: AnalysisResult["summary"]): Promise<string> {
    const provider = "zai";
    const config = getProviderConfig(provider);
    const apiKey = process.env[config.apiKeyEnv];

    if (!apiKey) {
      return "AI анализ недоступен. Установите ZAI_API_KEY в переменных окружения.";
    }

    // z.ai использует OpenAI-совместимый API
    // По документации: https://api.z.ai/api/paas/v4/chat/completions
    const zaiProvider = createOpenAI({
      baseURL: "https://api.z.ai/api/paas/v4", // Без слэша в конце, SDK добавит /chat/completions
      apiKey: apiKey,
    });
    const model: any = zaiProvider(config.model);

    try {
      // Динамически импортируем generateText
      const generateTextFn = await getGenerateText();
      
      const { text } = await generateTextFn({
        model,
        system: "Ты - эксперт по аналитике маркетплейсов. Дай краткое резюме (2-3 предложения) на основе данных.",
        prompt: `Дай краткое резюме анализа отчёта Ozon:
- Выручка: ${analysisData.grossRevenue.toLocaleString()} ₽
- Начислено: ${analysisData.netPayout.toLocaleString()} ₽
- Заказов: ${analysisData.totalOrders} (завершено: ${analysisData.completedOrders}, возвратов: ${analysisData.returnedOrders})
- Процент возвратов: ${analysisData.returnRate.toFixed(1)}%
- Удержания: ${analysisData.feesPercent.toFixed(1)}%`,
        maxOutputTokens: 200,
        temperature: 0.5,
      });

      return text;
    } catch (error) {
      console.error("Ошибка генерации резюме:", error);
      return "";
    }
  }
}
