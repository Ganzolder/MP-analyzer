import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ExcludedProductsState {
  excludedSkus: Set<string>;
  addExcludedSku: (sku: string) => void;
  removeExcludedSku: (sku: string) => void;
  toggleExcludedSku: (sku: string) => void;
  setExcludedSkus: (skus: Set<string> | string[]) => void;
  clearExcludedSkus: () => void;
  // Очистка для конкретного анализа (при новом расчёте)
  clearForAnalysis: (analysisId: string) => void;
}

// Преобразование Set в массив для сериализации
const setToArray = (set: Set<string>): string[] => Array.from(set);
const arrayToSet = (arr: string[]): Set<string> => new Set(arr);

export const useExcludedProductsStore = create<ExcludedProductsState>()(
  persist(
    (set) => ({
      excludedSkus: new Set(),
      addExcludedSku: (sku) => set((state) => {
        const newSet = new Set(state.excludedSkus);
        newSet.add(sku);
        return { excludedSkus: newSet };
      }),
      removeExcludedSku: (sku) => set((state) => {
        const newSet = new Set(state.excludedSkus);
        newSet.delete(sku);
        return { excludedSkus: newSet };
      }),
      toggleExcludedSku: (sku) => set((state) => {
        const newSet = new Set(state.excludedSkus);
        if (newSet.has(sku)) {
          newSet.delete(sku);
        } else {
          newSet.add(sku);
        }
        return { excludedSkus: newSet };
      }),
      setExcludedSkus: (skus) => set({ 
        excludedSkus: skus instanceof Set ? skus : new Set(skus) 
      }),
      clearExcludedSkus: () => set({ excludedSkus: new Set() }),
      clearForAnalysis: (analysisId: string) => {
        // При новом расчёте очищаем исключённые товары
        set({ excludedSkus: new Set() });
      },
    }),
    {
      name: 'excluded-products-storage',
      // Сериализация Set в массив для localStorage
      serialize: (state) => JSON.stringify({
        ...state,
        state: {
          ...state.state,
          excludedSkus: setToArray(state.state.excludedSkus),
        },
      }),
      deserialize: (str) => {
        const parsed = JSON.parse(str);
        return {
          ...parsed,
          state: {
            ...parsed.state,
            excludedSkus: arrayToSet(parsed.state.excludedSkus || []),
          },
        };
      },
    }
  )
);
