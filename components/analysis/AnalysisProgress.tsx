"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Circle, Loader2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { AnalysisStep } from "@/lib/types/analysis";

interface AnalysisProgressProps {
  isOpen: boolean;
  steps: AnalysisStep[];
  progress: number;
  currentStep: string;
  error?: string | null;
}

export function AnalysisProgress({
  isOpen,
  steps,
  progress,
  currentStep,
  error,
}: AnalysisProgressProps) {
  const estimatedTime = Math.max(0, Math.ceil((100 - progress) / 10));
  
  return (
    <Dialog open={isOpen}>
      <DialogContent
        hideCloseButton
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="text-xl">
            {error ? "Ошибка анализа" : "Анализ отчёта"}
          </DialogTitle>
          <DialogDescription>
            {error
              ? "Произошла ошибка при обработке файла"
              : "Пожалуйста, подождите. Это может занять несколько минут."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Прогресс-бар */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Прогресс</span>
              <span className="font-medium tabular-nums">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
          
          {/* Шаги */}
          <div className="space-y-3">
            {steps.map((step, index) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg transition-colors",
                  step.status === "in_progress" && "bg-primary/5",
                  step.status === "error" && "bg-destructive/5"
                )}
              >
                <StepIcon status={step.status} />
                <span
                  className={cn(
                    "text-sm",
                    step.status === "completed" && "text-muted-foreground",
                    step.status === "in_progress" && "text-foreground font-medium",
                    step.status === "error" && "text-destructive"
                  )}
                >
                  {step.name}
                </span>
              </motion.div>
            ))}
          </div>
          
          {/* Ошибка */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-destructive/10 rounded-lg border border-destructive/20"
            >
              <p className="text-sm text-destructive">{error}</p>
            </motion.div>
          )}
          
          {/* Оценка времени */}
          {!error && progress < 100 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center"
            >
              <p className="text-xs text-muted-foreground">
                Примерное время ожидания: ~{estimatedTime} сек
              </p>
            </motion.div>
          )}
          
          {/* Завершение */}
          {progress === 100 && !error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-2 py-4"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-success/20 rounded-full blur-xl animate-pulse" />
                <CheckCircle2 className="relative h-12 w-12 text-success" />
              </div>
              <p className="text-sm font-medium text-success">
                Анализ завершён!
              </p>
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepIcon({ status }: { status: AnalysisStep["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />;
    case "in_progress":
      return (
        <Loader2 className="h-5 w-5 text-primary animate-spin flex-shrink-0" />
      );
    case "error":
      return <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />;
    default:
      return <Circle className="h-5 w-5 text-muted-foreground/40 flex-shrink-0" />;
  }
}
