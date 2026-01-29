"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, TrendingUp, Tag, Package, Truck, AlertTriangle, ChevronRight, Loader2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { removeMarkdown } from "@/lib/utils/remove-markdown";

// Функция для удаления дублирующихся блоков текста
function removeDuplicateBlocks(text: string): string {
  const lines = text.split("\n");
  const seen = new Set<string>();
  const result: string[] = [];
  let currentBlock = "";
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Пропускаем пустые строки
    if (!line) {
      if (currentBlock) {
        const blockKey = currentBlock.substring(0, 100).toLowerCase();
        if (!seen.has(blockKey)) {
          seen.add(blockKey);
          result.push(currentBlock);
        }
        currentBlock = "";
      }
      result.push("");
      continue;
    }
    
    // Проверяем, не является ли эта строка началом уже виденного блока
    const lineKey = line.substring(0, 50).toLowerCase();
    if (seen.has(lineKey) && currentBlock) {
      // Пропускаем дубликат
      currentBlock = "";
      continue;
    }
    
    currentBlock += (currentBlock ? "\n" : "") + lines[i];
    
    // Если накопили достаточно большой блок, сохраняем его
    if (currentBlock.length > 200) {
      const blockKey = currentBlock.substring(0, 100).toLowerCase();
      if (!seen.has(blockKey)) {
        seen.add(blockKey);
        result.push(currentBlock);
        currentBlock = "";
      } else {
        currentBlock = "";
      }
    }
  }
  
  // Добавляем последний блок
  if (currentBlock) {
    const blockKey = currentBlock.substring(0, 100).toLowerCase();
    if (!seen.has(blockKey)) {
      result.push(currentBlock);
    }
  }
  
  return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
import type { AIRecommendation, RecommendationCategory, RecommendationPriority, FrontendAnalysisResult } from "@/lib/types/analysis";

interface RecommendationsListProps {
  recommendations: unknown[];
  analysisId: string;
  analysisData: FrontendAnalysisResult;
}

const categoryIcons: Record<RecommendationCategory, React.ReactNode> = {
  strategy: <TrendingUp className="h-4 w-4" />,
  pricing: <Tag className="h-4 w-4" />,
  assortment: <Package className="h-4 w-4" />,
  logistics: <Truck className="h-4 w-4" />,
  problems: <AlertTriangle className="h-4 w-4" />,
};

const categoryLabels: Record<RecommendationCategory, string> = {
  strategy: "Стратегия",
  pricing: "Ценообразование",
  assortment: "Ассортимент",
  logistics: "Логистика",
  problems: "Проблемные зоны",
};

const priorityColors: Record<RecommendationPriority, string> = {
  high: "destructive",
  medium: "warning",
  low: "secondary",
};

const priorityLabels: Record<RecommendationPriority, string> = {
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
};

