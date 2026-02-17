/**
 * Store для калькулятора оптимальных цен
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CalculatorState, Marketplace, MarginSettings, OzonCalculatorSettings } from "@/lib/types/calculator";

interface CalculatorStore extends CalculatorState {
  // Действия
  setMarketplace: (marketplace: Marketplace) => void;
  setOzonFile: (file: File | null) => void;
  setOzonMarginSettings: (settings: MarginSettings) => void;
  setOzonCategoryMargin: (category: string, margin: number) => void;
  removeOzonCategoryMargin: (category: string) => void;
  setOzonParsedData: (data: any) => void;
  reset: () => void;
}

const defaultMarginSettings: MarginSettings = {
  global: 30, // 30% по умолчанию
  mode: "markup", // наценка по умолчанию
  byCategory: {},
};

const defaultOzonSettings: OzonCalculatorSettings = {
  marginSettings: defaultMarginSettings,
  file: null,
  parsedData: null,
};

const initialState: CalculatorState = {
  marketplace: "ozon",
  ozon: defaultOzonSettings,
};

export const useCalculatorStore = create<CalculatorStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setMarketplace: (marketplace) => {
        set({ marketplace });
      },

      setOzonFile: (file) => {
        set({
          ozon: {
            ...get().ozon,
            file,
            // Сбрасываем parsedData при смене файла
            parsedData: file ? get().ozon.parsedData : null,
          },
        });
      },

      setOzonMarginSettings: (settings) => {
        set({
          ozon: {
            ...get().ozon,
            marginSettings: settings,
          },
        });
      },

      setOzonCategoryMargin: (category, margin) => {
        const current = get().ozon.marginSettings;
        set({
          ozon: {
            ...get().ozon,
            marginSettings: {
              ...current,
              byCategory: {
                ...current.byCategory,
                [category]: margin,
              },
            },
          },
        });
      },

      removeOzonCategoryMargin: (category) => {
        const current = get().ozon.marginSettings;
        const { [category]: removed, ...rest } = current.byCategory;
        set({
          ozon: {
            ...get().ozon,
            marginSettings: {
              ...current,
              byCategory: rest,
            },
          },
        });
      },

      setOzonParsedData: (data) => {
        set({
          ozon: {
            ...get().ozon,
            parsedData: data,
          },
        });
      },

      reset: () => {
        set(initialState);
      },
    }),
    {
      name: "calculator-storage",
      storage: createJSONStorage(() => localStorage),
      // Не сохраняем файл в localStorage (только метаданные)
      partialize: (state) => ({
        marketplace: state.marketplace,
        ozon: {
          ...state.ozon,
          file: null, // Не сохраняем файл
        },
      }),
    }
  )
);
