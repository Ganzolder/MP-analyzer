"use client";

import { useState, useCallback, useEffect } from "react";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCalculatorStore } from "@/lib/store/calculator-store";
import { parseOzonFile } from "@/lib/calculator/parsers/ozon-file-parser";
import { useToast } from "@/components/ui/use-toast";
import { OzonProductsTable } from "./OzonProductsTable";
import type { ParsedFileResult } from "@/lib/types/calculator";

export function OzonCalculator() {
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

  // Инициализируем при загрузке
  useEffect(() => {
    initializeCategoryMargins();
  }, [initializeCategoryMargins]);

  const handleFileSelect = useCallback(
    async (file: File | null) => {
      if (!file) {
        setOzonFile(null);
        setOzonParsedData(null);
        return;
      }

      // Проверка формата
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

  return (
    <div className="space-y-6">
      {/* Загрузка файла */}
      <Card>
        <CardHeader>
          <CardTitle>Загрузка файла</CardTitle>
          <CardDescription>
            Загрузите файл Excel с данными о товарах. Обязательные колонки: Категория товара, Артикул, Наименование,
            Себестоимость, Ширина в мм, Высота в мм, Длина в мм
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
              <div className="text-sm text-muted-foreground">Обработка файла...</div>
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

      {/* Таблица с содержимым файла */}
      {ozon.parsedData && ozon.parsedData.products.length > 0 && (
        <OzonProductsTable products={ozon.parsedData.products} />
      )}

      {/* Настройки маржинальности */}
      {ozon.parsedData && ozon.parsedData.products.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Настройки маржинальности</CardTitle>
            <CardDescription>
              Установите желаемую маржинальность. Можно указать общую для всех товаров или отдельную для каждой
              категории.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Общая маржинальность */}
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

            {/* Маржинальность по категориям */}
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
                <p className="text-xs text-muted-foreground">
                  Если указана маржинальность для категории, она имеет приоритет над общей маржинальностью
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
