import { create } from "zustand";
import { persist } from "zustand/middleware";

// Типы для настроек
export interface Employee {
  id: string;
  position: string;
  salary: number;
}

export interface BusinessSettings {
  vatRate: number; // Ставка НДС: 0, 10, 20
  employees: Employee[]; // Список сотрудников
  rent: number; // Аренда в месяц
  otherFixedCosts: number; // Другие постоянные расходы
}

interface SettingsState {
  settings: BusinessSettings;
  setVatRate: (rate: number) => void;
  addEmployee: (employee: Omit<Employee, "id">) => void;
  updateEmployee: (id: string, employee: Partial<Employee>) => void;
  removeEmployee: (id: string) => void;
  setRent: (rent: number) => void;
  setOtherFixedCosts: (costs: number) => void;
  resetSettings: () => void;
  // Вычисляемые значения
  getMonthlyFixedCosts: () => number; // Все постоянные расходы в месяц
  getAnnualFixedCosts: () => number; // Все постоянные расходы в год
}

const defaultSettings: BusinessSettings = {
  vatRate: 0,
  employees: [],
  rent: 0,
  otherFixedCosts: 0,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: defaultSettings,

      setVatRate: (rate) =>
        set((state) => ({
          settings: { ...state.settings, vatRate: rate },
        })),

      addEmployee: (employee) =>
        set((state) => ({
          settings: {
            ...state.settings,
            employees: [
              ...state.settings.employees,
              {
                ...employee,
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
              },
            ],
          },
        })),

      updateEmployee: (id, updates) =>
        set((state) => ({
          settings: {
            ...state.settings,
            employees: state.settings.employees.map((emp) =>
              emp.id === id ? { ...emp, ...updates } : emp
            ),
          },
        })),

      removeEmployee: (id) =>
        set((state) => ({
          settings: {
            ...state.settings,
            employees: state.settings.employees.filter((emp) => emp.id !== id),
          },
        })),

      setRent: (rent) =>
        set((state) => ({
          settings: { ...state.settings, rent },
        })),

      setOtherFixedCosts: (costs) =>
        set((state) => ({
          settings: { ...state.settings, otherFixedCosts: costs },
        })),

      resetSettings: () =>
        set({
          settings: defaultSettings,
        }),

      // Вычисляемые значения
      getMonthlyFixedCosts: () => {
        const { settings } = get();
        const employeesCost = settings.employees.reduce((sum, emp) => sum + emp.salary, 0);
        return employeesCost + settings.rent + settings.otherFixedCosts;
      },

      getAnnualFixedCosts: () => {
        return get().getMonthlyFixedCosts() * 12;
      },
    }),
    {
      name: "business-settings-storage", // localStorage key
    }
  )
);
