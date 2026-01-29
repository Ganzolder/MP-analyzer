import { create } from "zustand";
import type { FrontendAnalysisResult } from "@/lib/types/analysis";

// Типы для store
type AnalysisStatus = 
  | "pending" 
  | "uploading" 
  | "parsing" 
  | "analyzing" 
  | "generating_insights" 
  | "completed" 
  | "failed";

interface AnalysisStep {
  id: string;
  name: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "error";
  error?: string;
}

// Шаги анализа
const analysisSteps: Omit<AnalysisStep, "status">[] = [
  {
    id: "upload",
    name: "Загрузка файла",
    description: "Передача файла на сервер",
  },
  {
    id: "parse",
    name: "Парсинг данных",
    description: "Извлечение данных из Excel",
  },
  {
    id: "analyze_orders",
    name: "Анализ заказов",
    description: "Обработка транзакций и заказов",
  },
  {
    id: "calculate_metrics",
    name: "Расчёт метрик",
    description: "Вычисление KPI и показателей",
  },
  {
    id: "generate_insights",
    name: "Генерация рекомендаций",
    description: "AI-анализ и формирование советов",
  },
  {
    id: "prepare_report",
    name: "Формирование отчёта",
    description: "Подготовка визуализаций",
  },
];

interface AnalysisState {
  // Текущий анализ
  currentAnalysisId: string | null;
  analysisResult: FrontendAnalysisResult | null;
  
  // Статус обработки
  status: AnalysisStatus;
  progress: number;
  currentStepIndex: number;
  steps: AnalysisStep[];
  
  // Ошибки
  error: string | null;
  
  // Модальное окно прогресса
  isProgressModalOpen: boolean;
  
  // Действия
  startAnalysis: (analysisId: string) => void;
  updateProgress: (progress: number, stepIndex: number) => void;
  setStepStatus: (stepId: string, status: AnalysisStep["status"]) => void;
  completeAnalysis: (result: FrontendAnalysisResult) => void;
  failAnalysis: (error: string) => void;
  setAnalysisResult: (result: FrontendAnalysisResult | null) => void;
  openProgressModal: () => void;
  closeProgressModal: () => void;
  resetAnalysis: () => void;
}

const initialSteps: AnalysisStep[] = analysisSteps.map((step) => ({
  ...step,
  status: "pending" as const,
}));

export const useAnalysisStore = create<AnalysisState>()((set, get) => ({
  currentAnalysisId: null,
  analysisResult: null,
  status: "pending",
  progress: 0,
  currentStepIndex: 0,
  steps: initialSteps,
  error: null,
  isProgressModalOpen: false,
  
  startAnalysis: (analysisId) => {
    set({
      currentAnalysisId: analysisId,
      status: "uploading",
      progress: 0,
      currentStepIndex: 0,
      steps: initialSteps.map((step, index) => ({
        ...step,
        status: index === 0 ? "in_progress" : "pending",
      })),
      error: null,
      isProgressModalOpen: true,
    });
  },
  
  updateProgress: (progress, stepIndex) => {
    const { steps } = get();
    
    // Определяем статус на основе прогресса
    let status: AnalysisStatus = "pending";
    if (progress > 0 && progress < 15) status = "uploading";
    else if (progress >= 15 && progress < 30) status = "parsing";
    else if (progress >= 30 && progress < 60) status = "analyzing";
    else if (progress >= 60 && progress < 90) status = "generating_insights";
    else if (progress >= 90 && progress < 100) status = "generating_insights";
    else if (progress === 100) status = "completed";
    
    // Обновляем статусы шагов
    const updatedSteps = steps.map((step, index) => {
      if (index < stepIndex) {
        return { ...step, status: "completed" as const };
      } else if (index === stepIndex) {
        return { ...step, status: "in_progress" as const };
      }
      return step;
    });
    
    set({
      progress,
      currentStepIndex: stepIndex,
      steps: updatedSteps,
      status,
    });
  },
  
  setStepStatus: (stepId, status) => {
    const { steps } = get();
    set({
      steps: steps.map((step) =>
        step.id === stepId ? { ...step, status } : step
      ),
    });
  },
  
  completeAnalysis: (result) => {
    set({
      status: "completed",
      progress: 100,
      analysisResult: result,
      steps: get().steps.map((step) => ({ ...step, status: "completed" as const })),
    });
  },
  
  failAnalysis: (error) => {
    const { currentStepIndex, steps } = get();
    set({
      status: "failed",
      error,
      steps: steps.map((step, index) =>
        index === currentStepIndex
          ? { ...step, status: "error" as const, error }
          : step
      ),
    });
  },
  
  setAnalysisResult: (result) => set({ analysisResult: result }),
  
  openProgressModal: () => set({ isProgressModalOpen: true }),
  
  closeProgressModal: () => set({ isProgressModalOpen: false }),
  
  resetAnalysis: () =>
    set({
      currentAnalysisId: null,
      analysisResult: null,
      status: "pending",
      progress: 0,
      currentStepIndex: 0,
      steps: initialSteps,
      error: null,
      isProgressModalOpen: false,
    }),
}));
