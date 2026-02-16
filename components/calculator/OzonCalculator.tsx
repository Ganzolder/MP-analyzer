"use client";

import { useState, useCallback, useEffect } from "react";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Calculator, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCalculatorStore } from "@/lib/store/calculator-store";
import { parseOzonFile } from "@/lib/calculator/parsers/ozon-file-parser";
import { useToast } from "@/components/ui/use-toast";
import { OzonProductsTable } from "./OzonProductsTable";
import { OzonSingleProductCalculator } from "./OzonSingleProductCalculator";
import { OzonBulkResults } from "./OzonBulkResults";
import type { ParsedFileResult, BulkCalcResult } from "@/lib/types/calculator";

export function OzonCalculator() {
  const [calculatorMode, setCalculatorMode] = useState<"single" | "batch">("single");
  const { toast } = useToast();
  const {
    ozon,
    setOzonFile,
    setOzonMarginSettings,
    setOzonCategoryMargin,
    removeOzonCategoryMargin,
    setOzonParsedData,
  } = useCalculatorStore();

  const [isParsing, setIsParsing] = useState(false);
  const [localGlobalMargin, setLocalGlobalMargin] = useState(ozon.marginSettings.global.toString());
  const [categoryMargins, setCategoryMargins] = useState<Record<string, string>>({});

  // Параметры отгрузки для массового расчёта
  const [pickupPointType, setPickupPointType] = useState<string>("pvz-ppz");
  const [acceptanceType, setAcceptanceType] = useState<string>("employee");

  // Тарифы из настроек (загружаются из БД)
  const [tariffLastMileFee, setTariffLastMileFee] = useState<number>(25);
  const [tariffDeliveryToPickupFee, setTariffDeliveryToPickupFee] = useState<number>(25);

  // Результаты массового расчёта
  const [bulkResults, setBulkResults] = useState<BulkCalcResult[] | null>(null);
  const [bulkMeta, setBulkMeta] = useState<any>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  // Загрузка тарифов из настроек
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/acquiring-settings?marketplace=ozon");
        const data = await res.json();
        if (data.success && data.data) {
          if (typeof data.data.lastMileFee === "number") {
            setTariffLastMileFee(data.data.lastMileFee);
          }
          if (typeof data.data.deliveryToPickupFee === "number") {
            setTariffDeliveryToPickupFee(data.data.deliveryToPickupFee);
          }
        }
      } catch (e) {
        console.error("Ошибка при загрузке настроек:", e);
      }
    };
    loadSettings();
  }, []);

  // Синхронизируем localGlobalMargin с store
  useEffect(() => {
    setLocalGlobalMargin(ozon.marginSettings.global.toString());
  }, [ozon.marginSettings.global]);

  // Инициализируем значения категорий из store
  const initializeCategoryMargins = useCallback(() => {
    if (ozon.parsedData?.categories) {
      const margins: Record<string, string> = {};
      ozon.parsedData.categories.forEach((cat) => {
        const margin = ozon.marginSettings.byCategory[cat];
        if (margin !== undefined) {
          margins[cat] = margin.toString();
        }
      });
      setCategoryMargins(margins);
    }
  }, [ozon.parsedData?.categories, ozon.marginSettings.byCategory]);

  useEffect(() => {
    initializeCategoryMargins();
  }, [initializeCategoryMargins]);

  const handleFileSelect = useCallback(
    async (file: File | null) => {
      if (!file) {
        setOzonFile(null);
        setOzonParsedData(null);
        setBulkResults(null);
        setBulkMeta(null);
        return;
      }

      const lowerName = file.name.toLowerCase();
      if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
        toast({
          title: "Неверный формат",
          description: "Поддерживаются только файлы .xlsx и .xls",
          variant: "destructive",
        });
        return;
      }

      setOzonFile(file);
      setIsParsing(true);
      setBulkResults(null);
      setBulkMeta(null);

      try {
        const result: ParsedFileResult = await parseOzonFile(file);

        if (result.errors.length > 0) {
          toast({
            title: "Ошибки при парсинге",
            description: `Найдено ${result.errors.length} ошибок. Проверьте файл.`,
            variant: "destructive",
          });
        }

        if (result.products.length === 0) {
          toast({
            title: "Файл пуст",
            description: "Не удалось найти товары в файле",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Файл загружен",
            description: `Найдено ${result.products.length} товаров в ${result.categories.length} категориях`,
          });
        }

        setOzonParsedData(result);
        initializeCategoryMargins();
      } catch (error: any) {
        toast({
          title: "Ошибка",
          description: error.message || "Не удалось обработать файл",
          variant: "destructive",
        });
      } finally {
        setIsParsing(false);
      }
    },
    [setOzonFile, setOzonParsedData, toast, initializeCategoryMargins]
  );

  const handleGlobalMarginChange = useCallback(
    (value: string) => {
      setLocalGlobalMargin(value);
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue >= 0) {
        setOzonMarginSettings({
          ...ozon.marginSettings,
          global: numValue,
        });
      }
    },
    [ozon.marginSettings, setOzonMarginSettings]
  );

  const handleCategoryMarginChange = useCallback(
    (category: string, value: string) => {
      setCategoryMargins((prev) => ({ ...prev, [category]: value }));
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue >= 0) {
        setOzonCategoryMargin(category, numValue);
      } else if (value === "" || isNaN(numValue)) {
        removeOzonCategoryMargin(category);
      }
    },
    [setOzonCategoryMargin, removeOzonCategoryMargin]
  );

  // Массовый расчёт
  const handleBulkCalculate = async () => {
    if (!ozon.parsedData || ozon.parsedData.products.length === 0) return;

    setIsCalculating(true);
    setCalcError(null);
    setBulkResults(null);
    setBulkMeta(null);

    try {
      // Подготавливаем данные
      const products = ozon.parsedData.products.map((p) => ({
        article: p.article,
        name: p.name,
        category: p.category,
        cost: p.cost,
        volumeLiters: p.volumeLiters,
        marginPercent: p.marginPercent,
      }));

      // Собираем маржинальности по категориям из store
      const catMargins: Record<string, number> = {};
      for (const [cat, margin] of Object.entries(ozon.marginSettings.byCategory)) {
        catMargins[cat] = margin;
      }

      const response = await fetch("/api/calculate-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products,
          globalMargin: ozon.marginSettings.global,
          categoryMargins: catMargins,
          pickupPointType,
          acceptanceType,
        }),
      });

      const data = await response.json();

      if (data.success && data.data) {
        setBulkResults(data.data.results);
        setBulkMeta(data.data.meta);
        toast({
          title: "Расчёт завершён",
          description: `Рассчитано ${data.data.meta.calculatedProducts} из ${data.data.meta.totalProducts} товаров`,
        });
      } else {
        setCalcError(data.error || "Ошибка расчёта");
      }
    } catch (error: any) {
      console.error("Ошибка массового расчёта:", error);
      setCalcError("Ошибка при обращении к серверу");
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Выбор режима калькулятора */}
      <Card>
        <CardHeader>
          <CardTitle>Режим калькулятора</CardTitle>
          <CardDescription>Выберите режим работы калькулятора</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={calculatorMode === "single" ? "default" : "outline"}
              onClick={() => setCalculatorMode("single")}
              className="flex-1"
            >
              Один товар
            </Button>
            <Button
              type="button"
              variant={calculatorMode === "batch" ? "default" : "outline"}
              onClick={() => setCalculatorMode("batch")}
              className="flex-1"
            >
              Массовый расчёт (XLSX)
            </Button>
          </div>
        </CardContent>
      </Card>

      {calculatorMode === "single" ? (
        <OzonSingleProductCalculator />
      ) : (
        <>
          {/* Загрузка файла */}
          <Card>
            <CardHeader>
              <CardTitle>Загрузка файла</CardTitle>
              <CardDescription>
                Загрузите файл Excel с данными о товарах. Обязательные колонки: Категория, Артикул, Наименование,
                Себестоимость (Закуп), и Габариты (Ширина/Высота/Длина в мм) либо Объём (в литрах).
                Необязательные: Маржинальность (%), Вес.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <label
                    htmlFor="ozon-file-upload"
                    className="flex items-center gap-2 px-4 py-2 border border-dashed rounded-lg cursor-pointer hover:bg-accent transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    <span>Выбрать файл</span>
                    <input
                      id="ozon-file-upload"
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                      disabled={isParsing}
                    />
                  </label>
                  {ozon.file && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileSpreadsheet className="h-4 w-4" />
                      <span>{ozon.file.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleFileSelect(null)}
                        disabled={isParsing}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {isParsing && (
                  <div className="text-sm text-muted-foreground animate-pulse">Обработка файла...</div>
                )}

                {ozon.parsedData && (
                  <div className="space-y-2">
                    {ozon.parsedData.errors.length > 0 && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Найдено {ozon.parsedData.errors.length} ошибок при парсинге. Первые 5:
                          <ul className="list-disc list-inside mt-2">
                            {ozon.parsedData.errors.slice(0, 5).map((error, idx) => (
                              <li key={idx} className="text-xs">
                                {error}
                              </li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}

                    {ozon.parsedData.products.length > 0 && (
                      <Alert>
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertDescription>
                          Успешно загружено {ozon.parsedData.products.length} товаров из{" "}
                          {ozon.parsedData.categories.length} категорий
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Таблица с содержимым файла (превью) */}
          {ozon.parsedData && ozon.parsedData.products.length > 0 && (
            <OzonProductsTable products={ozon.parsedData.products} />
          )}

          {/* Настройки расчёта */}
          {ozon.parsedData && ozon.parsedData.products.length > 0 && (
            <>
              {/* Настройки маржинальности */}
              <Card>
                <CardHeader>
                  <CardTitle>Настройки маржинальности</CardTitle>
                  <CardDescription>
                    Маржинальность из файла (если указана) имеет высший приоритет.
                    Затем — по категории, затем — общая.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="global-margin">Общая маржинальность (%)</Label>
                    <Input
                      id="global-margin"
                      type="number"
                      min="0"
                      step="0.1"
                      value={localGlobalMargin}
                      onChange={(e) => handleGlobalMarginChange(e.target.value)}
                      placeholder="30"
                    />
                    <p className="text-xs text-muted-foreground">
                      Применяется ко всем товарам, для которых не указана маржинальность в файле или по категории
                    </p>
                  </div>

                  {ozon.parsedData.categories.length > 0 && (
                    <div className="space-y-4">
                      <Label>Маржинальность по категориям (опционально)</Label>
                      <div className="space-y-3">
                        {ozon.parsedData.categories.map((category) => {
                          const hasCustomMargin = ozon.marginSettings.byCategory[category] !== undefined;
                          const marginValue = categoryMargins[category] || "";

                          return (
                            <div key={category} className="flex items-center gap-4">
                              <div className="flex-1">
                                <Label htmlFor={`category-${category}`} className="text-sm font-normal">
                                  {category}
                                </Label>
                              </div>
                              <div className="w-32">
                                <Input
                                  id={`category-${category}`}
                                  type="number"
                                  min="0"
                                  step="0.1"
                                  value={marginValue}
                                  onChange={(e) => handleCategoryMarginChange(category, e.target.value)}
                                  placeholder={ozon.marginSettings.global.toString()}
                                  className={hasCustomMargin ? "border-primary" : ""}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground w-8">%</span>
                              {hasCustomMargin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setCategoryMargins((prev) => {
                                      const next = { ...prev };
                                      delete next[category];
                                      return next;
                                    });
                                    removeOzonCategoryMargin(category);
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Параметры отгрузки FBS */}
              <Card>
                <CardHeader>
                  <CardTitle>Параметры отгрузки (FBS)</CardTitle>
                  <CardDescription>
                    Общие параметры отгрузки для FBS — применяются ко всем товарам
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Тип пункта приёма</Label>
                      <Select value={pickupPointType} onValueChange={setPickupPointType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pvz-ppz">ПВЗ/ППЗ</SelectItem>
                          <SelectItem value="sc">СЦ</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Тип приёмки</Label>
                      <Select value={acceptanceType} onValueChange={setAcceptanceType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="employee">Сотрудник</SelectItem>
                          <SelectItem value="self">Самоприёмка</SelectItem>
                          <SelectItem value="trust">Доверительная</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Тарифы из настроек (только чтение) */}
                    <div className="col-span-2 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Тарифы из настроек:</p>
                      <div className="flex justify-between text-sm">
                        <span>Последняя миля (FBO):</span>
                        <span className="font-medium">{tariffLastMileFee} ₽</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Доставка до места выдачи (FBS):</span>
                        <span className="font-medium">{tariffDeliveryToPickupFee} ₽</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Изменить можно в разделе «Тарифы» → «Настройки эквайринга и тарифов»
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Кнопка расчёта */}
              <div className="flex justify-center">
                <Button
                  size="lg"
                  onClick={handleBulkCalculate}
                  disabled={isCalculating}
                  className="w-full md:w-auto px-12 py-6 text-lg"
                >
                  {isCalculating ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Считаю {ozon.parsedData.products.length} товаров...
                    </>
                  ) : (
                    <>
                      <Calculator className="h-5 w-5 mr-2" />
                      Рассчитать {ozon.parsedData.products.length} товаров
                    </>
                  )}
                </Button>
              </div>

              {/* Ошибка расчёта */}
              {calcError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{calcError}</AlertDescription>
                </Alert>
              )}

              {/* Результаты массового расчёта */}
              {bulkResults && (
                <OzonBulkResults results={bulkResults} meta={bulkMeta} />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
