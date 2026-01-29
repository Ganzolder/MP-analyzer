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
  const handleStartAnalysis = async () => {
    // Используем mainFiles если есть, иначе mainFile (для обратной совместимости)
    const filesToAnalyze = mainFiles.length > 0 ? mainFiles : (mainFile ? [mainFile] : []);
    
    if (filesToAnalyze.length === 0) {
      setUploadError("Пожалуйста, загрузите хотя бы один файл отчёта");
      return;
    }
    
    // Проверка размера файлов (Vercel Pro план: до 12 MB)
    const MAX_SINGLE_FILE_SIZE = 12 * 1024 * 1024; // 12 MB на один файл
    const MAX_TOTAL_SIZE = 12 * 1024 * 1024; // 12 MB общий размер всех файлов
    
    // Проверка размера каждого файла отдельно
    const oversizedFiles = filesToAnalyze.filter(f => f.file.size > MAX_SINGLE_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map(f => f.name).join(", ");
      setUploadError(`Файл(ы) слишком большой(ие): ${fileNames}. Максимальный размер одного файла: 12 MB`);
      return;
    }
    
    // Проверка общего размера всех файлов
    let totalSize = 0;
    filesToAnalyze.forEach(file => {
      totalSize += file.file.size;
    });
    
    // Учитываем файл себестоимости
    if (costFile) {
      // Проверяем размер файла себестоимости
      if (costFile.size > MAX_SINGLE_FILE_SIZE) {
        setUploadError(`Файл себестоимости слишком большой: ${costFile.name}. Максимальный размер: 12 MB`);
        return;
      }
      totalSize += costFile.size;
    }
    
    // Учитываем накладные расходы FormData (примерно 1-2 KB на файл + boundary)
    const formDataOverhead = (filesToAnalyze.length + (costFile ? 1 : 0)) * 2 * 1024; // 2 KB на файл
    totalSize += formDataOverhead;
    
    if (totalSize > MAX_TOTAL_SIZE) {
      const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
      const maxSizeMB = (MAX_TOTAL_SIZE / 1024 / 1024).toFixed(0);
      const filesCount = filesToAnalyze.length + (costFile ? 1 : 0);
      setUploadError(
        `Общий размер всех файлов (${filesCount} шт.) слишком большой: ${totalSizeMB} MB. ` +
        `Максимальный общий размер: ${maxSizeMB} MB. ` +
        `Попробуйте загрузить меньше файлов или уменьшите их размер.`
      );
      return;
    }
    
    hapticFeedback("medium");
    setIsAnalyzing(true);
    
    const analysisId = generateId();
    startAnalysis(analysisId);
    
    try {
      // Шаг 1: Загрузка файла
      updateProgress(10, 0);
      
      // Шаг 2: Отправляем на анализ через API
      updateProgress(30, 1);
      
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
        console.log("📤 [Frontend] Отправка файла себестоимости:", {
          name: costFile.name,
          size: costFile.size,
          type: costFile.type,
        });
        formData.append("costFile", costFile.file);
      } else {
        console.log("⚠️ [Frontend] Файл себестоимости НЕ выбран");
      }
      if (customPrompt) {
        formData.append("customPrompt", customPrompt);
      }
      
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
      
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
      
      // Небольшая задержка перед редиректом
      await delay(500);
      closeProgressModal();
      
      // Переходим на страницу результатов
      router.push(`/analysis/${result.id}`);
      
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
