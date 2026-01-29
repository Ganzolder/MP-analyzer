/**
 * Генерация рекомендаций
 */

import { round } from "../data-utils";
import type { CostBreakdown, ProblemArea, Recommendation, ProductMetrics } from "../types";
// НЕ импортируем AI модули статически - только динамически на сервере

interface Summary {
  feesPercent: number;
  returnRate: number;
  grossRevenue: number;
  netPayout: number;
  totalOrders: number;
  completedOrders: number;
  returnedOrders: number;
}

export class RecommendationGenerator {
  private aiService: any = null;
  
  private async getAIService(): Promise<any> {
    // Импортируем AIService только на сервере и только когда нужно
    if (typeof window !== "undefined") {
      return null; // На клиенте AI недоступен
    }
    
    if (!this.aiService) {
      try {
        const { AIService } = await import("@/lib/ai/ai-service");
        this.aiService = new AIService();
      } catch (error) {
        console.error("Ошибка импорта AIService:", error);
        return null;
      }
    }
    return this.aiService;
  }

  /**
   * Генерирует рекомендации (с опциональным AI анализом)
   */
  async generateRecommendations(
    summary: Summary,
    costs: CostBreakdown,
    problems: ProblemArea[],
    topProducts?: ProductMetrics[],
    useAI: boolean = false
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    // По удержаниям Ozon
    if (summary.feesPercent > 50) {
      recommendations.push({
        id: "rec_fees",
        type: "profit",
        priority: "high",
        title: "Снизьте удержания Ozon",
        description: `Удержания составляют ${summary.feesPercent}% от выручки`,
        impact: `При снижении до 45%: +${round((summary.feesPercent - 45) * summary.grossRevenue / 100).toLocaleString()} ₽`,
        actions: [
          "Оптимизируйте логистику (FBS vs FBO)",
          "Пересмотрите ценовую политику",
          "Снизьте процент возвратов",
        ],
      });
    }

    // По возвратам
    if (summary.returnRate > 5) {
      recommendations.push({
        id: "rec_returns",
        type: "cost",
        priority: summary.returnRate > 10 ? "high" : "medium",
        title: "Снизьте возвраты",
        description: `${summary.returnRate}% заказов возвращаются`,
        impact: `Потенциальная экономия: ${round(costs.returns * 0.5).toLocaleString()} ₽`,
        actions: [
          "Улучшите качество фотографий",
          "Добавьте видео-обзоры",
          "Уточните размерные сетки",
        ],
      });
    }

    // По хранению
    if (costs.storage > summary.grossRevenue * 0.05) {
      recommendations.push({
        id: "rec_storage",
        type: "cost",
        priority: "medium",
        title: "Оптимизируйте хранение",
        description: `Затраты на хранение: ${costs.storage.toLocaleString()} ₽`,
        impact: `Экономия до ${round(costs.storage * 0.3).toLocaleString()} ₽`,
        actions: [
          "Сократите неликвидные позиции",
          "Оптимизируйте оборачиваемость",
          "Проведите распродажу застоявшихся товаров",
        ],
      });
    }

    // Из проблем
    for (const problem of problems.slice(0, 2)) {
      recommendations.push({
        id: `rec_${problem.type}`,
        type: "risk",
        priority: problem.severity === "critical" ? "high" : "medium",
        title: problem.title,
        description: problem.description,
        impact: `Потери: ${problem.potentialLoss.toLocaleString()} ₽`,
        actions: [problem.recommendation],
      });
    }

    const baseRecommendations = recommendations.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    });

    // Если AI включен, добавляем AI-рекомендации
    // ВАЖНО: AI работает только на сервере
    if (useAI && typeof window === "undefined") {
      try {
        // Динамически импортируем проверку доступности только на сервере
        const { isProviderAvailable } = await import("@/lib/config/ai-providers");
        const isAvailable = isProviderAvailable("zai");
        
        if (isAvailable) {
          const aiRecommendations = await this.generateAIRecommendations(
            summary,
            costs,
            problems,
            topProducts || []
          );
          
          // Объединяем базовые и AI-рекомендации, убираем дубликаты
          const allRecommendations = [...baseRecommendations];
          
          for (const aiRec of aiRecommendations) {
            // Проверяем, нет ли похожей рекомендации
            const isDuplicate = allRecommendations.some(
              rec => rec.title.toLowerCase() === aiRec.title.toLowerCase()
            );
            
            if (!isDuplicate) {
              allRecommendations.push(aiRec);
            }
          }
          
          return allRecommendations.sort((a, b) => {
            const order = { high: 0, medium: 1, low: 2 };
            return order[a.priority] - order[b.priority];
          });
        } else {
          console.warn("AI провайдер недоступен, используем только базовые рекомендации");
        }
      } catch (error) {
        console.error("Ошибка генерации AI рекомендаций:", error);
        // В случае ошибки возвращаем только базовые рекомендации
        return baseRecommendations;
      }
    }

    return baseRecommendations;
  }

  /**
   * Генерирует рекомендации с помощью AI
   */
  private async generateAIRecommendations(
    summary: Summary,
    costs: CostBreakdown,
    problems: ProblemArea[],
    topProducts: ProductMetrics[]
  ): Promise<Recommendation[]> {
    const aiService = await this.getAIService();
    if (!aiService) {
      throw new Error("AIService недоступен");
    }
    
    const aiResult = await aiService.analyzeReport({
      analysisData: {
        summary,
        topProducts: topProducts.slice(0, 10).map(p => ({
          sku: p.sku || "",
          name: p.productName || "",
          revenue: (p as any).totalRevenue || 0,
          // В метриках продукта "выплата" — netAmount, а "чистая прибыль" — netProfit (если есть себестоимость).
          profit: (p as any).netProfit ?? (p as any).netAmount ?? 0,
          // Рентабельность с себестоимостью (если есть) иначе маржа по выплате.
          profitMargin: (p as any).profitMarginPercent ?? (p as any).marginPercent ?? 0,
          returnRate: p.returnRate || 0,
        })),
        problems,
        costBreakdown: costs,
      },
    });

    return aiResult.recommendations.map((rec: any) => ({
      id: rec.id,
      type: rec.type as Recommendation["type"],
      priority: rec.priority,
      title: rec.title,
      description: rec.description,
      impact: rec.impact,
      actions: rec.actions,
    }));
  }
}
