"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, Calculator, TrendingUp, TrendingDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface FulfillmentResult {
  commissionPct: number;
  commissionAmount: number;
  shippingCost: number;
  shippingDetails: string;
  processingFee: number;
  processingDetails: string;
  deliveryToPickupPoint?: number;
  acquiringFee: number;
  totalFees: number;
  profit: number;
  margin: number;
}

interface CalcResult {
  price: number;
  volumeLiters: number;
  volumeCm3: number;
  priceBand: string;
  productCost: number;
  otherExpenses: number;
  totalCost: number;
  acquiringPct: number;
  acquiringFee: number;
  commission: {
    categoryName: string | null;
    productType: string | null;
  };
  fbo: FulfillmentResult;
  fbs: FulfillmentResult;
  rfbs: FulfillmentResult;
}

interface CategoryOption {
  value: string;
  label: string;
  type: "category" | "productType";
}

interface SearchResult {
  value: string;
  label: string;
  type: "category" | "productType";
}

interface ProcessingTariff {
  shipmentPointType: string;
  ozonProcessingFee: number;
  partnerProcessingFee: number;
}

interface DispatchTariff {
  shipmentPointGroup: string;
  dispatchFee: number;
}

interface CommissionRates {
  categoryName: string | null;
  productType: string | null;
  categoryPath: string | null;
  rates: {
    fbo: {
      upTo100: number | null;
      from100to300: number | null;
      from300to500: number | null;
      from500to1500: number | null;
      over1500: number | null;
    };
    fboFresh: {
      upTo100: number | null;
      from100to300: number | null;
      over300: number | null;
    };
    fbs: {
      upTo100: number | null;
      from100to300: number | null;
      over300: number | null;
    };
    rfbs: number | null;
  };
}

