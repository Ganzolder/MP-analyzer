"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface DispatchTariffRow {
  shipmentPointGroup: string; // ПВЗ/ППЗ, СЦ
  employeeFee: number;  // Сотрудник (стандартная отгрузка)
  selfFee: number;      // Самоприёмка
  trustFee: number;     // Доверительная приёмка
}

const DEFAULT_DISPATCH_TARIFFS: DispatchTariffRow[] = [
  { shipmentPointGroup: "ПВЗ/ППЗ", employeeFee: 30, selfFee: 30, trustFee: 30 },
  { shipmentPointGroup: "СЦ", employeeFee: 20, selfFee: 10, trustFee: 10 },
];

export default function ProcessingTariffsPage() {
  const [dispatchTariffs, setDispatchTariffs] = useState<DispatchTariffRow[]>(DEFAULT_DISPATCH_TARIFFS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadDispatchTariffs();
  }, []);

  const loadDispatchTariffs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dispatch-tariffs?marketplace=ozon");
      const data = await response.json();

      if (data.success && data.data && data.data.length > 0) {
        // Преобразуем плоский массив записей из БД в строки таблицы
        const rows: DispatchTariffRow[] = DEFAULT_DISPATCH_TARIFFS.map((def) => {
          const group = def.shipmentPointGroup;
          const records = data.data.filter((t: any) => t.shipmentPointGroup === group);

          const findFee = (method: string): number => {
            const found = records.find((t: any) => t.shipmentMethod === method);
            if (found) return found.dispatchFee;
            // Fallback: запись без shipmentMethod (обратная совместимость)
            const fallback = records.find((t: any) => t.shipmentMethod === null || t.shipmentMethod === undefined);
            if (fallback) return fallback.dispatchFee;
            return def.employeeFee; // Дефолтное значение
          };

          return {
            shipmentPointGroup: group,
            employeeFee: findFee("standard"),
            selfFee: findFee("self"),
            trustFee: findFee("trust"),
          };
        });
        setDispatchTariffs(rows);
      } else {
        setDispatchTariffs(DEFAULT_DISPATCH_TARIFFS);
      }
    } catch (err: any) {
      console.error("Ошибка при загрузке тарифов:", err);
      setError("Не удалось загрузить тарифы. Используются значения по умолчанию.");
      setDispatchTariffs(DEFAULT_DISPATCH_TARIFFS);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (rowIndex: number, field: keyof DispatchTariffRow, value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    const updated = [...dispatchTariffs];
    updated[rowIndex] = { ...updated[rowIndex], [field]: numValue };
    setDispatchTariffs(updated);
    setSuccess(null);
    setError(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Разворачиваем строки таблицы в плоский массив записей для БД
      const tariffs: Array<{ shipmentPointGroup: string; shipmentMethod: string; dispatchFee: number }> = [];
      
      for (const row of dispatchTariffs) {
        tariffs.push({
          shipmentPointGroup: row.shipmentPointGroup,
          shipmentMethod: "standard",
          dispatchFee: row.employeeFee,
        });
        tariffs.push({
          shipmentPointGroup: row.shipmentPointGroup,
          shipmentMethod: "self",
          dispatchFee: row.selfFee,
        });
        tariffs.push({
          shipmentPointGroup: row.shipmentPointGroup,
          shipmentMethod: "trust",
          dispatchFee: row.trustFee,
        });
      }

      const response = await fetch("/api/dispatch-tariffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketplace: "ozon",
          tariffs,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(data.message || "Тарифы за отправление успешно сохранены!");
        await loadDispatchTariffs();
      } else {
        setError(data.error || "Не удалось сохранить тарифы.");
      }
    } catch (err: any) {
      console.error("Ошибка при сохранении:", err);
      setError(err.message || "Ошибка при сохранении тарифов.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Тарифы за отправление FBS</CardTitle>
            <CardDescription>
              Управление тарифами за отправление по типам точек отгрузки и типам приёмки.
              Тарифы используются в калькуляторе для расчёта стоимости FBS.
              Изменения сохраняются в базу данных.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Загрузка данных...</div>
            ) : (
              <>
                <div className="overflow-x-auto mb-6">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">Тип точки отгрузки</th>
                        <th className="text-center py-3 px-4 font-medium">
                          <div>Сотрудник</div>
                          <div className="text-xs text-muted-foreground font-normal">(стандартная отгрузка)</div>
                        </th>
                        <th className="text-center py-3 px-4 font-medium">
                          <div>Самоприёмка</div>
                          <div className="text-xs text-muted-foreground font-normal">(самостоятельная приёмка)</div>
                        </th>
                        <th className="text-center py-3 px-4 font-medium">
                          <div>Доверительная</div>
                          <div className="text-xs text-muted-foreground font-normal">(доверительная приёмка)</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dispatchTariffs.map((row, index) => (
                        <tr key={index} className="border-b hover:bg-muted/30">
                          <td className="py-3 px-4 font-medium">{row.shipmentPointGroup}</td>
                          <td className="py-3 px-4">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.employeeFee}
                              onChange={(e) => handleChange(index, "employeeFee", e.target.value)}
                              className="text-center w-24 mx-auto"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.selfFee}
                              onChange={(e) => handleChange(index, "selfFee", e.target.value)}
                              className="text-center w-24 mx-auto"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.trustFee}
                              onChange={(e) => handleChange(index, "trustFee", e.target.value)}
                              className="text-center w-24 mx-auto"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="text-xs text-muted-foreground mb-4 space-y-1">
                  <p><strong>СЦ</strong> — Сортировочные центры</p>
                  <p><strong>ПВЗ/ППЗ</strong> — Агентские пункты выдачи заказов</p>
                  <p>Все значения указаны в рублях за одно отправление.</p>
                </div>

                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={loadDispatchTariffs} disabled={isSaving}>
                    Отменить
                  </Button>
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? "Сохранение..." : "Сохранить"}
                  </Button>
                </div>

                {error && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertTitle>Ошибка</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {success && (
                  <Alert className="mt-4">
                    <AlertTitle>Успешно</AlertTitle>
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
