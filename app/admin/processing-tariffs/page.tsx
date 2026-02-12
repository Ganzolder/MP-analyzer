"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface ProcessingTariff {
  id?: string;
  shipmentPointType: string;
  ozonProcessingFee: number;
  partnerProcessingFee: number;
  notes?: string | null;
}

interface DispatchTariff {
  id?: string;
  shipmentPointGroup: string; // ПВЗ/ППЗ, СЦ
  dispatchFee: number;
}

const DEFAULT_TARIFFS: ProcessingTariff[] = [
  {
    shipmentPointType: "АПВЗ",
    ozonProcessingFee: 10,
    partnerProcessingFee: 20,
    notes: null,
  },
  {
    shipmentPointType: "АППЗ",
    ozonProcessingFee: 20,
    partnerProcessingFee: 10,
    notes: null,
  },
  {
    shipmentPointType: "ППЗ (только УТК Садовод, Люблино, Фуд Сити в Москве)",
    ozonProcessingFee: 18,
    partnerProcessingFee: 17,
    notes: "только УТК Садовод, Люблино, Фуд Сити в Москве",
  },
  {
    shipmentPointType: "ППЗ Горбушка",
    ozonProcessingFee: 18,
    partnerProcessingFee: 2,
    notes: null,
  },
];

const DEFAULT_DISPATCH_TARIFFS: DispatchTariff[] = [
  { shipmentPointGroup: "ПВЗ/ППЗ", dispatchFee: 30 },
  { shipmentPointGroup: "СЦ", dispatchFee: 20 },
];