export function OzonSingleProductCalculator() {
  // Параметры товара
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [weight, setWeight] = useState<string>("");

  // Габариты/Объём
  const [dimensionMode, setDimensionMode] = useState<"dimensions" | "volume">("dimensions");
  const [length, setLength] = useState<string>("");
  const [width, setWidth] = useState<string>("");
  const [height, setHeight] = useState<string>("");
  const [volume, setVolume] = useState<string>("");
  const [calculatedVolume, setCalculatedVolume] = useState<number | null>(null);

  // Параметры отгрузки
  const [shipmentMethod, setShipmentMethod] = useState<"pickup" | "courier">("pickup");
  const [pickupPointType, setPickupPointType] = useState<string>("");
  const [acceptanceType, setAcceptanceType] = useState<string>("");
  const [deliveryToPickupPoint, setDeliveryToPickupPoint] = useState<string>("25"); // Доставка до места выдачи

  // Себестоимость
  const [costMode, setCostMode] = useState<"single" | "batch">("single");
  const [productCost, setProductCost] = useState<string>("");
  const [otherExpenses, setOtherExpenses] = useState<string>("");

  // Поиск категорий
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Комиссии
  const [commissionRates, setCommissionRates] = useState<CommissionRates | null>(null);
  const [isLoadingRates, setIsLoadingRates] = useState(false);

  // Тарифы обработки и отправления
  const [processingTariffs, setProcessingTariffs] = useState<ProcessingTariff[]>([]);
  const [dispatchTariffs, setDispatchTariffs] = useState<DispatchTariff[]>([]);

  // Результаты расчёта
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  // Поиск категорий и типов товаров по названию
  useEffect(() => {
    const searchCategories = async () => {
      if (!productName || productName.trim().length < 2) {
        setCategoryOptions([]);
        return;
      }

      setIsSearching(true);
      try {
        const response = await fetch(
          `/api/category-commissions/search?q=${encodeURIComponent(productName)}&marketplace=ozon&limit=30`
        );
        const data = await response.json();

        if (data.success && data.data) {
          const options: CategoryOption[] = data.data.map((item: SearchResult) => ({
            value: item.value,
            label: item.label,
            type: item.type,
          }));
          setCategoryOptions(options);

          // Автоматически выбираем первый результат, если ещё ничего не выбрано
          if (!category && options.length > 0) {
            setCategory(options[0].value);
          }
        } else {
          setCategoryOptions([]);
        }
      } catch (error) {
        console.error("Ошибка при поиске категорий:", error);
        setCategoryOptions([]);
      } finally {
        setIsSearching(false);
      }
    };

    // Debounce поиска
    const timeoutId = setTimeout(() => {
      searchCategories();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [productName, category]);

  // Загрузка тарифов обработки и отправления при монтировании
  useEffect(() => {
    const loadTariffs = async () => {
      try {
        const [procRes, dispRes] = await Promise.all([
          fetch("/api/processing-tariffs?marketplace=ozon"),
          fetch("/api/dispatch-tariffs?marketplace=ozon"),
        ]);
        const procData = await procRes.json();
        const dispData = await dispRes.json();
        if (procData.success && procData.data) {
          setProcessingTariffs(procData.data);
        }
        if (dispData.success && dispData.data) {
          setDispatchTariffs(dispData.data);
        }
      } catch (error) {
        console.error("Ошибка при загрузке тарифов:", error);
      }
    };
    loadTariffs();
  }, []);

  // Загрузка ставок комиссии при выборе категории
  useEffect(() => {
    const fetchRates = async () => {
      if (!category) {
        setCommissionRates(null);
        return;
      }

      // Парсим value формата "productType:Шины" или "category:Автотовары"
      const colonIdx = category.indexOf(":");
      if (colonIdx === -1) return;

      const type = category.substring(0, colonIdx);
      const value = category.substring(colonIdx + 1);

      setIsLoadingRates(true);
      try {
        const response = await fetch(
          `/api/category-commissions/rates?type=${encodeURIComponent(type)}&value=${encodeURIComponent(value)}&marketplace=ozon`
        );
        const data = await response.json();
        if (data.success && data.data) {
          setCommissionRates(data.data);
        } else {
          setCommissionRates(null);
        }
      } catch (error) {
        console.error("Ошибка при загрузке комиссий:", error);
        setCommissionRates(null);
      } finally {
        setIsLoadingRates(false);
      }
    };

    fetchRates();
  }, [category]);

  // Определение активной комиссии на основе цены
  const getActiveCommission = (): { fbo: number | null; fbs: number | null; rfbs: number | null } => {
    if (!commissionRates) return { fbo: null, fbs: null, rfbs: null };

    const priceNum = parseFloat(price.replace(/\s/g, ""));
    const rates = commissionRates.rates;

    let fbo: number | null = null;
    let fbs: number | null = null;

    if (isNaN(priceNum) || priceNum <= 0) {
      // Нет цены — показываем первый ценовой диапазон
      fbo = rates.fbo.upTo100;
      fbs = rates.fbs.upTo100;
    } else if (priceNum <= 100) {
      fbo = rates.fbo.upTo100;
      fbs = rates.fbs.upTo100;
    } else if (priceNum <= 300) {
      fbo = rates.fbo.from100to300;
      fbs = rates.fbs.from100to300;
    } else if (priceNum <= 500) {
      fbo = rates.fbo.from300to500;
      fbs = rates.fbs.over300;
    } else if (priceNum <= 1500) {
      fbo = rates.fbo.from500to1500;
      fbs = rates.fbs.over300;
    } else {
      fbo = rates.fbo.over1500;
      fbs = rates.fbs.over300;
    }

    return { fbo, fbs, rfbs: rates.rfbs };
  };

  const activeCommission = getActiveCommission();

  // Автоматический расчёт объёма из габаритов
  useEffect(() => {
    if (dimensionMode === "dimensions" && length && width && height) {
      const l = parseFloat(length.replace(",", "."));
      const w = parseFloat(width.replace(",", "."));
      const h = parseFloat(height.replace(",", "."));
      if (!isNaN(l) && !isNaN(w) && !isNaN(h)) {
        const vol = (l * w * h) / 1000; // см³ в литры
        setCalculatedVolume(vol);
      } else {
        setCalculatedVolume(null);
      }
    } else {
      setCalculatedVolume(null);
    }
  }, [dimensionMode, length, width, height]);

  // Форматирование процента — округление до целых (44.999999 → 45)
  const fmtPct = (v: number | null): string => {
    if (v === null || v === undefined) return "—";
    return `${Math.round(v)}%`;
  };

  // Форматирование числа с пробелами для тысяч
  const formatNumber = (value: string): string => {
    if (!value) return "";
    const num = parseFloat(value.replace(/\s/g, ""));
    if (isNaN(num)) return value;
    return num.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  // Обработчик изменения цены с форматированием
  const handlePriceChange = (value: string) => {
    const cleaned = value.replace(/\s/g, "");
    setPrice(cleaned);
  };

  // Обработчик изменения себестоимости с форматированием
  const handleProductCostChange = (value: string) => {
    const cleaned = value.replace(/\s/g, "");
    setProductCost(cleaned);
  };

  // Расчёт объёма в литрах
  const getVolumeLiters = (): number => {
    if (dimensionMode === "volume" && volume) {
      return parseFloat(volume.replace(",", ".")) || 0;
    }
    if (calculatedVolume !== null) {
      return calculatedVolume;
    }
    return 0;
  };

  // Основная функция расчёта
  const handleCalculate = async () => {
    const priceNum = parseFloat(price.replace(/\s/g, ""));
    if (!priceNum || priceNum <= 0) {
      setCalcError("Укажите цену товара");
      return;
    }

    const vol = getVolumeLiters();
    if (vol <= 0) {
      setCalcError("Укажите объём или габариты товара");
      return;
    }

    // Определяем тип и значение категории из selected value
    let catType = "";
    let catValue = "";
    if (category) {
      const colonIdx = category.indexOf(":");
      if (colonIdx !== -1) {
        catType = category.substring(0, colonIdx);
        catValue = category.substring(colonIdx + 1);
      }
    }

    setIsCalculating(true);
    setCalcError(null);
    setCalcResult(null);

    try {
      const response = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketplace: "ozon",
          categoryType: catType || undefined,
          categoryValue: catValue || undefined,
          price: priceNum,
          volumeLiters: vol,
          pickupPointType: pickupPointType || undefined,
          acceptanceType: acceptanceType || undefined,
          deliveryToPickupPoint: parseFloat(deliveryToPickupPoint) || 0,
          productCost: parseFloat(productCost) || 0,
          otherExpenses: parseFloat(otherExpenses) || 0,
        }),
      });

      const data = await response.json();
      if (data.success && data.data) {
        setCalcResult(data.data);
      } else {
        setCalcError(data.error || "Ошибка расчёта");
      }
    } catch (error) {
      console.error("Ошибка расчёта:", error);
      setCalcError("Ошибка при обращении к серверу");
    } finally {
      setIsCalculating(false);
    }
  };

  // Форматирование денег
  const fmtMoney = (v: number): string => {
    return v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₽";
  };

  return (
    <div className="space-y-6">
      {/* Параметры товара */}
      <Card>
        <CardHeader>
          <CardTitle>Параметры товара</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Название товара */}
          <div className="space-y-2">
            <Label htmlFor="productName">Название товара</Label>
            <Input
              id="productName"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Введите название товара"
            />
          </div>

          {/* Категория / Тип товара */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="category">Категория</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Категория подбирается автоматически по названию товара из базы комиссий.
                      Поиск идёт по столбцам «Тип товара» и «Категория». Вы можете изменить выбор вручную.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select
              value={category}
              onValueChange={setCategory}
              disabled={isSearching || (!productName || productName.trim().length < 2)}
            >
              <SelectTrigger id="category">
                <SelectValue
                  placeholder={
                    isSearching
                      ? "Поиск..."
                      : !productName || productName.trim().length < 2
                        ? "Введите название товара (минимум 2 символа)"
                        : categoryOptions.length === 0
                          ? "Ничего не найдено"
                          : "Выберите категорию"
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {categoryOptions.length > 0 ? (
                  <>
                    {categoryOptions.filter((o) => o.type === "productType").length > 0 && (
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        Типы товаров
                      </div>
                    )}
                    {categoryOptions
                      .filter((o) => o.type === "productType")
                      .map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    {categoryOptions.filter((o) => o.type === "category").length > 0 && (
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-1 border-t pt-1.5">
                        Категории
                      </div>
                    )}
                    {categoryOptions
                      .filter((o) => o.type === "category")
                      .map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                  </>
                ) : (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    {isSearching
                      ? "Поиск..."
                      : !productName || productName.trim().length < 2
                        ? "Введите название товара для поиска"
                        : "Ничего не найдено в базе комиссий"}
                  </div>
                )}
              </SelectContent>
            </Select>
            {category && (
              <p className="text-xs text-muted-foreground">
                Выбрано: {categoryOptions.find((opt) => opt.value === category)?.label || category}
              </p>
            )}
          </div>

          {/* Блок комиссий */}
          {isLoadingRates && (
            <div className="text-sm text-muted-foreground animate-pulse">
              Загрузка комиссий...
            </div>
          )}
          {commissionRates && !isLoadingRates && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Комиссии Ozon</h4>
                {commissionRates.categoryPath && (
                  <span className="text-xs text-muted-foreground">
                    {commissionRates.categoryPath}
                  </span>
                )}
              </div>

              {/* Активная комиссия по текущей цене */}
              {price && parseFloat(price.replace(/\s/g, "")) > 0 && (
                <div className="flex gap-3 flex-wrap">
                  {activeCommission.fbo !== null && (
                    <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-md text-sm font-medium">
                      <span>FBO:</span>
                      <span className="font-bold">{fmtPct(activeCommission.fbo)}</span>
                    </div>
                  )}
                  {activeCommission.fbs !== null && (
                    <div className="flex items-center gap-1.5 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-md text-sm font-medium">
                      <span>FBS:</span>
                      <span className="font-bold">{fmtPct(activeCommission.fbs)}</span>
                    </div>
                  )}
                  {activeCommission.rfbs !== null && (
                    <div className="flex items-center gap-1.5 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 px-3 py-1.5 rounded-md text-sm font-medium">
                      <span>RFBS:</span>
                      <span className="font-bold">{fmtPct(activeCommission.rfbs)}</span>
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground self-center">
                    при цене {formatNumber(price)} ₽
                  </span>
                </div>
              )}

              {/* Полная таблица комиссий */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Ценовой диапазон</th>
                      <th className="text-center py-1.5 px-2 font-medium text-blue-600">FBO</th>
                      <th className="text-center py-1.5 px-2 font-medium text-blue-400">FBO Fresh</th>
                      <th className="text-center py-1.5 px-2 font-medium text-green-600">FBS</th>
                      <th className="text-center py-1.5 px-2 font-medium text-orange-600">RFBS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "до 100 ₽", fbo: commissionRates.rates.fbo.upTo100, fboFresh: commissionRates.rates.fboFresh.upTo100, fbs: commissionRates.rates.fbs.upTo100, rfbs: commissionRates.rates.rfbs, priceRange: [0, 100] },
                      { label: "100–300 ₽", fbo: commissionRates.rates.fbo.from100to300, fboFresh: commissionRates.rates.fboFresh.from100to300, fbs: commissionRates.rates.fbs.from100to300, rfbs: null, priceRange: [100, 300] },
                      { label: "300–500 ₽", fbo: commissionRates.rates.fbo.from300to500, fboFresh: commissionRates.rates.fboFresh.over300, fbs: commissionRates.rates.fbs.over300, rfbs: null, priceRange: [300, 500] },
                      { label: "500–1500 ₽", fbo: commissionRates.rates.fbo.from500to1500, fboFresh: null, fbs: null, rfbs: null, priceRange: [500, 1500] },
                      { label: "свыше 1500 ₽", fbo: commissionRates.rates.fbo.over1500, fboFresh: null, fbs: null, rfbs: null, priceRange: [1500, Infinity] },
                    ].map((row, idx) => {
                      const priceNum = parseFloat(price.replace(/\s/g, ""));
                      const isActive = !isNaN(priceNum) && priceNum > 0 && priceNum > row.priceRange[0] && priceNum <= row.priceRange[1];
                      // Исключение: для первого диапазона 0-100
                      const isActiveFirst = idx === 0 && !isNaN(priceNum) && priceNum > 0 && priceNum <= 100;
                      const highlighted = isActive || isActiveFirst;

                      return (
                        <tr
                          key={idx}
                          className={`border-b last:border-0 transition-colors ${
                            highlighted
                              ? "bg-yellow-50 dark:bg-yellow-950/20 font-semibold"
                              : "hover:bg-muted/20"
                          }`}
                        >
                          <td className="py-1.5 px-2">
                            {row.label}
                            {highlighted && <span className="ml-1 text-yellow-600">●</span>}
                          </td>
                          <td className="text-center py-1.5 px-2">{fmtPct(row.fbo)}</td>
                          <td className="text-center py-1.5 px-2">{fmtPct(row.fboFresh)}</td>
                          <td className="text-center py-1.5 px-2">{fmtPct(row.fbs)}</td>
                          <td className="text-center py-1.5 px-2">{fmtPct(row.rfbs)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Цена и вес */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Цена, ₽</Label>
              <Input
                id="price"
                type="text"
                value={price ? formatNumber(price) : ""}
                onChange={(e) => handlePriceChange(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight">Вес, кг</Label>
              <Input
                id="weight"
                type="number"
                step="0.01"
                min="0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Габариты/Объём */}
          <div className="space-y-2">
            <Label>Габариты/Объём</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={dimensionMode === "dimensions" ? "default" : "outline"}
                onClick={() => setDimensionMode("dimensions")}
                className="flex-1"
              >
                Габариты
              </Button>
              <Button
                type="button"
                variant={dimensionMode === "volume" ? "default" : "outline"}
                onClick={() => setDimensionMode("volume")}
                className="flex-1"
              >
                Объём
              </Button>
            </div>

            {dimensionMode === "dimensions" ? (
              <div className="grid grid-cols-3 gap-4 mt-2">
                <div className="space-y-2">
                  <Label htmlFor="length">Длина, см</Label>
                  <Input
                    id="length"
                    type="number"
                    step="0.1"
                    min="0"
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    placeholder="0.0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="width">Ширина, см</Label>
                  <Input
                    id="width"
                    type="number"
                    step="0.1"
                    min="0"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                    placeholder="0.0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="height">Высота, см</Label>
                  <Input
                    id="height"
                    type="number"
                    step="0.1"
                    min="0"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    placeholder="0.0"
                  />
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <Label htmlFor="volume">Объём, л</Label>
                <Input
                  id="volume"
                  type="number"
                  step="0.001"
                  min="0"
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  placeholder="0.000"
                />
              </div>
            )}

            {calculatedVolume !== null && dimensionMode === "dimensions" && (
              <p className="text-sm text-muted-foreground mt-2">
                Объём товара: {calculatedVolume.toFixed(3)} л
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Параметры отгрузки */}
      <Card>
        <CardHeader>
          <CardTitle>Параметры отгрузки</CardTitle>
          <CardDescription>
            Только для продажи по FBS. Для FBO считаем автоматически
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Метод отгрузки */}
          <div className="space-y-2">
            <Label>Метод отгрузки</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={shipmentMethod === "pickup" ? "default" : "outline"}
                onClick={() => setShipmentMethod("pickup")}
                className="flex-1"
              >
                Отгрузка в пункте приёма
              </Button>
              <Button
                type="button"
                variant={shipmentMethod === "courier" ? "default" : "outline"}
                onClick={() => setShipmentMethod("courier")}
                className="flex-1"
              >
                Отгрузка курьеру Ozon
              </Button>
            </div>
          </div>

          {/* Тип пункта приёма */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="pickupPointType">Тип пункта приёма</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Выберите тип пункта приёма: ПВЗ/ППЗ или СЦ (сортировочный центр)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select value={pickupPointType} onValueChange={setPickupPointType}>
              <SelectTrigger id="pickupPointType">
                <SelectValue placeholder="Выберите тип пункта приёма" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pvz-ppz">ПВЗ/ППЗ</SelectItem>
                <SelectItem value="sc">СЦ - сортировочный центр</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Тип приёмки */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="acceptanceType">Тип приёмки</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Выберите тип приёмки товара в пункте приёма</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select value={acceptanceType} onValueChange={setAcceptanceType}>
              <SelectTrigger id="acceptanceType">
                <SelectValue placeholder="Выберите тип приёмки" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Сотрудник</SelectItem>
                <SelectItem value="self">Самоприёмка</SelectItem>
                <SelectItem value="trust">Доверительная приёмка</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Доставка до места выдачи */}
          <div className="space-y-2">
            <Label htmlFor="deliveryToPickupPoint">Доставка до места выдачи, ₽</Label>
            <Input
              id="deliveryToPickupPoint"
              type="number"
              step="0.01"
              min="0"
              value={deliveryToPickupPoint}
              onChange={(e) => setDeliveryToPickupPoint(e.target.value)}
              placeholder="25"
            />
            <p className="text-xs text-muted-foreground">
              Стоимость доставки товара до места выдачи (ПВЗ/ППЗ/СЦ). Прибавляется к расчёту FBS всегда.
            </p>
          </div>

          {/* Блок актуальных тарифов отгрузки */}
          {pickupPointType && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <h4 className="text-sm font-semibold">Актуальные тарифы FBS</h4>

              {/* Тариф за отправление */}
              {(() => {
                const groupName = pickupPointType === "pvz-ppz" ? "ПВЗ/ППЗ" : "СЦ";
                const dispatchTariff = dispatchTariffs.find(
                  (t) => t.shipmentPointGroup === groupName
                );
                return dispatchTariff ? (
                  <div className="flex items-center justify-between bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 px-3 py-2 rounded-md">
                    <span className="text-sm">Тариф за отправление ({groupName})</span>
                    <span className="text-sm font-bold">{dispatchTariff.dispatchFee} ₽</span>
                  </div>
                ) : null;
              })()}

              {/* Тарифы обработки */}
              {processingTariffs.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">Тарифы за обработку отправления:</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Тип точки</th>
                          <th className="text-right py-1.5 px-2 font-medium text-blue-600">Ozon, ₽</th>
                          <th className="text-right py-1.5 px-2 font-medium text-green-600">Партнёры, ₽</th>
                        </tr>
                      </thead>
                      <tbody>
                        {processingTariffs.map((t, idx) => {
                          // Определяем, подходит ли эта строка к выбранному типу пункта
                          const isPvz = pickupPointType === "pvz-ppz";
                          const isSc = pickupPointType === "sc";
                          const pointLower = t.shipmentPointType.toLowerCase();
                          const matchesPvz = pointLower.includes("пвз") || pointLower.includes("ппз");
                          const matchesSc = pointLower.includes("сц");
                          const isRelevant = (isPvz && matchesPvz) || (isSc && matchesSc);

                          if (!isRelevant) return null;

                          return (
                            <tr
                              key={idx}
                              className="border-b last:border-0 hover:bg-muted/20"
                            >
                              <td className="py-1.5 px-2">{t.shipmentPointType}</td>
                              <td className="text-right py-1.5 px-2 font-medium">{t.ozonProcessingFee} ₽</td>
                              <td className="text-right py-1.5 px-2 font-medium">{t.partnerProcessingFee} ₽</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Итого при выборе приёмки */}
              {acceptanceType && (() => {
                // Тарифы обработки отправлений исключены из расчёта
                // Используем только тарифы обработки из таблицы ProcessingTariff
                
                // Для расчёта берём первое подходящее значение обработки
                const isPvz = pickupPointType === "pvz-ppz";
                const relevantProcessing = processingTariffs.filter((t) => {
                  const pl = t.shipmentPointType.toLowerCase();
                  return isPvz ? (pl.includes("пвз") || pl.includes("ппз")) : pl.includes("сц");
                });

                // Выбираем первый подходящий тариф обработки
                const firstProcessing = relevantProcessing.length > 0 ? relevantProcessing[0] : null;

                // Тариф обработки по новой логике:
                // ПВЗ/ППЗ - берём ozonProcessingFee (независимо от типа приёмки)
                // СЦ + сотрудник - берём ozonProcessingFee
                // СЦ + самоприёмка/доверительная - берём ozonProcessingFee / 2
                let processingFee = 0;
                if (firstProcessing) {
                  if (isPvz) {
                    // ПВЗ/ППЗ - берём тариф из таблицы (независимо от типа приёмки)
                    processingFee = firstProcessing.ozonProcessingFee;
                  } else {
                    // СЦ - зависит от типа приёмки
                    if (acceptanceType === "employee") {
                      // СЦ + сотрудник - берём тариф из таблицы
                      processingFee = firstProcessing.ozonProcessingFee;
                    } else if (acceptanceType === "self" || acceptanceType === "trust") {
                      // СЦ + самоприёмка или доверительная - берём тариф из таблицы и делим на 2
                      processingFee = firstProcessing.ozonProcessingFee / 2;
                    }
                  }
                }

                const totalFbsFee = processingFee;

                return (
                  <div className="border-t pt-3 mt-2 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Обработка ({acceptanceType === "employee" ? "сотрудник Ozon" : acceptanceType === "self" ? "самоприёмка" : "доверительная"})
                      </span>
                      <span>{processingFee.toFixed(2)} ₽</span>
                    </div>
                    <div className="flex items-center justify-between text-sm font-bold border-t pt-2">
                      <span>Итого тариф FBS за отгрузку</span>
                      <span className="text-lg">{totalFbsFee.toFixed(2)} ₽</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Себестоимость */}
      <Card>
        <CardHeader>
          <CardTitle>Себестоимость</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={costMode} onValueChange={(v) => setCostMode(v as "single" | "batch")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="single">Себестоимость товара</TabsTrigger>
              <TabsTrigger value="batch">Себестоимость партии</TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="productCost">Себестоимость товара, ₽ за шт</Label>
                <Input
                  id="productCost"
                  type="text"
                  value={productCost ? formatNumber(productCost) : ""}
                  onChange={(e) => handleProductCostChange(e.target.value)}
                  placeholder="0"
                  className="text-lg font-semibold"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="otherExpenses">Прочие затраты, ₽ на шт</Label>
                <Input
                  id="otherExpenses"
                  type="number"
                  step="0.01"
                  min="0"
                  value={otherExpenses}
                  onChange={(e) => setOtherExpenses(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  Не связанные с товаром напрямую. Например, маркетинг или административные расходы
                </p>
              </div>
            </TabsContent>

            <TabsContent value="batch" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="batchCost">Себестоимость партии, ₽</Label>
                <Input
                  id="batchCost"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="text-lg font-semibold"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="batchQuantity">Количество товаров в партии, шт</Label>
                <Input
                  id="batchQuantity"
                  type="number"
                  step="1"
                  min="1"
                  placeholder="1"
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Кнопка расчёта */}
      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={handleCalculate}
          disabled={isCalculating || !price || !category}
          className="w-full md:w-auto px-12 py-6 text-lg"
        >
          {isCalculating ? (
            <>Считаю...</>
          ) : (
            <>
              <Calculator className="h-5 w-5 mr-2" />
              Рассчитать
            </>
          )}
        </Button>
      </div>

      {/* Ошибка расчёта */}
      {calcError && (
        <Alert variant="destructive">
          <AlertDescription>{calcError}</AlertDescription>
        </Alert>
      )}

      {/* Результаты расчёта */}
      {calcResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Результаты расчёта
              <Badge variant="outline" className="font-normal">
                {calcResult.commission.productType || calcResult.commission.categoryName || "—"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Цена: {fmtMoney(calcResult.price)} · Объём: {calcResult.volumeLiters.toFixed(3)} л · Сегмент: {calcResult.priceBand === "up_to_300" ? "до 300 ₽" : "от 301 ₽"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2">
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Показатель</th>
                    <th className="text-right py-3 px-3 font-bold text-blue-600 min-w-[120px]">FBO</th>
                    <th className="text-right py-3 px-3 font-bold text-green-600 min-w-[120px]">FBS</th>
                    <th className="text-right py-3 px-3 font-bold text-orange-600 min-w-[120px]">RFBS</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Цена продажи */}
                  <tr className="border-b bg-muted/20">
                    <td className="py-2.5 px-3 font-medium">Цена продажи</td>
                    <td className="text-right py-2.5 px-3">{fmtMoney(calcResult.price)}</td>
                    <td className="text-right py-2.5 px-3">{fmtMoney(calcResult.price)}</td>
                    <td className="text-right py-2.5 px-3">{fmtMoney(calcResult.price)}</td>
                  </tr>

                  {/* Комиссия */}
                  <tr className="border-b">
                    <td className="py-2.5 px-3">
                      Комиссия МП
                      <span className="text-xs text-muted-foreground ml-1">
                        ({calcResult.fbo.commissionPct}% / {calcResult.fbs.commissionPct}% / {calcResult.rfbs.commissionPct}%)
                      </span>
                    </td>
                    <td className="text-right py-2.5 px-3 text-red-500">−{fmtMoney(calcResult.fbo.commissionAmount)}</td>
                    <td className="text-right py-2.5 px-3 text-red-500">−{fmtMoney(calcResult.fbs.commissionAmount)}</td>
                    <td className="text-right py-2.5 px-3 text-red-500">−{fmtMoney(calcResult.rfbs.commissionAmount)}</td>
                  </tr>

                  {/* Логистика */}
                  <tr className="border-b">
                    <td className="py-2.5 px-3">
                      Логистика
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground inline ml-1 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p className="text-xs"><strong>FBO:</strong> {calcResult.fbo.shippingDetails}</p>
                            <p className="text-xs mt-1"><strong>FBS:</strong> {calcResult.fbs.shippingDetails}</p>
                            <p className="text-xs mt-1"><strong>RFBS:</strong> {calcResult.rfbs.shippingDetails}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    <td className="text-right py-2.5 px-3 text-red-500">
                      {calcResult.fbo.shippingCost > 0 ? `−${fmtMoney(calcResult.fbo.shippingCost)}` : "—"}
                    </td>
                    <td className="text-right py-2.5 px-3 text-red-500">
                      {calcResult.fbs.shippingCost > 0 ? `−${fmtMoney(calcResult.fbs.shippingCost)}` : "—"}
                    </td>
                    <td className="text-right py-2.5 px-3 text-muted-foreground">
                      своя
                    </td>
                  </tr>

                  {/* Обработка FBS */}
                  <tr className="border-b">
                    <td className="py-2.5 px-3">
                      Обработка + отправление
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground inline ml-1 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p className="text-xs"><strong>FBS:</strong> {calcResult.fbs.processingDetails}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    <td className="text-right py-2.5 px-3 text-muted-foreground">вкл.</td>
                    <td className="text-right py-2.5 px-3 text-red-500">
                      {calcResult.fbs.processingFee > 0 ? `−${fmtMoney(calcResult.fbs.processingFee)}` : "—"}
                    </td>
                    <td className="text-right py-2.5 px-3 text-muted-foreground">—</td>
                  </tr>

                  {/* Доставка до места выдачи */}
                  <tr className="border-b">
                    <td className="py-2.5 px-3">
                      Доставка до места выдачи
                    </td>
                    <td className="text-right py-2.5 px-3 text-muted-foreground">—</td>
                    <td className="text-right py-2.5 px-3 text-red-500">
                      {calcResult.fbs.deliveryToPickupPoint ? `−${fmtMoney(calcResult.fbs.deliveryToPickupPoint)}` : "—"}
                    </td>
                    <td className="text-right py-2.5 px-3 text-muted-foreground">—</td>
                  </tr>

                  {/* Эквайринг */}
                  <tr className="border-b">
                    <td className="py-2.5 px-3">
                      Эквайринг
                      <span className="text-xs text-muted-foreground ml-1">({calcResult.acquiringPct}%)</span>
                    </td>
                    <td className="text-right py-2.5 px-3 text-red-500">−{fmtMoney(calcResult.acquiringFee)}</td>
                    <td className="text-right py-2.5 px-3 text-red-500">−{fmtMoney(calcResult.acquiringFee)}</td>
                    <td className="text-right py-2.5 px-3 text-red-500">−{fmtMoney(calcResult.acquiringFee)}</td>
                  </tr>

                  {/* Себестоимость */}
                  {calcResult.totalCost > 0 && (
                    <tr className="border-b bg-muted/10">
                      <td className="py-2.5 px-3">
                        Себестоимость + расходы
                      </td>
                      <td className="text-right py-2.5 px-3 text-red-500">−{fmtMoney(calcResult.totalCost)}</td>
                      <td className="text-right py-2.5 px-3 text-red-500">−{fmtMoney(calcResult.totalCost)}</td>
                      <td className="text-right py-2.5 px-3 text-red-500">−{fmtMoney(calcResult.totalCost)}</td>
                    </tr>
                  )}

                  {/* Разделитель */}
                  <tr className="border-b-2 border-t-2">
                    <td className="py-2.5 px-3 font-bold">Итого удержания</td>
                    <td className="text-right py-2.5 px-3 font-bold text-red-600">−{fmtMoney(calcResult.fbo.totalFees + calcResult.totalCost)}</td>
                    <td className="text-right py-2.5 px-3 font-bold text-red-600">−{fmtMoney(calcResult.fbs.totalFees + calcResult.totalCost)}</td>
                    <td className="text-right py-2.5 px-3 font-bold text-red-600">−{fmtMoney(calcResult.rfbs.totalFees + calcResult.totalCost)}</td>
                  </tr>

                  {/* Прибыль */}
                  <tr className="bg-muted/30">
                    <td className="py-3 px-3 font-bold text-base">Прибыль</td>
                    <td className={`text-right py-3 px-3 font-bold text-base ${calcResult.fbo.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {calcResult.fbo.profit >= 0 ? "+" : ""}{fmtMoney(calcResult.fbo.profit)}
                    </td>
                    <td className={`text-right py-3 px-3 font-bold text-base ${calcResult.fbs.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {calcResult.fbs.profit >= 0 ? "+" : ""}{fmtMoney(calcResult.fbs.profit)}
                    </td>
                    <td className={`text-right py-3 px-3 font-bold text-base ${calcResult.rfbs.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {calcResult.rfbs.profit >= 0 ? "+" : ""}{fmtMoney(calcResult.rfbs.profit)}
                    </td>
                  </tr>

                  {/* Маржинальность */}
                  <tr>
                    <td className="py-3 px-3 font-medium">Маржинальность</td>
                    <td className="text-right py-3 px-3">
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-bold ${
                        calcResult.fbo.margin >= 20
                          ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400"
                          : calcResult.fbo.margin >= 0
                            ? "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400"
                            : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                      }`}>
                        {calcResult.fbo.margin >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {calcResult.fbo.margin}%
                      </div>
                    </td>
                    <td className="text-right py-3 px-3">
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-bold ${
                        calcResult.fbs.margin >= 20
                          ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400"
                          : calcResult.fbs.margin >= 0
                            ? "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400"
                            : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                      }`}>
                        {calcResult.fbs.margin >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {calcResult.fbs.margin}%
                      </div>
                    </td>
                    <td className="text-right py-3 px-3">
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-bold ${
                        calcResult.rfbs.margin >= 20
                          ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400"
                          : calcResult.rfbs.margin >= 0
                            ? "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400"
                            : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                      }`}>
                        {calcResult.rfbs.margin >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {calcResult.rfbs.margin}%
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Подсказка */}
            <p className="text-xs text-muted-foreground mt-4">
              * Для RFBS стоимость логистики не учитывается — доставку организует продавец самостоятельно.
              Указанная прибыль RFBS не включает расходы на доставку покупателю.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
