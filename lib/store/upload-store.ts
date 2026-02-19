import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface UploadedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  uploadProgress: number;
  uploadedAt: Date;
}

interface UploadState {
  // Основной файл отчёта Ozon (для обратной совместимости)
  mainFile: UploadedFile | null;
  mainFileId: string | null;
  
  // Массив файлов отчётов Ozon (для массовой загрузки)
  mainFiles: UploadedFile[];
  
  // Файлы отчётов о выкупленных товарах (RealizationReportCIS)
  buyoutFiles: UploadedFile[];
  
  // Файл себестоимости (для будущего)
  costFile: UploadedFile | null;
  costFileId: string | null;
  
  // Кастомный промпт
  customPrompt: string;
  
  // AI анализ
  useAI: boolean;
  
  // Состояние загрузки
  isUploading: boolean;
  uploadProgress: number;
  uploadError: string | null;
  
  // Действия
  setMainFile: (file: File | null) => void;
  setMainFileId: (id: string | null) => void;
  addMainFile: (file: File) => void;
  removeMainFile: (id: string) => void;
  clearMainFiles: () => void;
  addBuyoutFile: (file: File) => void;
  removeBuyoutFile: (id: string) => void;
  clearBuyoutFiles: () => void;
  setCostFile: (file: File | null) => void;
  setCostFileId: (id: string | null) => void;
  setCustomPrompt: (prompt: string) => void;
  setUseAI: (useAI: boolean) => void;
  setUploadProgress: (progress: number) => void;
  setIsUploading: (isUploading: boolean) => void;
  setUploadError: (error: string | null) => void;
  clearMainFile: () => void;
  clearCostFile: () => void;
  clearAll: () => void;
}

export const useUploadStore = create<UploadState>()(
  persist(
    (set, get) => ({
      mainFile: null,
      mainFileId: null,
      mainFiles: [],
      buyoutFiles: [],
      costFile: null,
      costFileId: null,
      customPrompt: "",
      useAI: false,
      isUploading: false,
      uploadProgress: 0,
      uploadError: null,
      
      setMainFile: (file) => {
        if (!file) {
          set({ mainFile: null, mainFiles: [] });
          return;
        }
        
        const uploadedFile: UploadedFile = {
          id: `file-${Date.now()}`,
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          uploadProgress: 0,
          uploadedAt: new Date(),
        };
        
        set({ mainFile: uploadedFile, mainFiles: [uploadedFile], uploadError: null });
      },
      
      addMainFile: (file) => {
        const uploadedFile: UploadedFile = {
          id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          uploadProgress: 0,
          uploadedAt: new Date(),
        };
        
        const currentFiles = get().mainFiles;
        // Проверяем, нет ли уже файла с таким именем
        const exists = currentFiles.some(f => f.name === file.name);
        if (exists) {
          return; // Пропускаем дубликаты
        }
        
        const newFiles = [...currentFiles, uploadedFile];
        set({ 
          mainFiles: newFiles, 
          mainFile: newFiles.length === 1 ? uploadedFile : get().mainFile, // Обновляем mainFile только если это первый файл
          uploadError: null 
        });
      },
      
      removeMainFile: (id) => {
        const currentFiles = get().mainFiles;
        const newFiles = currentFiles.filter(f => f.id !== id);
        set({ 
          mainFiles: newFiles,
          mainFile: newFiles.length === 1 ? newFiles[0] : (newFiles.length === 0 ? null : get().mainFile),
        });
      },
      
      clearMainFiles: () => {
        set({ mainFiles: [], mainFile: null, mainFileId: null, uploadError: null });
      },
      
      addBuyoutFile: (file) => {
        const uploadedFile: UploadedFile = {
          id: `buyout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          uploadProgress: 0,
          uploadedAt: new Date(),
        };
        const current = get().buyoutFiles;
        if (current.some(f => f.name === file.name)) return;
        set({ buyoutFiles: [...current, uploadedFile], uploadError: null });
      },
      
      removeBuyoutFile: (id) => {
        set({ buyoutFiles: get().buyoutFiles.filter(f => f.id !== id) });
      },
      
      clearBuyoutFiles: () => {
        set({ buyoutFiles: [] });
      },
      
      setMainFileId: (id) => set({ mainFileId: id }),
      
      setCostFile: (file) => {
        if (!file) {
          set({ costFile: null });
          return;
        }
        
        const uploadedFile: UploadedFile = {
          id: `cost-${Date.now()}`,
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          uploadProgress: 0,
          uploadedAt: new Date(),
        };
        
        set({ costFile: uploadedFile });
      },
      
      setCostFileId: (id) => set({ costFileId: id }),
      
      setCustomPrompt: (prompt) => set({ customPrompt: prompt }),
      
      setUseAI: (useAI) => set({ useAI }),
      
      setUploadProgress: (progress) => set({ uploadProgress: progress }),
      
      setIsUploading: (isUploading) => set({ isUploading }),
      
      setUploadError: (error) => set({ uploadError: error }),
      
      clearMainFile: () => set({ mainFile: null, mainFileId: null, mainFiles: [], uploadError: null }),
      
      clearCostFile: () => set({ costFile: null, costFileId: null }),
      
      clearAll: () => set({
        mainFile: null,
        mainFileId: null,
        mainFiles: [],
        buyoutFiles: [],
        costFile: null,
        costFileId: null,
        customPrompt: "",
        useAI: false,
        uploadProgress: 0,
        uploadError: null,
      }),
    }),
    {
      name: "ozon-analyzer-upload",
      partialize: (state) => ({
        customPrompt: state.customPrompt,
        useAI: state.useAI,
        // Не сохраняем файлы в localStorage
      }),
    }
  )
);
