"use client";

import { useState } from "react";
import { DollarSign, Users, Building2, Receipt, Plus, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettingsStore, type Employee } from "@/lib/store/settings-store";
import { formatCurrency } from "@/lib/utils";

export function BusinessSettingsForm() {
  const {
    settings,
    setVatRate,
    addEmployee,
    updateEmployee,
    removeEmployee,
    setRent,
    setOtherFixedCosts,
    getMonthlyFixedCosts,
  } = useSettingsStore();

  const [newEmployee, setNewEmployee] = useState<Omit<Employee, "id">>({
    position: "",
    salary: 0,
  });

  const handleAddEmployee = () => {
    if (newEmployee.position.trim() && newEmployee.salary > 0) {
      addEmployee(newEmployee);
      setNewEmployee({ position: "", salary: 0 });
    }
  };

  const monthlyFixedCosts = getMonthlyFixedCosts();
  const annualFixedCosts = monthlyFixedCosts * 12;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Бизнес-настройки</CardTitle>
        <CardDescription>
          Укажите постоянные расходы для более точного расчета прибыльности
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Ставка НДС */}
        <div className="space-y-2">
          <Label htmlFor="vat-rate">Ставка НДС</Label>
          <Select
            value={settings.vatRate.toString()}
            onValueChange={(value) => setVatRate(parseInt(value))}
          >
            <SelectTrigger id="vat-rate">
              <SelectValue placeholder="Выберите ставку НДС" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0% (без НДС)</SelectItem>
              <SelectItem value="10">10%</SelectItem>
              <SelectItem value="20">20%</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="h-px bg-border" />

        {/* Сотрудники */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Сотрудники</Label>
            <div className="text-sm text-muted-foreground">
              Всего: {formatCurrency(settings.employees.reduce((sum, emp) => sum + emp.salary, 0))}/мес
            </div>
          </div>

          {/* Список сотрудников */}
          {settings.employees.length > 0 && (
            <div className="space-y-2">
              {settings.employees.map((employee) => (
                <div
                  key={employee.id}
                  className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30"
                >
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <Input
                      value={employee.position}
                      onChange={(e) =>
                        updateEmployee(employee.id, { position: e.target.value })
                      }
                      placeholder="Должность"
                      className="bg-background"
                    />
                    <Input
                      type="number"
                      value={employee.salary}
                      onChange={(e) =>
                        updateEmployee(employee.id, { salary: parseFloat(e.target.value) || 0 })
                      }
                      placeholder="Зарплата в месяц"
                      className="bg-background"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeEmployee(employee.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Добавление нового сотрудника */}
          <div className="flex items-center gap-3 p-3 border-2 border-dashed rounded-lg">
            <div className="flex-1 grid grid-cols-2 gap-3">
              <Input
                value={newEmployee.position}
                onChange={(e) =>
                  setNewEmployee({ ...newEmployee, position: e.target.value })
                }
                placeholder="Должность"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddEmployee();
                  }
                }}
              />
              <Input
                type="number"
                value={newEmployee.salary || ""}
                onChange={(e) =>
                  setNewEmployee({
                    ...newEmployee,
                    salary: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="Зарплата в месяц (₽)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddEmployee();
                  }
                }}
              />
            </div>
            <Button
              onClick={handleAddEmployee}
              disabled={!newEmployee.position.trim() || newEmployee.salary <= 0}
              size="icon"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Аренда */}
        <div className="space-y-2">
          <Label htmlFor="rent">Аренда в месяц</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="rent"
              type="number"
              value={settings.rent || ""}
              onChange={(e) => setRent(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="pl-9 bg-background"
            />
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Другие постоянные расходы */}
        <div className="space-y-2">
          <Label htmlFor="other-costs">Другие постоянные расходы в месяц</Label>
          <div className="relative">
            <Receipt className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="other-costs"
              type="number"
              value={settings.otherFixedCosts || ""}
              onChange={(e) => setOtherFixedCosts(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="pl-9 bg-background"
            />
          </div>
        </div>

        {/* Итого */}
        {(monthlyFixedCosts > 0 || settings.vatRate > 0) && (
          <>
            <div className="h-px bg-border" />
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Постоянные расходы в месяц:</span>
                <span className="font-semibold">{formatCurrency(monthlyFixedCosts)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Постоянные расходы в год:</span>
                <span className="font-semibold">{formatCurrency(annualFixedCosts)}</span>
              </div>
              {settings.vatRate > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Ставка НДС:</span>
                  <span className="font-semibold">{settings.vatRate}%</span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