export function RecommendationsList({ recommendations, analysisId, analysisData }: RecommendationsListProps) {
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiResponseText, setAiResponseText] = useState("");
  const { toast } = useToast();

  const normalizedRecommendations: AIRecommendation[] = useMemo(() => {
    const allowedCategories: RecommendationCategory[] = ["strategy", "pricing", "assortment", "logistics", "problems"];

    const toPriority = (value: any): RecommendationPriority => {
      if (value === "high" || value === "medium" || value === "low") return value;
      if (value === "critical") return "high";
      if (value === "warning") return "medium";
      if (value === "info") return "low";
      return "low";
    };

    const toCategory = (rec: any): RecommendationCategory => {
      if (allowedCategories.includes(rec?.category)) return rec.category;
      // Маппинг из анализатора
      if (rec?.type === "risk") return "problems";
      if (rec?.type === "profit" || rec?.type === "growth") return "strategy";
      if (rec?.type === "cost") return "pricing";
      return "strategy";
    };

    const list = Array.isArray(recommendations) ? recommendations : [];
    return list.map((rec: any, index: number) => ({
      id: String(rec?.id ?? `rec-${index}`),
      title: String(rec?.title ?? "Рекомендация"),
      description: String(rec?.description ?? ""),
      category: toCategory(rec),
      priority: toPriority(rec?.priority ?? rec?.type),
      expectedImpact: rec?.expectedImpact ?? rec?.impact,
      impact: rec?.impact,
      actions: Array.isArray(rec?.actions) ? rec.actions : undefined,
      actionItems: Array.isArray(rec?.actionItems) ? rec.actionItems : undefined,
      type: rec?.type,
    }));
  }, [recommendations]);

  const handleAIAnalysis = async () => {
    setIsLoadingAI(true);
    try {
      const response = await fetch(`/api/analysis/${analysisId}/ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          analysisData: {
            summary: analysisData.summary,
            // Топ-10 товаров с наименованиями (для AI важно видеть все товары)
            topProducts: (analysisData.topProducts || []).slice(0, 10).map(p => ({
              name: (p as any).productName || p.name || "",
              revenue: p.revenue || 0,
              profit: p.profit || 0,
              profitMargin: p.profitMargin || 0,
              returnRate: p.returnRate || 0,
            })),
            // Передаём все товары без ограничений для полного контекста
            allProducts: (analysisData.productMetrics || []).map(p => ({
              name: p.productName || "",
              sku: p.sku || "",
              article: p.article || "",
            })),
            problems: (analysisData.problemAreas || []).map(problem => {
              // Преобразуем affectedItems (SKU/артикулы) в наименования товаров
              const affectedItemNames = problem.affectedItems
                .map(skuOrArticle => {
                  // Ищем товар по SKU или артикулу в topProducts или productMetrics
                  const product = 
                    (analysisData.topProducts || []).find(p => p.sku === skuOrArticle || p.article === skuOrArticle) ||
                    (analysisData.productMetrics || []).find(p => p.sku === skuOrArticle || p.article === skuOrArticle);
                  return (product as any)?.productName || (product as any)?.name || skuOrArticle;
                })
                .filter(name => name); // Убираем пустые значения
              
              return {
                ...problem,
                affectedItems: affectedItemNames, // Заменяем SKU на наименования
              };
            }),
            costBreakdown: analysisData.costBreakdown,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка AI анализа");
      }

      const result = await response.json();
      
      // Формируем простой текст из ответа AI
      let responseText = "";
      
      // Проверяем, что содержит insights - если это полный ответ, используем только его
      const insightsText = result.insights ? removeMarkdown(result.insights) : "";
      const summaryText = result.summary ? removeMarkdown(result.summary) : "";
      
      // Если insights содержит "РЕКОМЕНДАЦИИ" или длинный текст, это уже полный ответ
      const insightsIsFullResponse = insightsText.length > 1000 || 
                                     insightsText.includes("РЕКОМЕНДАЦИИ") ||
                                     insightsText.includes("Рекомендации") ||
                                     insightsText.includes("Категория:");
      
      // Если insights - это полный ответ, используем только его
      if (insightsIsFullResponse && insightsText) {
        responseText = insightsText;
      }
      // Если summary - это полный ответ, используем его
      else if (summaryText.length > 1000 && summaryText.includes("РЕКОМЕНДАЦИИ")) {
        responseText = summaryText;
      }
      // Иначе комбинируем: summary + insights (если не дублируют) + recommendations
      else {
        // Добавляем summary, если есть
        if (summaryText && summaryText.length < 500) {
          responseText += summaryText + "\n\n";
        }
        
        // Добавляем insights, если они не дублируют summary
        if (insightsText && insightsText !== summaryText) {
          // Проверяем, не является ли insights дубликатом summary
          const isDuplicate = summaryText && 
            (insightsText.substring(0, 200) === summaryText.substring(0, 200) ||
             summaryText.includes(insightsText.substring(0, 100)));
          
          if (!isDuplicate && insightsText.length < 500) {
            responseText += insightsText + "\n\n";
          }
        }
        
        // Добавляем рекомендации, если они есть и не содержатся в insights/summary
        if (result.recommendations && result.recommendations.length > 0) {
          // Проверяем, не содержатся ли рекомендации уже в тексте
          const firstRecTitle = result.recommendations[0]?.title || "";
          const alreadyInText = responseText.includes(firstRecTitle.substring(0, 50));
          
          if (!alreadyInText) {
            // Если уже есть текст, добавляем заголовок
            if (responseText) {
              responseText += "РЕКОМЕНДАЦИИ:\n\n";
            }
            
            result.recommendations.forEach((rec: any, index: number) => {
              responseText += `${index + 1}. ${removeMarkdown(rec.title || "Рекомендация")}\n\n`;
              if (rec.description) {
                responseText += `${removeMarkdown(rec.description)}\n\n`;
              }
              if (rec.impact) {
                responseText += `Ожидаемый эффект: ${removeMarkdown(rec.impact)}\n\n`;
              }
              if (rec.actions && rec.actions.length > 0) {
                responseText += "Действия:\n";
                rec.actions.forEach((action: string, idx: number) => {
                  responseText += `  ${idx + 1}. ${removeMarkdown(action)}\n`;
                });
                responseText += "\n";
              }
              responseText += "---\n\n";
            });
          }
        }
      }
      
      // Если нет структурированных данных, используем весь текст ответа (убираем markdown)
      if (!responseText && result.text) {
        responseText = removeMarkdown(result.text);
      }
      
      // Если всё ещё нет текста, пробуем взять из первого элемента
      if (!responseText && result.recommendations && result.recommendations.length > 0) {
        responseText = JSON.stringify(result, null, 2);
      }
      
      // Убираем markdown из финального текста
      let cleanText = removeMarkdown(responseText || "AI анализ завершён, но ответ пуст.");
      
      // Удаляем дубликаты (повторяющиеся блоки)
      cleanText = removeDuplicateBlocks(cleanText);
      
      // Убираем вводные фразы типа "Начни с анализа товара", "Текущее состояние" и т.п.
      cleanText = cleanText.replace(/^.*?(?=ПУНКТ 1:|^ПУНКТ 1:)/i, "");
      cleanText = cleanText.replace(/^.*?(?=Пункт 1:|^Пункт 1:)/i, "");
      cleanText = cleanText.replace(/^.*?Начни с анализа товара[^\n]*\n/i, "");
      cleanText = cleanText.replace(/^.*?Текущее состояние[^\n]*\n/i, "");
      cleanText = cleanText.replace(/^.*?Проанализировав данные[^\n]*\n/i, "");
      cleanText = cleanText.replace(/^.*?Анализ товара[^\n]*\n/i, "");
      
      setAiResponseText(cleanText.trim());
      setIsAIModalOpen(true);
      
      toast({
        title: "AI анализ завершён",
        description: "Рекомендации готовы к просмотру",
        variant: "success",
      });
    } catch (error: any) {
      console.error("Ошибка AI анализа:", error);
      toast({
        title: "Ошибка AI анализа",
        description: error.message || "Не удалось получить AI-рекомендации",
        variant: "destructive",
      });
    } finally {
      setIsLoadingAI(false);
    }
  };

  return (
    <>
      <Card className="glass">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Рекомендации</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Базовые рекомендации на основе анализа ваших данных
                </p>
              </div>
            </div>
            <Button
              onClick={handleAIAnalysis}
              disabled={isLoadingAI}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              {isLoadingAI ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Анализ...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Получить AI-рекомендации
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {normalizedRecommendations.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <p className="mb-4">Рекомендации будут доступны после анализа</p>
              <Button
                onClick={handleAIAnalysis}
                disabled={isLoadingAI}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                {isLoadingAI ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Анализ...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Получить AI-рекомендации
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {normalizedRecommendations.map((rec, index) => (
                <RecommendationCard 
                  key={rec.id} 
                  recommendation={rec} 
                  index={index}
                  isAI={false}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Модальное окно с AI-рекомендациями */}
      <Dialog open={isAIModalOpen} onOpenChange={setIsAIModalOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI-рекомендации
            </DialogTitle>
            <DialogDescription>
              Рекомендации на основе анализа ваших данных с помощью Google Gemini
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto mt-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="whitespace-pre-wrap text-sm font-sans leading-relaxed text-foreground space-y-4">
                {aiResponseText ? (
                  <div className="space-y-6">
                    {aiResponseText.split(/\n\n+/).map((paragraph, idx) => {
                      // Форматируем пункты ПУНКТ 1:, ПУНКТ 2: и т.д.
                      if (/^ПУНКТ \d+:|^Пункт \d+:/i.test(paragraph.trim())) {
                        return (
                          <div key={idx} className="border-l-4 border-primary pl-4 py-2 bg-primary/5 rounded-r">
                            <div className="font-semibold text-primary mb-2">
                              {paragraph.split('\n')[0]}
                            </div>
                            <div className="space-y-1">
                              {paragraph.split('\n').slice(1).map((line, lineIdx) => {
                                // Форматируем нумерованные списки (1., 2., 3.)
                                if (/^\d+\./.test(line.trim())) {
                                  return (
                                    <div key={lineIdx} className="ml-4 text-foreground/90">
                                      {line.trim()}
                                    </div>
                                  );
                                }
                                return line.trim() ? <div key={lineIdx}>{line}</div> : null;
                              })}
                            </div>
                          </div>
                        );
                      }
                      return paragraph.trim() ? (
                        <div key={idx} className="text-foreground/80">
                          {paragraph}
                        </div>
                      ) : null;
                    })}
                  </div>
                ) : (
                  "Загрузка рекомендаций..."
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface RecommendationCardProps {
  recommendation: AIRecommendation;
  index: number;
  isAI?: boolean;
}

function RecommendationCard({ recommendation, index, isAI = false }: RecommendationCardProps) {
  const [isOpen, setIsOpen] = useState(index === 0);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "w-full p-4 rounded-xl text-left transition-all duration-200",
              "bg-muted/50 hover:bg-muted border border-transparent",
              isOpen && "border-primary/30 bg-primary/5"
            )}
          >
            <div className="flex items-start gap-4">
              {/* Иконка категории */}
              <div className={cn(
                "p-2 rounded-lg",
                recommendation.priority === "high" ? "bg-destructive/10 text-destructive" :
                recommendation.priority === "medium" ? "bg-warning/10 text-warning" :
                "bg-muted text-muted-foreground"
              )}>
                {categoryIcons[recommendation.category]}
              </div>
              
              {/* Контент */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h4 className="font-semibold text-sm">{recommendation.title}</h4>
                  {isAI && (
                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                      AI
                    </Badge>
                  )}
                  <Badge
                    variant={
                      recommendation.priority === "high" ? "destructive" :
                      recommendation.priority === "medium" ? "warning" :
                      "secondary"
                    }
                    className="text-[10px]"
                  >
                    {priorityLabels[recommendation.priority]}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {categoryLabels[recommendation.category]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {recommendation.description}
                </p>
              </div>
              
              {/* Стрелка */}
              <ChevronRight
                className={cn(
                  "h-5 w-5 text-muted-foreground transition-transform duration-200 flex-shrink-0",
                  isOpen && "rotate-90"
                )}
              />
            </div>
          </button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-4 pb-4 pt-2 space-y-4"
          >
            {/* Ожидаемый эффект */}
            <div className="p-3 rounded-lg bg-success/10 border border-success/20">
              <p className="text-sm">
                <span className="font-medium text-success">Ожидаемый эффект: </span>
                <span className="text-muted-foreground">{recommendation.expectedImpact}</span>
              </p>
            </div>
            
            {/* Действия */}
            {(recommendation.actions || recommendation.actionItems || []).length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Рекомендуемые действия:</p>
                <ul className="space-y-2">
                  {(recommendation.actions || recommendation.actionItems || []).map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                        {idx + 1}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        </CollapsibleContent>
      </Collapsible>
    </motion.div>
  );
}
