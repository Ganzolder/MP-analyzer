"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AcquiringSettingsData {
  acquiringPercent: number;
  lastMileFee: number;
  deliveryToPickupFee: number;
}

export default function AcquiringSettingsPage() {
  const [settings, setSettings] = useState<AcquiringSettingsData>({
    acquiringPercent: 0,
    lastMileFee: 25,
    deliveryToPickupFee: 25,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/acquiring-settings?marketplace=ozon");
      const data = await response.json();

      if (data.success && data.data) {
        setSettings({
          acquiringPercent: data.data.acquiringPercent ?? 0,
          lastMileFee: data.data.lastMileFee ?? 25,
          deliveryToPickupFee: data.data.deliveryToPickupFee ?? 25,
        });
      }
    } catch (err: any) {
      console.error("Ошибка при загрузке настроек:", err);
      setError("Не удалось загрузить настройки.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/acquiring-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketplace: "ozon",
          acquiringPercent: settings.acquiringPercent,
          lastMileFee: settings.lastMileFee,
          deliveryToPickupFee: settings.deliveryToPickupFee,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess("Настройки успешно сохранены!");
        await loadSettings();
      } else {
        setError(data.error || "Не удалось сохранить настройки.");
      }
    } catch (err: any) {
      console.error("Ошибка при сохранении:", err);
      setError(err.message || "Ошибка при сохранении настроек.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Настройки эквайринга и тарифов</CardTitle>
            <CardDescription>
              Управление процентом эквайринга, тарифом последней мили (FBO) и доставки до места выдачи (FBS).
              Эти значения используются во всех расчётах калькулятора (единичный и массовый).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Загрузка данных...</div>
            ) : (
              <>
                <div className="space-y-6">
                  {/* Эквайринг */}
                  <div className="space-y-2">
                    <Label htmlFor="acquiringPercent">Процент эквайринга, %</Label>
                    <Input
                      id="acquiringPercent"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={settings.acquiringPercent}
                      onChange={(e) => {
                        setSettings({ ...settings, acquiringPercent: parseFloat(e.target.value) || 0 });
                        setSuccess(null);
                        setError(null);
                      }}
                      className="max-w-[200px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Процент эквайринга, удерживаемый маркетплейсом с каждой продажи.
                    </p>
                  </div>

                  <div className="h-px bg-border" />

                  {/* Последняя миля FBO */}
                  <div className="space-y-2">
                    <Label htmlFor="lastMileFee">Последняя миля (FBO), ₽</Label>
                    <Input
                      id="lastMileFee"
                      type="number"
                      step="0.01"
                      min="0"
                      value={settings.lastMileFee}
                      onChange={(e) => {
                        setSettings({ ...settings, lastMileFee: parseFloat(e.target.value) || 0 });
                        setSuccess(null);
                        setError(null);
                      }}
                      className="max-w-[200px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Стоимость последней мили доставки FBO. Прибавляется к расчёту FBO всегда.
                    </p>
                  </div>

                  {/* Доставка до места выдачи FBS */}
                  <div className="space-y-2">
                    <Label htmlFor="deliveryToPickupFee">Доставка до места выдачи (FBS), ₽</Label>
                    <Input
                      id="deliveryToPickupFee"
                      type="number"
                      step="0.01"
                      min="0"
                      value={settings.deliveryToPickupFee}
                      onChange={(e) => {
                        setSettings({ ...settings, deliveryToPickupFee: parseFloat(e.target.value) || 0 });
                        setSuccess(null);
                        setError(null);
                      }}
                      className="max-w-[200px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Стоимость доставки товара до места выдачи (ПВЗ/ППЗ/СЦ). Прибавляется к расчёту FBS всегда.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 justify-end mt-6">
                  <Button variant="outline" onClick={loadSettings} disabled={isSaving}>
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
