"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Sparkles, Loader2 } from "lucide-react";
import { removeMarkdown } from "@/lib/utils/remove-markdown";
import { useSettingsStore } from "@/lib/store/settings-store";

interface AIAnalysisButtonProps {
  analysisId: string;
  analysisType: "overview" | "costs" | "products" | "orders" | "cost-reports" | "problems";
  analysisData: Record<string, unknown>;
  label?: string;
  className?: string;
}

export function AIAnalysisButton({ 
  analysisId, 
  analysisType, 
  analysisData, 
  label = "AI Анализ",
  className 
}: AIAnalysisButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [aiResponseText, setAiResponseText] = useState("");
  const { toast } = useToast();
  const { settings, getMonthlyFixedCosts, getAnnualFixedCosts } = useSettingsStore();

  const handleAIAnalysis = async () => {
    setIsLoading(true);
    setIsModalOpen(true);
    setAiResponseText("");

    try {
      const response = await fetch(`/api/analysis/${analysisId}/ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          analysisData: {
            ...analysisData,
            // Добавляем бизнес-настройки, если они указаны
            businessSettings: (settings.vatRate > 0 || getMonthlyFixedCosts() > 0) ? {
              vatRate: settings.vatRate,
              employees: settings.employees,
              rent: settings.rent,
              otherFixedCosts: settings.otherFixedCosts,
              monthlyFixedCosts: getMonthlyFixedCosts(),
              annualFixedCosts: getAnnualFixedCosts(),
            } : undefined,
          },
          analysisType, // Передаём тип анализа
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
        // Добавляем краткий summary, если есть и он короткий
        if (summaryText && summaryText.length < 500) {
          responseText += summaryText + "\n\n";
        }
        
        // Добавляем краткие insights, если есть и они короткие
        if (insightsText && !insightsIsFullResponse && insightsText !== summaryText) {
          const cleanInsights = removeMarkdown(insightsText);
          // Проверяем, что insights не дублирует summary
          if (!responseText.includes(cleanInsights.substring(0, 100))) {
            responseText += cleanInsights + "\n\n";
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
      
      // Если нет структурированных данных, используем весь текст ответа
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
      
      setAiResponseText(cleanText);
    } catch (error) {
      console.error("Ошибка AI анализа:", error);
      const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";
      toast({
        title: "Ошибка AI анализа",
        description: errorMessage,
        variant: "destructive",
      });
      setAiResponseText(`Ошибка: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

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

  return (
    <>
      <Button
        onClick={handleAIAnalysis}
        disabled={isLoading}
        variant="outline"
        className={className}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Анализ...
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            {label}
          </>
        )}
      </Button>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI Анализ: {getTabName(analysisType)}</DialogTitle>
            <DialogDescription>
              Рекомендации на основе анализа данных по разделу "{getTabName(analysisType)}"
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-3 text-muted-foreground">AI анализирует данные...</span>
              </div>
            ) : (
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {aiResponseText || "AI анализ завершён, но ответ пуст."}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function getTabName(analysisType: string): string {
  const names: Record<string, string> = {
    overview: "Обзор",
    costs: "Начисления",
    products: "Товары",
    orders: "Рентабельность заказов",
    "cost-reports": "Себестоимость",
    problems: "Проблемы",
  };
  return names[analysisType] || analysisType;
}
