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
import { hapticFeedback, delay } from "@/lib/utils";

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

  const {
    mainFile,
    setMainFile,
    clearMainFile,
    mainFiles,
    addMainFile,
    removeMainFile,
    buyoutFiles,
    addBuyoutFile,
    removeBuyoutFile,
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

  const handleFileSelect = useCallback(
    (file: File) => {
      setMainFile(file);
      setUploadError(null);
      hapticFeedback("light");
    },
    [setMainFile, setUploadError]
  );

  const handleFileRemove = useCallback(() => {
    clearMainFile();
    hapticFeedback("light");
  }, [clearMainFile]);

  const handleCostFileSelect = useCallback(
    (file: File) => {
      setCostFile(file);
      hapticFeedback("light");
    },
    [setCostFile]
  );

  const handleCostFileRemove = useCallback(() => {
    clearCostFile();
    hapticFeedback("light");
  }, [clearCostFile]);

  // Воспользованные в JSX пропсы
  void handleFileSelect;
  void handleFileRemove;

  const MAX_SINGLE_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

  const handleStartAnalysis = async () => {
    // 1..N файлов отчётов (все отправляются одним запросом — бэкенд консолидирует).
    const filesToAnalyze = mainFiles.length > 0 ? mainFiles : mainFile ? [mainFile] : [];
    if (filesToAnalyze.length === 0) {
      setUploadError("Пожалуйста, загрузите хотя бы один файл отчёта");
      return;
    }
    for (const f of filesToAnalyze) {
      if (f.file.size > MAX_SINGLE_FILE_SIZE) {
        setUploadError(`Файл "${f.name}" превышает максимум 20 MB`);
        return;
      }
    }
    if (costFile && costFile.size > MAX_SINGLE_FILE_SIZE) {
      setUploadError(`Файл себестоимости "${costFile.name}" превышает максимум 20 MB`);
      return;
    }

    hapticFeedback("medium");
    setIsAnalyzing(true);

    // analysisId использует бэкенд: мы получаем его из ответа (это supabase import id).
    startAnalysis("pending");

    try {
      updateProgress(10, 0);

      const formData = new FormData();
      filesToAnalyze.forEach((f) => formData.append("files", f.file));
      if (costFile) formData.append("costFile", costFile.file);
      if (buyoutFiles.length > 0) {
        buyoutFiles.forEach((f) => formData.append("buyoutFiles", f.file));
      }
      if (customPrompt) formData.append("customPrompt", customPrompt);

      updateProgress(30, 1);

      const response = await fetch("/api/analyze", { method: "POST", body: formData });

      if (!response.ok) {
        let errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
        try {
          const err = await response.json();
          errorMessage = err.message || err.error || errorMessage;
        } catch {
          // ignore parse errors
        }
        throw new Error(errorMessage);
      }

      updateProgress(90, 4);
      const result = await response.json();

      updateProgress(100, 5);
      completeAnalysis(result);

      await delay(300);
      closeProgressModal();
      router.push(`/analysis/${result.id}`);

      toast({ title: "Анализ завершён", description: "Отчёт готов к просмотру", variant: "success" });
    } catch (err: any) {
      console.error("Analysis error:", err);
      let errorMessage = err.message || "Произошла ошибка при анализе файла. Попробуйте ещё раз.";
      if (errorMessage.includes("413")) {
        errorMessage = "Общий размер файлов слишком большой. Разделите загрузку на меньшие порции.";
      } else if (errorMessage.includes("504")) {
        errorMessage = "Превышено время ожидания. Попробуйте загрузить файл меньшего размера.";
      }
      failAnalysis(errorMessage);
      toast({ title: "Ошибка", description: errorMessage, variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDemoAnalysis = async () => {
    hapticFeedback("medium");
    setIsAnalyzing(true);
    startAnalysis("demo");

    try {
      updateProgress(10, 0);
      const response = await fetch("/api/analyze?demo=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      updateProgress(50, 2);

      if (!response.ok) {
        let errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
        try {
          const err = await response.json();
          errorMessage = err.message || err.error || errorMessage;
        } catch {
          // ignore
        }
        throw new Error(errorMessage);
      }

      updateProgress(90, 4);
      const result = await response.json();
      updateProgress(100, 5);
      completeAnalysis(result);

      await delay(300);
      closeProgressModal();
      router.push(`/analysis/${result.id}`);
      toast({ title: "Демо-анализ завершён", description: "Отчёт с тестовыми данными готов", variant: "success" });
    } catch (err: any) {
      console.error("Demo analysis error:", err);
      failAnalysis(err.message || "Ошибка демо-анализа");
      toast({ title: "Ошибка", description: err.message || "Ошибка демо-анализа", variant: "destructive" });
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
        <motion.div variants={fadeInUp} className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>AI-powered анализ отчётов</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            Анализируйте отчёты <span className="text-gradient">Ozon</span>
            <br />
            за минуты, не часы
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
            Загрузите XLS-файл начислений и получите детальный анализ прибыльности,
            затрат, проблемных зон и AI-рекомендации для роста бизнеса.
          </p>
        </motion.div>

        <motion.div variants={fadeInUp} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FeatureCard icon={<BarChart3 className="h-5 w-5" />} title="Детальная аналитика" description="Графики, метрики и таблицы для глубокого понимания бизнеса" />
          <FeatureCard icon={<TrendingUp className="h-5 w-5" />} title="AI рекомендации" description="Персонализированные советы для увеличения прибыли" />
          <FeatureCard icon={<Shield className="h-5 w-5" />} title="Безопасность" description="Ваши данные обрабатываются локально и не передаются" />
        </motion.div>

        <motion.div variants={fadeInUp} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Файлы отчётов Ozon (можно несколько) <span className="text-destructive">*</span>
            </label>
            <MultiFileUploader
              onFilesSelect={(files) => {
                files.forEach((file) => addMainFile(file));
              }}
              onFileRemove={removeMainFile}
              selectedFiles={mainFiles.map((f) => ({ id: f.id, name: f.name, size: f.size }))}
              title="Перетащите файлы сюда"
              description="или нажмите для выбора нескольких файлов отчётов (помесячных) из личного кабинета Ozon"
              error={uploadError}
              maxSize={MAX_SINGLE_FILE_SIZE}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Отчёт о выкупленных товарах</label>
            <MultiFileUploader
              onFilesSelect={(files) => {
                files.forEach((file) => addBuyoutFile(file));
              }}
              onFileRemove={removeBuyoutFile}
              selectedFiles={buyoutFiles.map((f) => ({ id: f.id, name: f.name, size: f.size }))}
              title="Отчёты о выкупленных товарах"
              description="XLSX-файлы RealizationReportCIS из личного кабинета Ozon. Необязательно — дополняет выручку по выкупам."
              maxSize={MAX_SINGLE_FILE_SIZE}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Файл себестоимости</label>
            <FileUploader
              onFileSelect={handleCostFileSelect}
              onFileRemove={handleCostFileRemove}
              selectedFile={costFile ? { name: costFile.name, size: costFile.size } : null}
              title="База себестоимости"
              description="XLSX файл с колонками: Артикул | Себестоимость за единицу"
            />
          </div>

          <CustomPromptInput value={customPrompt} onChange={setCustomPrompt} disabled={isAnalyzing} />

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

        <motion.p variants={fadeInUp} className="text-center text-sm text-muted-foreground">
          Поддерживаются файлы .xls и .xlsx из раздела «Финансы» → «Отчёт о реализованных товарах» личного кабинета Ozon
        </motion.p>
      </motion.div>

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