export default function ProcessingTariffsPage() {
  const [tariffs, setTariffs] = useState<ProcessingTariff[]>(DEFAULT_TARIFFS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Вторая таблица: тарифы за отправление
  const [dispatchTariffs, setDispatchTariffs] = useState<DispatchTariff[]>(DEFAULT_DISPATCH_TARIFFS);
  const [isLoadingDispatch, setIsLoadingDispatch] = useState(true);
  const [isSavingDispatch, setIsSavingDispatch] = useState(false);

  // Загружаем тарифы при монтировании
  useEffect(() => {
    loadTariffs();
    loadDispatchTariffs();
  }, []);

  const loadTariffs = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/processing-tariffs?marketplace=ozon");
      const data = await response.json();

      if (data.success && data.data && data.data.length > 0) {
        // Сортируем по порядку из DEFAULT_TARIFFS
        const sorted = DEFAULT_TARIFFS.map((defaultTariff) => {
          const found = data.data.find(
            (t: ProcessingTariff) => t.shipmentPointType === defaultTariff.shipmentPointType
          );
          return found || defaultTariff;
        });
        setTariffs(sorted);
      } else {
        // Если в БД нет данных, используем значения по умолчанию
        setTariffs(DEFAULT_TARIFFS);
      }
    } catch (err: any) {
      console.error("Ошибка при загрузке тарифов обработки:", err);
      setError("Не удалось загрузить тарифы. Используются значения по умолчанию.");
      setTariffs(DEFAULT_TARIFFS);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTariffChange = (index: number, field: "ozonProcessingFee" | "partnerProcessingFee", value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    const updated = [...tariffs];
    updated[index] = {
      ...updated[index],
      [field]: numValue,
    };
    setTariffs(updated);
    setSuccess(null);
    setError(null);
  };

  const loadDispatchTariffs = async () => {
    setIsLoadingDispatch(true);
    try {
      const response = await fetch("/api/dispatch-tariffs?marketplace=ozon");
      const data = await response.json();

      if (data.success && data.data && data.data.length > 0) {
        const sorted = DEFAULT_DISPATCH_TARIFFS.map((defaultTariff) => {
          const found = data.data.find(
            (t: DispatchTariff) => t.shipmentPointGroup === defaultTariff.shipmentPointGroup
          );
          return found || defaultTariff;
        });
        setDispatchTariffs(sorted);
      } else {
        setDispatchTariffs(DEFAULT_DISPATCH_TARIFFS);
      }
    } catch (err: any) {
      console.error("Ошибка при загрузке тарифов за отправление:", err);
      setDispatchTariffs(DEFAULT_DISPATCH_TARIFFS);
    } finally {
      setIsLoadingDispatch(false);
    }
  };

  const handleDispatchChange = (index: number, value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    const updated = [...dispatchTariffs];
    updated[index] = {
      ...updated[index],
      dispatchFee: numValue,
    };
    setDispatchTariffs(updated);
    setSuccess(null);
    setError(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/processing-tariffs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          marketplace: "ozon",
          tariffs: tariffs.map((t) => ({
            shipmentPointType: t.shipmentPointType,
            ozonProcessingFee: t.ozonProcessingFee,
            partnerProcessingFee: t.partnerProcessingFee,
            notes: t.notes || null,
          })),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(data.message || "Тарифы успешно сохранены!");
        // Обновляем данные из БД
        await loadTariffs();
      } else {
        setError(data.error || "Не удалось сохранить тарифы.");
      }
    } catch (err: any) {
      console.error("Ошибка при сохранении тарифов:", err);
      setError(err.message || "Ошибка при сохранении тарифов.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDispatch = async () => {
    setIsSavingDispatch(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/dispatch-tariffs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          marketplace: "ozon",
          tariffs: dispatchTariffs.map((t) => ({
            shipmentPointGroup: t.shipmentPointGroup,
            dispatchFee: t.dispatchFee,
          })),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(data.message || "Тарифы за отправление успешно сохранены!");
        await loadDispatchTariffs();
      } else {
        setError(data.error || "Не удалось сохранить тарифы за отправление.");
      }
    } catch (err: any) {
      console.error("Ошибка при сохранении тарифов за отправление:", err);
      setError(err.message || "Ошибка при сохранении тарифов за отправление.");
    } finally {
      setIsSavingDispatch(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Тарифы обработки отправлений</CardTitle>
            <CardDescription>
              Управление тарифами за обработку отправлений по типам точек отгрузки. Изменения сохраняются в базу данных.
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
                        <th className="text-right py-3 px-4 font-medium">Тариф за обработку отправления Ozon (₽)</th>
                        <th className="text-right py-3 px-4 font-medium">Тариф за обработку отправления партнёрами (₽)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tariffs.map((tariff, index) => (
                        <tr key={index} className="border-b hover:bg-muted/30">
                          <td className="py-3 px-4">
                            <div className="font-medium">{tariff.shipmentPointType}</div>
                            {tariff.notes && (
                              <div className="text-xs text-muted-foreground mt-1">{tariff.notes}</div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={tariff.ozonProcessingFee}
                              onChange={(e) => handleTariffChange(index, "ozonProcessingFee", e.target.value)}
                              className="text-right w-24 ml-auto"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={tariff.partnerProcessingFee}
                              onChange={(e) => handleTariffChange(index, "partnerProcessingFee", e.target.value)}
                              className="text-right w-24 ml-auto"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={loadTariffs} disabled={isSaving}>
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

        {/* Вторая таблица: Тарифы за отправление */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-2xl">Тарифы за отправление</CardTitle>
            <CardDescription>
              Управление тарифами за отправление по типам точек отгрузки (ПВЗ/ППЗ, СЦ). Изменения сохраняются в базу данных.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingDispatch ? (
              <div className="text-center py-8 text-muted-foreground">Загрузка данных...</div>
            ) : (
              <>
                <div className="overflow-x-auto mb-6">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">Тип точки отгрузки</th>
                        <th className="text-right py-3 px-4 font-medium">Тариф за отправление (₽)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dispatchTariffs.map((tariff, index) => (
                        <tr key={index} className="border-b hover:bg-muted/30">
                          <td className="py-3 px-4 font-medium">{tariff.shipmentPointGroup}</td>
                          <td className="py-3 px-4">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={tariff.dispatchFee}
                              onChange={(e) => handleDispatchChange(index, e.target.value)}
                              className="text-right w-24 ml-auto"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={loadDispatchTariffs} disabled={isSavingDispatch}>
                    Отменить
                  </Button>
                  <Button onClick={handleSaveDispatch} disabled={isSavingDispatch}>
                    {isSavingDispatch ? "Сохранение..." : "Сохранить"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
