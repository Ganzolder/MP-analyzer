"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, BarChart3, TrendingUp, Shield, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileUploader } from "@/components/upload/FileUploader";
import { MultiFileUploader } from "@/components/upload/MultiFileUploader";
import { CustomPromptInput } from "@/components/analysis/CustomPromptInput";
import { AnalysisProgress } from "@/components/analysis/AnalysisProgress";
import { useUploadStore } from "@/lib/store/upload-store";
import { useAnalysisStore } from "@/lib/store/analysis-store";
import { useToast } from "@/components/ui/use-toast";
import { hapticFeedback, generateId, delay } from "@/lib/utils";
import { getMockAnalysisResult } from "@/lib/mock/analysis-mock";
import type { FrontendAnalysisResult } from "@/lib/types/analysis";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export default function HomePage() {
  const router = useRouter();
  const { toast } = useToast();
  
  // Store состояния
  const {
    mainFile,
    setMainFile,
    clearMainFile,
    mainFiles,
    addMainFile,
    removeMainFile,
    clearMainFiles,
    costFile,
    setCostFile,
    clearCostFile,
    customPrompt,
    setCustomPrompt,
    uploadError,
    setUploadError,
  } = useUploadStore();
  
  const {
    isProgressModalOpen,
    steps,
    progress,
    error: analysisError,
    startAnalysis,
    updateProgress,
    completeAnalysis,
    failAnalysis,
    closeProgressModal,
  } = useAnalysisStore();
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Обработчик выбора файла
  const handleFileSelect = useCallback(
    (file: File) => {
      setMainFile(file);
      setUploadError(null);
      hapticFeedback("light");
    },
    [setMainFile, setUploadError]
  );
  
  // Обработчик удаления файла
  const handleFileRemove = useCallback(() => {
    clearMainFile();
    hapticFeedback("light");
  }, [clearMainFile]);
  
  // Обработчик выбора файла себестоимости
  const handleCostFileSelect = useCallback(
    (file: File) => {
      setCostFile(file);
      hapticFeedback("light");
    },
    [setCostFile]
  );
  
  // Обработчик удаления файла себестоимости
  const handleCostFileRemove = useCallback(() => {
    clearCostFile();
    hapticFeedback("light");
  }, [clearCostFile]);
  
  // Запуск анализа
  /**
   * Объединяет результаты анализа нескольких чанков в один FrontendAnalysisResult
   */
  const mergeFrontendResults = (
    results: FrontendAnalysisResult[],
    analysisId: string,
    files: Array<{ file: File; name: string }>
  ): FrontendAnalysisResult => {
    if (results.length === 0) {
      throw new Error("Необходимо хотя бы один результат для объединения");
    }
    
    if (results.length === 1) {
      return { ...results[0], id: analysisId };
    }
    
    const base = results[0];
    // periodStart и periodEnd есть в summary (добавляются в transformToFrontendFormat)
    const periodLabel = results.length > 0
      ? `${new Date(Math.min(...results.map(r => {
          const start = (r.summary as any).periodStart;
          return start instanceof Date ? start.getTime() : new Date(start).getTime();
        }))).toLocaleDateString("ru-RU")} - ${new Date(Math.max(...results.map(r => {
          const end = (r.summary as any).periodEnd;
          return end instanceof Date ? end.getTime() : new Date(end).getTime();
        }))).toLocaleDateString("ru-RU")}`
      : (typeof base.period === 'string' ? base.period : String(base.period));
    
    const merged: FrontendAnalysisResult = {
      ...base,
      id: analysisId,
      fileName: files.length === 1
        ? files[0].name
        : `Объединённый отчёт (${files.length} файлов)`,
      period: periodLabel as any, // FrontendAnalysisResult.period должен быть string, но тип наследуется от AnalyzerAnalysisResult
      
      // Объединяем summary
      summary: {
        ...base.summary,
        ...({
          periodStart: new Date(Math.min(...results.map(r => {
            const start = (r.summary as any).periodStart;
            return start instanceof Date ? start.getTime() : new Date(start).getTime();
          }))),
          periodEnd: new Date(Math.max(...results.map(r => {
            const end = (r.summary as any).periodEnd;
            return end instanceof Date ? end.getTime() : new Date(end).getTime();
          }))),
        } as any),
        grossRevenue: results.reduce((sum, r) => sum + r.summary.grossRevenue, 0),
        revenueAmount: results.reduce((sum, r) => sum + r.summary.revenueAmount, 0),
        pointsAmount: results.reduce((sum, r) => sum + r.summary.pointsAmount, 0),
        ozonFees: results.reduce((sum, r) => sum + r.summary.ozonFees, 0),
        netPayout: results.reduce((sum, r) => sum + r.summary.netPayout, 0),
        totalOrders: results.reduce((sum, r) => sum + r.summary.totalOrders, 0),
        completedOrders: results.reduce((sum, r) => sum + r.summary.completedOrders, 0),
        returnedOrders: results.reduce((sum, r) => sum + r.summary.returnedOrders, 0),
        partialReturns: results.reduce((sum, r) => sum + r.summary.partialReturns, 0),
        cancelledOrders: results.reduce((sum, r) => sum + (r.summary.cancelledOrders || 0), 0),
        totalCost: results.reduce((sum, r) => sum + (r.summary.totalCost || 0), 0),
        totalCostSold: results.reduce((sum, r) => sum + (r.summary.totalCostSold || 0), 0),
        totalNetProfit: results.reduce((sum, r) => sum + (r.summary.totalNetProfit || 0), 0),
        avgOrderValue: 0, // Пересчитаем ниже
        returnRate: 0, // Пересчитаем ниже
        feesPercent: 0, // Пересчитаем ниже
      },
      
      // Объединяем costBreakdown (это массив)
      costBreakdown: (Array.isArray(base.costBreakdown) ? results.reduce((acc, r) => {
        const rCostBreakdown = Array.isArray(r.costBreakdown) ? r.costBreakdown : [];
        return acc.map((item, index) => ({
          ...item,
          amount: item.amount + (rCostBreakdown[index]?.amount || 0),
        }));
      }, base.costBreakdown as any[]) : base.costBreakdown) as any,
      
      // Объединяем orders
      orders: results.flatMap(r => r.orders || []),
      
      // Объединяем topProducts и worstProducts
      topProducts: results.flatMap(r => r.topProducts || []),
      worstProducts: results.flatMap(r => r.worstProducts || []),
      lossProducts: results.flatMap(r => r.lossProducts || []),
      
      // Объединяем profitTrends
      profitTrends: results.flatMap(r => r.profitTrends || []),
      
      // Объединяем recommendations
      recommendations: results.flatMap(r => r.recommendations || []),
      
      // Объединяем problemAreas
      problemAreas: results.flatMap(r => r.problemAreas || []),
    };
    
    // Пересчитываем метрики
    merged.summary.avgOrderValue = merged.summary.totalOrders > 0
      ? merged.summary.grossRevenue / merged.summary.totalOrders
      : 0;
    merged.summary.returnRate = merged.summary.totalOrders > 0
      ? ((merged.summary.returnedOrders + merged.summary.partialReturns) / merged.summary.totalOrders) * 100
      : 0;
    merged.summary.feesPercent = merged.summary.grossRevenue > 0
      ? (merged.summary.ozonFees / merged.summary.grossRevenue) * 100
      : 0;
    
    // Пересчитываем проценты в costBreakdown (если это массив)
    if (Array.isArray(merged.costBreakdown)) {
      const totalCost = merged.costBreakdown.reduce((sum: number, c: any) => sum + (c.amount || 0), 0);
      merged.costBreakdown = merged.costBreakdown.map((c: any) => ({
        ...c,
        percent: totalCost > 0 ? Math.round((c.amount / totalCost) * 100) : 0,
      })) as any;
    }
    
    return merged;
  };

  /**
   * Разбивает файлы на чанки для загрузки порциями
   * Каждый чанк не должен превышать 4.5 МБ (ограничение Next.js API Routes)
   * И не более 6 файлов в чанке
   */
  const splitFilesIntoChunks = (
    files: Array<{ file: File; name: string }>,
    costFile?: { file: File; name: string }
  ): Array<Array<{ file: File; name: string }>> => {
    const CHUNK_MAX_SIZE = 4.5 * 1024 * 1024; // 4.5 МБ на чанк
    const CHUNK_MAX_FILES = 6; // Максимум 6 файлов в чанке
    const chunks: Array<Array<{ file: File; name: string }>> = [];
    let currentChunk: Array<{ file: File; name: string }> = [];
    let currentChunkSize = 0;
    
    // Файл себестоимости будет добавлен к каждому чанку (он один и тот же для всех)
    const costFileSize = costFile ? costFile.file.size : 0;
    const formDataOverhead = 2 * 1024; // 2 KB на файл для FormData
    
    for (const file of files) {
      const fileSize = file.file.size + formDataOverhead;
      const wouldExceedSize = currentChunkSize + fileSize + costFileSize > CHUNK_MAX_SIZE;
      const wouldExceedCount = currentChunk.length >= CHUNK_MAX_FILES;
      
      // Если текущий чанк заполнен (по размеру или количеству), начинаем новый
      if ((wouldExceedSize || wouldExceedCount) && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentChunkSize = 0;
      }
      
      currentChunk.push(file);
      currentChunkSize += fileSize;
    }
    
    // Добавляем последний чанк, если он не пустой
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  };

  const handleStartAnalysis = async () => {
    // Используем mainFiles если есть, иначе mainFile (для обратной совместимости)
    const filesToAnalyze = mainFiles.length > 0 ? mainFiles : (mainFile ? [mainFile] : []);
    
    if (filesToAnalyze.length === 0) {
      setUploadError("Пожалуйста, загрузите хотя бы один файл отчёта");
      return;
    }
    
    // Проверка размера файлов (Vercel Pro план: до 12 MB на один файл)
    const MAX_SINGLE_FILE_SIZE = 12 * 1024 * 1024; // 12 MB на один файл
    
    // Проверка размера каждого файла отдельно
    const oversizedFiles = filesToAnalyze.filter(f => f.file.size > MAX_SINGLE_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map(f => f.name).join(", ");
      setUploadError(`Файл(ы) слишком большой(ие): ${fileNames}. Максимальный размер одного файла: 12 MB`);
      return;
    }
    
    // Учитываем файл себестоимости
    if (costFile) {
      // Проверяем размер файла себестоимости
      if (costFile.size > MAX_SINGLE_FILE_SIZE) {
        setUploadError(`Файл себестоимости слишком большой: ${costFile.name}. Максимальный размер: 12 MB`);
        return;
      }
    }
    
    hapticFeedback("medium");
    setIsAnalyzing(true);
    
    const analysisId = generateId();
    startAnalysis(analysisId);
    
    try {
      // Шаг 1: Разбиваем файлы на чанки
      updateProgress(5, 0);
      
      const chunks = splitFilesIntoChunks(filesToAnalyze, costFile || undefined);
      console.log(`📦 [Frontend] Файлы разбиты на ${chunks.length} чанк(ов)`, {
        totalFiles: filesToAnalyze.length,
        chunks: chunks.map((chunk, i) => ({
          chunk: i + 1,
          files: chunk.length,
          size: (chunk.reduce((sum, f) => sum + f.file.size, 0) / 1024 / 1024).toFixed(2) + " MB",
        })),
      });
      
      // Если только один чанк, загружаем как обычно
      if (chunks.length === 1) {
        updateProgress(10, 0);
        
        const formData = new FormData();
        
        // Добавляем файлы (для множественной загрузки)
        filesToAnalyze.forEach(file => {
          formData.append("files", file.file);
        });
        
        // Для обратной совместимости также добавляем первый файл как "file"
        if (filesToAnalyze.length > 0) {
          formData.append("file", filesToAnalyze[0].file);
        }
        
        formData.append("analysisId", analysisId);
        
        if (costFile) {
          formData.append("costFile", costFile.file);
        }
        if (customPrompt) {
          formData.append("customPrompt", customPrompt);
        }
        
        updateProgress(30, 1);
        
        const response = await fetch("/api/analyze", {
          method: "POST",
          body: formData,
        });
        
        if (!response.ok) {
          const contentType = response.headers.get("content-type");
          let errorMessage = "Ошибка анализа";
          
          if (contentType && contentType.includes("application/json")) {
            try {
              const error = await response.json();
              errorMessage = error.message || error.error || `Ошибка ${response.status}: ${response.statusText}`;
            } catch (e) {
              errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
            }
          } else {
            try {
              const text = await response.text();
              errorMessage = text || `Ошибка ${response.status}: ${response.statusText}`;
            } catch (e) {
              errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
            }
          }
          
          throw new Error(errorMessage);
        }
        
        updateProgress(90, 4);
        
        const result = await response.json();
        
        updateProgress(100, 5);
        completeAnalysis(result);
        
        await delay(500);
        closeProgressModal();
        
        router.push(`/analysis/${analysisId}`);
        return;
      }
      
      // Несколько чанков - загружаем порциями
      const allResults: FrontendAnalysisResult[] = [];
      const totalChunks = chunks.length;
      
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const chunkProgress = 10 + (chunkIndex / totalChunks) * 80; // 10-90%
        
        console.log(`📤 [Frontend] Загрузка чанка ${chunkIndex + 1}/${totalChunks}`, {
          files: chunk.map(f => f.name),
          size: (chunk.reduce((sum, f) => sum + f.file.size, 0) / 1024 / 1024).toFixed(2) + " MB",
        });
        
        updateProgress(chunkProgress, chunkIndex + 1);
        
        const formData = new FormData();
        
        // Добавляем файлы из текущего чанка
        chunk.forEach(file => {
          formData.append("files", file.file);
        });
        
        // Для обратной совместимости также добавляем первый файл как "file"
        if (chunk.length > 0) {
          formData.append("file", chunk[0].file);
        }
        
        formData.append("analysisId", `${analysisId}-chunk-${chunkIndex}`);
        
        // Файл себестоимости добавляем к каждому чанку
        if (costFile) {
          formData.append("costFile", costFile.file);
        }
        if (customPrompt) {
          formData.append("customPrompt", customPrompt);
        }
        
        const response = await fetch("/api/analyze", {
          method: "POST",
          body: formData,
        });
        
        if (!response.ok) {
          const contentType = response.headers.get("content-type");
          let errorMessage = `Ошибка при загрузке чанка ${chunkIndex + 1}/${totalChunks}`;
          
          if (contentType && contentType.includes("application/json")) {
            try {
              const error = await response.json();
              errorMessage = error.message || error.error || `Ошибка ${response.status}: ${response.statusText}`;
            } catch (e) {
              errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
            }
          } else {
            try {
              const text = await response.text();
              errorMessage = text || `Ошибка ${response.status}: ${response.statusText}`;
            } catch (e) {
              errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
            }
          }
          
          throw new Error(errorMessage);
        }
        
        const chunkResult = await response.json();
        allResults.push(chunkResult);
        
        console.log(`✅ [Frontend] Чанк ${chunkIndex + 1}/${totalChunks} обработан`, {
          revenue: chunkResult.summary?.grossRevenue || 0,
          orders: chunkResult.summary?.totalOrders || 0,
        });
      }
      
      // Объединяем результаты всех чанков
      updateProgress(95, totalChunks + 1);
      console.log(`🔄 [Frontend] Объединение результатов ${allResults.length} чанк(ов)`);
      
      // Объединяем FrontendAnalysisResult (результаты уже в формате для фронтенда)
      const mergedResult = mergeFrontendResults(allResults, analysisId, filesToAnalyze);
      
      updateProgress(100, totalChunks + 2);
      completeAnalysis(mergedResult);
      
      await delay(500);
      closeProgressModal();
      
      // Переходим на страницу результатов
      router.push(`/analysis/${analysisId}`);
      
      toast({
        title: "Анализ завершён",
        description: "Отчёт готов к просмотру",
        variant: "success",
      });
    } catch (err: any) {
      console.error("Analysis error:", err);
      
      // Улучшенные сообщения об ошибках
      let errorMessage = err.message || "Произошла ошибка при анализе файла. Попробуйте ещё раз.";
      
      // Специальные сообщения для известных ошибок
      if (errorMessage.includes("413") || errorMessage.includes("Request Entity Too Large")) {
        errorMessage = "Файл слишком большой. Максимальный размер: 12 MB. Попробуйте загрузить файл меньшего размера.";
      } else if (errorMessage.includes("504") || errorMessage.includes("Gateway Timeout") || errorMessage.includes("timeout")) {
        errorMessage = "Превышено время ожидания. Файл слишком большой для обработки. Попробуйте загрузить файл меньшего размера.";
      } else if (errorMessage.includes("500") || errorMessage.includes("Internal Server Error")) {
        errorMessage = "Ошибка сервера. Попробуйте ещё раз через несколько секунд.";
      }
      
      failAnalysis(errorMessage);
      toast({
        title: "Ошибка",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  // Тест с демо-файлом
  const handleDemoAnalysis = async () => {
    hapticFeedback("medium");
    setIsAnalyzing(true);
    
    const analysisId = generateId();
    startAnalysis(analysisId);
    
    try {
      updateProgress(10, 0);
      
      // Используем API с флагом demo
      const response = await fetch("/api/analyze?demo=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId }),
      });
      
      updateProgress(50, 2);
      
      if (!response.ok) {
        // Проверяем Content-Type перед парсингом JSON
        const contentType = response.headers.get("content-type");
        let errorMessage = "Ошибка анализа";
        
        if (contentType && contentType.includes("application/json")) {
          try {
            const error = await response.json();
            errorMessage = error.message || error.error || `Ошибка ${response.status}: ${response.statusText}`;
          } catch (e) {
            errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
          }
        } else {
          // Если не JSON, читаем как текст
          try {
            const text = await response.text();
            errorMessage = text || `Ошибка ${response.status}: ${response.statusText}`;
          } catch (e) {
            errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
          }
        }
        
        throw new Error(errorMessage);
      }
      
      updateProgress(90, 4);
      
      const result = await response.json();
      
      updateProgress(100, 5);
      completeAnalysis(result);
      
      await delay(500);
      closeProgressModal();
      
      router.push(`/analysis/${result.id}`);
      
      toast({
        title: "Демо-анализ завершён",
        description: "Отчёт с тестовыми данными готов",
        variant: "success",
      });
    } catch (err: any) {
      console.error("Demo analysis error:", err);
      
      // Улучшенные сообщения об ошибках
      let errorMessage = err.message || "Ошибка демо-анализа";
      
      // Специальные сообщения для известных ошибок
      if (errorMessage.includes("413") || errorMessage.includes("Request Entity Too Large")) {
        errorMessage = "Файл слишком большой. Максимальный размер: 12 MB.";
      } else if (errorMessage.includes("504") || errorMessage.includes("Gateway Timeout") || errorMessage.includes("timeout")) {
        errorMessage = "Превышено время ожидания. Попробуйте ещё раз.";
      } else if (errorMessage.includes("500") || errorMessage.includes("Internal Server Error")) {
        errorMessage = "Ошибка сервера. Попробуйте ещё раз через несколько секунд.";
      }
      
      failAnalysis(errorMessage);
      toast({
        title: "Ошибка",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  return (
    <div className="container py-8 md:py-12">
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="max-w-4xl mx-auto space-y-12"
      >
        {/* Hero секция */}
        <motion.div variants={fadeInUp} className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>AI-powered анализ отчётов</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            Анализируйте отчёты{" "}
            <span className="text-gradient">Ozon</span>
            <br />
            за минуты, не часы
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
            Загрузите XLS-файл начислений и получите детальный анализ прибыльности,
            затрат, проблемных зон и AI-рекомендации для роста бизнеса.
          </p>
        </motion.div>
        
        {/* Преимущества */}
        <motion.div variants={fadeInUp} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FeatureCard
            icon={<BarChart3 className="h-5 w-5" />}
            title="Детальная аналитика"
            description="Графики, метрики и таблицы для глубокого понимания бизнеса"
          />
          <FeatureCard
            icon={<TrendingUp className="h-5 w-5" />}
            title="AI рекомендации"
            description="Персонализированные советы для увеличения прибыли"
          />
          <FeatureCard
            icon={<Shield className="h-5 w-5" />}
            title="Безопасность"
            description="Ваши данные обрабатываются локально и не передаются"
          />
        </motion.div>
        
        {/* Форма загрузки */}
        <motion.div variants={fadeInUp} className="space-y-6">
          {/* Массовая загрузка файлов */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Файлы отчётов Ozon (можно несколько) <span className="text-destructive">*</span>
            </label>
            <MultiFileUploader
              onFilesSelect={(files) => {
                files.forEach(file => addMainFile(file));
              }}
              onFileRemove={removeMainFile}
              selectedFiles={mainFiles.map(f => ({ id: f.id, name: f.name, size: f.size }))}
              title="Перетащите файлы сюда"
              description="или нажмите для выбора нескольких файлов отчётов (помесячных) из личного кабинета Ozon"
              error={uploadError}
            />
          </div>
          
          {/* Файл себестоимости */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Файл себестоимости
            </label>
            <FileUploader
              onFileSelect={handleCostFileSelect}
              onFileRemove={handleCostFileRemove}
              selectedFile={costFile ? { name: costFile.name, size: costFile.size } : null}
              title="База себестоимости"
              description="XLSX файл с колонками: Артикул | Себестоимость за единицу"
            />
          </div>
          
          {/* Кастомный промпт */}
          <CustomPromptInput
            value={customPrompt}
            onChange={setCustomPrompt}
            disabled={isAnalyzing}
          />
          
          {/* Кнопка анализа */}
          <div className="pt-4 flex flex-col md:flex-row gap-4 items-center justify-center">
            <Button
              onClick={handleStartAnalysis}
              disabled={(mainFiles.length === 0 && !mainFile) || isAnalyzing}
              loading={isAnalyzing}
              variant="gradient"
              size="xl"
              className="w-full md:w-auto md:min-w-[300px]"
            >
              {isAnalyzing ? (
                "Анализируем..."
              ) : (
                <>
                  {mainFiles.length > 1 ? `Анализировать ${mainFiles.length} файлов` : "Начать анализ"}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
            
            {/* Кнопка теста с демо-файлом */}
            <Button
              onClick={handleDemoAnalysis}
              disabled={isAnalyzing}
              variant="outline"
              size="lg"
              className="w-full md:w-auto"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Тест с демо-файлом
            </Button>
          </div>
        </motion.div>
        
        {/* Примечание */}
        <motion.p variants={fadeInUp} className="text-center text-sm text-muted-foreground">
          Поддерживаются файлы .xls и .xlsx из раздела &quot;Финансы&quot; → &quot;Отчёт о
          реализованных товарах&quot; личного кабинета Ozon
        </motion.p>
      </motion.div>
      
      {/* Модальное окно прогресса */}
      <AnalysisProgress
        isOpen={isProgressModalOpen}
        steps={steps}
        progress={progress}
        currentStep={steps.find((s) => s.status === "in_progress")?.name || ""}
        error={analysisError}
      />
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="glass-card p-4 md:p-6 text-center md:text-left">
      <div className="inline-flex p-2 bg-primary/10 rounded-lg mb-3">
        <span className="text-primary">{icon}</span>
      </div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
