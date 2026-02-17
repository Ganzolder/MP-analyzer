"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, Calculator, TrendingUp, TrendingDown, Target } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface FulfillmentResult {
  commissionPct: number;
  commissionAmount: number;
  shippingCost: number;
  shippingDetails: string;
  lastMileFee?: number;
  processingFee: number;
  processingDetails: string;
  dispatchFee?: number;
  dispatchDetails?: string;
  deliveryToPickupPoint?: number;
  acquiringFee: number;
  totalFees: number;
  profit: number;
  margin: number; // маржинальность (от цены)
  markup: number; // наценка (от себестоимости)
}

interface ReverseCalcResult {
  targetMargin: number;
  marginMode: string; // "markup" | "margin"
  fbo: { requiredPrice: number; currentMarkupFromCost: number };
  fbs: { requiredPrice: number; currentMarkupFromCost: number };
  rfbs: { requiredPrice: number; currentMarkupFromCost: number };
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
  reverseCalculation?: ReverseCalcResult | null;
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

interface DispatchTariff {
  shipmentPointGroup: string;
  shipmentMethod: string | null;
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
  const [rfbsLogisticsCost, setRfbsLogisticsCost] = useState<string>("");

  // Тарифы из настроек (загружаются из БД)
  const [tariffLastMileFee, setTariffLastMileFee] = useState<number>(25);
  const [tariffDeliveryToPickupFee, setTariffDeliveryToPickupFee] = useState<number>(25);

  // Себестоимость
  const [costMode, setCostMode] = useState<"single" | "batch">("single");
  const [productCost, setProductCost] = useState<string>("");
  const [otherExpenses, setOtherExpenses] = useState<string>("");

  // Желаемая наценка / маржинальность (опциональное поле)
  const [targetMargin, setTargetMargin] = useState<string>("");
  const [marginMode, setMarginMode] = useState<"markup" | "margin">("markup");

  // Налоговый режим
  const [taxRegime, setTaxRegime] = useState<string>("none");

  // Поиск категорий
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Комиссии
  const [commissionRates, setCommissionRates] = useState<CommissionRates | null>(null);
  const [isLoadingRates, setIsLoadingRates] = useState(false);

  // Тарифы за отправление
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

    const timeoutId = setTimeout(() => {
      searchCategories();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [productName, category]);

  // Дефолтные тарифы за отправление
  const DEFAULT_DISPATCH_TARIFFS: DispatchTariff[] = [
    { shipmentPointGroup: "ПВЗ/ППЗ", shipmentMethod: "standard", dispatchFee: 30 },
    { shipmentPointGroup: "ПВЗ/ППЗ", shipmentMethod: "self", dispatchFee: 30 },
    { shipmentPointGroup: "ПВЗ/ППЗ", shipmentMethod: "trust", dispatchFee: 30 },
    { shipmentPointGroup: "СЦ", shipmentMethod: "standard", dispatchFee: 20 },
    { shipmentPointGroup: "СЦ", shipmentMethod: "self", dispatchFee: 10 },
    { shipmentPointGroup: "СЦ", shipmentMethod: "trust", dispatchFee: 10 },
  ];

  // Загрузка тарифов за отправление и настроек при монтировании
  useEffect(() => {
    const loadTariffs = async () => {
      try {
        const [dispRes, acqRes] = await Promise.all([
          fetch("/api/dispatch-tariffs?marketplace=ozon"),
          fetch("/api/acquiring-settings?marketplace=ozon"),
        ]);
        const dispData = await dispRes.json();
        if (dispData.success && dispData.data && dispData.data.length > 0) {
          setDispatchTariffs(dispData.data);
        } else {
          setDispatchTariffs(DEFAULT_DISPATCH_TARIFFS);
        }
        const acqData = await acqRes.json();
        if (acqData.success && acqData.data) {
          if (typeof acqData.data.lastMileFee === "number") {
            setTariffLastMileFee(acqData.data.lastMileFee);
          }
          if (typeof acqData.data.deliveryToPickupFee === "number") {
            setTariffDeliveryToPickupFee(acqData.data.deliveryToPickupFee);
          }
        }
      } catch (error) {
        console.error("Ошибка при загрузке тарифов:", error);
        setDispatchTariffs(DEFAULT_DISPATCH_TARIFFS);
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
        const vol = (l * w * h) / 1000;
        setCalculatedVolume(vol);
      } else {
        setCalculatedVolume(null);
      }
    } else {
      setCalculatedVolume(null);
    }
  }, [dimensionMode, length, width, height]);

  const fmtPct = (v: number | null): string => {
    if (v === null || v === undefined) return "—";
    return `${Math.round(v)}%`;
  };

  const formatNumber = (value: string): string => {
    if (!value) return "";
    const num = parseFloat(value.replace(/\s/g, ""));
    if (isNaN(num)) return value;
    return num.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const handlePriceChange = (value: string) => {
    const cleaned = value.replace(/\s/g, "");
    setPrice(cleaned);
  };

  const handleProductCostChange = (value: string) => {
    const cleaned = value.replace(/\s/g, "");
    setProductCost(cleaned);
  };

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
    const vol = getVolumeLiters();
    if (vol <= 0) {
      setCalcError("Укажите объём или габариты товара");
      return;
    }

    const priceNum = parseFloat(price.replace(/\s/g, ""));
    if (!priceNum || priceNum <= 0) {
      setCalcError("Укажите цену товара");
      return;
    }

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
      const requestBody: any = {
        marketplace: "ozon",
        categoryType: catType || undefined,
        categoryValue: catValue || undefined,
        price: priceNum,
        volumeLiters: vol,
        pickupPointType: pickupPointType || undefined,
        acceptanceType: acceptanceType || undefined,
        rfbsLogisticsCost: parseFloat(rfbsLogisticsCost) || 0,
        productCost: parseFloat(productCost) || 0,
        otherExpenses: parseFloat(otherExpenses) || 0,
      };

      // Если указана желаемая наценка/маржинальность — добавляем
      const marginNum = parseFloat(targetMargin.replace(/\s/g, ""));
      if (!isNaN(marginNum) && marginNum >= 0) {
        requestBody.targetMargin = marginNum;
        requestBody.marginMode = marginMode;
      }

      const response = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
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

  const fmtMoney = (v: number): string => {
    return v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₽";
  };

  // ─── Расчёт ВСЕХ налоговых режимов для одного типа отгрузки ──
  interface TaxCalc {
    usnTax: number;
    vatPayable: number;
    profitTax: number;
    totalTax: number;
    netProfit: number;
    netMargin: number; // маржинальность (от цены)
  }

  interface AllTaxCalcs {
    none: TaxCalc;
    usn6: TaxCalc;
    usn15: TaxCalc;
    nds22: TaxCalc;
  }

  const calculateAllTaxes = (fulfillmentType: "fbo" | "fbs" | "rfbs"): AllTaxCalcs => {
    const empty: TaxCalc = { usnTax: 0, vatPayable: 0, profitTax: 0, totalTax: 0, netProfit: 0, netMargin: 0 };
    if (!calcResult) return { none: empty, usn6: empty, usn15: empty, nds22: empty };

    const fulfillment = calcResult[fulfillmentType];
    const profit = fulfillment.profit;
    const accrual = calcResult.price - fulfillment.totalFees;
    const cost = calcResult.productCost || 0;
    const otherExp = calcResult.otherExpenses || 0;
    const price = calcResult.price;

    const mkResult = (totalTax: number, extra: Partial<TaxCalc> = {}): TaxCalc => {
      const netProfit = Math.round((profit - totalTax) * 100) / 100;
      const netMargin = price > 0 ? Math.round(netProfit / price * 10000) / 100 : 0;
      return { usnTax: 0, vatPayable: 0, profitTax: 0, totalTax, netProfit, netMargin, ...extra };
    };

    // Без налога
    const none = mkResult(0);

    // УСН 6%
    const usn6Tax = Math.round(accrual * 6 / 100 * 100) / 100;
    const usn6 = mkResult(usn6Tax, { usnTax: usn6Tax });

    // УСН 15%
    const usn15Base = accrual - cost - otherExp;
    const usn15Tax = usn15Base > 0 ? Math.round(usn15Base * 15 / 100 * 100) / 100 : 0;
    const usn15 = mkResult(usn15Tax, { usnTax: usn15Tax });

    // НДС 22% + Налог на прибыль 25%
    const vatPayable = Math.round((accrual * 22 / 122 - cost * 22 / 122) * 100) / 100;
    const incomeNoVat = accrual * 100 / 122;
    const expensesNoVat = cost * 100 / 122 + otherExp;
    const profitTaxBase = incomeNoVat - expensesNoVat;
    const profitTax = profitTaxBase > 0 ? Math.round(profitTaxBase * 25 / 100 * 100) / 100 : 0;
    const nds22Total = (vatPayable > 0 ? vatPayable : 0) + profitTax;
    const nds22 = mkResult(nds22Total, { vatPayable, profitTax });

    return { none, usn6, usn15, nds22 };
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
                    {(() => {
                      const r = commissionRates.rates;
                      // Каскадное заполнение: null → берём последнее известное значение
                      const fboVals = [r.fbo.upTo100, r.fbo.from100to300, r.fbo.from300to500, r.fbo.from500to1500, r.fbo.over1500];
                      const fboFreshVals = [r.fboFresh.upTo100, r.fboFresh.from100to300, r.fboFresh.over300, null, null];
                      const fbsVals = [r.fbs.upTo100, r.fbs.from100to300, r.fbs.over300, null, null];
                      const rfbsVals = [r.rfbs, null, null, null, null];

                      const cascade = (arr: (number | null | undefined)[]) => {
                        const result: (number | null)[] = [];
                        let last: number | null = null;
                        for (const v of arr) {
                          if (v !== null && v !== undefined) last = v;
                          result.push(last);
                        }
                        return result;
                      };

                      const fbo = cascade(fboVals);
                      const fboFresh = cascade(fboFreshVals);
                      const fbs = cascade(fbsVals);
                      const rfbs = cascade(rfbsVals);

                      return [
                        { label: "до 100 ₽", fbo: fbo[0], fboFresh: fboFresh[0], fbs: fbs[0], rfbs: rfbs[0], priceRange: [0, 100] },
                        { label: "100–300 ₽", fbo: fbo[1], fboFresh: fboFresh[1], fbs: fbs[1], rfbs: rfbs[1], priceRange: [100, 300] },
                        { label: "300–500 ₽", fbo: fbo[2], fboFresh: fboFresh[2], fbs: fbs[2], rfbs: rfbs[2], priceRange: [300, 500] },
                        { label: "500–1500 ₽", fbo: fbo[3], fboFresh: fboFresh[3], fbs: fbs[3], rfbs: rfbs[3], priceRange: [500, 1500] },
                        { label: "свыше 1500 ₽", fbo: fbo[4], fboFresh: fboFresh[4], fbs: fbs[4], rfbs: rfbs[4], priceRange: [1500, Infinity] },
                      ];
                    })().map((row, idx) => {
                      const priceNum = parseFloat(price.replace(/\s/g, ""));
                      const isActive = !isNaN(priceNum) && priceNum > 0 && priceNum > row.priceRange[0] && priceNum <= row.priceRange[1];
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

          {/* Логистика RFBS */}
          <div className="space-y-2">
            <Label htmlFor="rfbsLogisticsCost">Стоимость логистики (RFBS), ₽</Label>
            <Input
              id="rfbsLogisticsCost"
              type="number"
              step="0.01"
              min="0"
              value={rfbsLogisticsCost}
              onChange={(e) => setRfbsLogisticsCost(e.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">
              Стоимость доставки товара для RFBS (доставка продавцом). Учитывается только в расчёте RFBS.
            </p>
          </div>

          {/* Тарифы из настроек (только чтение) */}
          <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-1">
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

          {/* Блок актуальных тарифов отгрузки */}
          {pickupPointType && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <h4 className="text-sm font-semibold">Тариф за отправление FBS</h4>

              {(() => {
                const groupName = pickupPointType === "pvz-ppz" ? "ПВЗ/ППЗ" : "СЦ";
                
                let sm = "standard";
                if (acceptanceType === "self") sm = "self";
                else if (acceptanceType === "trust") sm = "trust";
                
                const dispatchTariff = dispatchTariffs.find(
                  (t) => t.shipmentPointGroup === groupName && t.shipmentMethod === sm
                ) || dispatchTariffs.find(
                  (t) => t.shipmentPointGroup === groupName && t.shipmentMethod === null
                ) || dispatchTariffs.find(
                  (t) => t.shipmentPointGroup === groupName
                );
                
                const methodName = acceptanceType === "self" ? "Самоприёмка" 
                  : acceptanceType === "trust" ? "Доверительная приёмка"
                  : "Сотрудник (стандартная отгрузка)";
                
                const fee = dispatchTariff?.dispatchFee ?? 0;

                return (
                  <div className="flex items-center justify-between bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 px-3 py-2 rounded-md">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">Тариф за отправление</span>
                      <span className="text-xs text-purple-600 dark:text-purple-400">
                        {groupName} • {methodName}
                      </span>
                    </div>
                    <span className="text-lg font-bold">{fee} ₽</span>
                  </div>
                );
              })()}

              {/* Мини-таблица всех тарифов для данного типа точки */}
              {(() => {
                const groupName = pickupPointType === "pvz-ppz" ? "ПВЗ/ППЗ" : "СЦ";
                const methods = [
                  { key: "standard", label: "Сотрудник" },
                  { key: "self", label: "Самоприёмка" },
                  { key: "trust", label: "Доверительная" },
                ];
                
                return (
                  <div className="text-xs">
                    <p className="text-muted-foreground font-medium mb-1">Все тарифы для {groupName}:</p>
                    <div className="grid grid-cols-3 gap-2">
                      {methods.map((m) => {
                        const tariff = dispatchTariffs.find(
                          (t) => t.shipmentPointGroup === groupName && t.shipmentMethod === m.key
                        ) || dispatchTariffs.find(
                          (t) => t.shipmentPointGroup === groupName && t.shipmentMethod === null
                        ) || dispatchTariffs.find(
                          (t) => t.shipmentPointGroup === groupName
                        );
                        const isActive = (acceptanceType === m.key) || (!acceptanceType && m.key === "standard");
                        return (
                          <div 
                            key={m.key} 
                            className={`rounded px-2 py-1 text-center ${isActive ? "bg-purple-100 dark:bg-purple-900/40 font-bold" : "bg-muted/50"}`}
                          >
                            <div className="text-muted-foreground">{m.label}</div>
                            <div className={isActive ? "text-purple-700 dark:text-purple-300" : ""}>{tariff?.dispatchFee ?? "—"} ₽</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Себестоимость и наценка / маржинальность */}
      <Card>
        <CardHeader>
          <CardTitle>Себестоимость и ценообразование</CardTitle>
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

          {/* Налоговый режим */}
          <div className="rounded-lg border bg-slate-50/50 dark:bg-slate-950/20 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="taxRegime" className="text-sm font-semibold">
                Налоговый режим
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="text-xs">
                      <strong>Без налога (0%)</strong> — расчёт без учёта налогов.<br />
                      <strong>УСН Доходы (6%)</strong> — 6% от начислений Озон (Цена − все сборы).<br />
                      <strong>УСН Доходы−Расходы (15%)</strong> — 15% от (начисления − себестоимость − прочие расходы).<br />
                      <strong>НДС 22%</strong> — НДС к уплате + налог на прибыль 25%.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select value={taxRegime} onValueChange={setTaxRegime}>
              <SelectTrigger id="taxRegime" className="bg-white dark:bg-background">
                <SelectValue placeholder="Выберите налоговый режим" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без налога (0%)</SelectItem>
                <SelectItem value="usn6">УСН Доходы (6%)</SelectItem>
                <SelectItem value="usn15">УСН Доходы−Расходы (15%)</SelectItem>
                <SelectItem value="nds22">НДС 22% + Налог на прибыль 25%</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Необязательное поле. Налоги учитываются при расчёте итоговой прибыли.
            </p>
          </div>

          {/* Желаемая наценка / маржинальность */}
          <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-amber-600" />
              <Label className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Целевой расчёт цены
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      Если заполнено — калькулятор покажет рекомендуемую цену для каждого типа
                      отгрузки, при которой ваш показатель будет равен указанному %.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Переключатель режима */}
            <Select value={marginMode} onValueChange={(v) => setMarginMode(v as "markup" | "margin")}>
              <SelectTrigger className="bg-white dark:bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="markup">Наценка — (Цена − Себестоимость) / Себестоимость × 100%</SelectItem>
                <SelectItem value="margin">Маржинальность — (Цена − Себестоимость) / Цена × 100%</SelectItem>
              </SelectContent>
            </Select>

            <Input
              id="targetMargin"
              type="text"
              value={targetMargin ? formatNumber(targetMargin) : ""}
              onChange={(e) => {
                const val = e.target.value.replace(/\s/g, "");
                if (val === "" || /^\d*\.?\d*$/.test(val)) {
                  setTargetMargin(val);
                }
              }}
              placeholder="Например: 30"
              className="bg-white dark:bg-background"
            />
            <p className="text-xs text-muted-foreground">
              {marginMode === "markup"
                ? "Наценка рассчитывается от себестоимости: какой % добавить сверх себестоимости."
                : "Маржинальность рассчитывается от цены: какую долю цены составляет прибыль."}
              {" "}Необязательное поле. Если указано — в результатах появится строка с рекомендуемой ценой.
            </p>
          </div>
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
                    <td className="text-right py-2.5 px-3 text-red-500">
                      {calcResult.rfbs.shippingCost > 0 ? `−${fmtMoney(calcResult.rfbs.shippingCost)}` : "—"}
                    </td>
                  </tr>

                  {/* Последняя миля FBO */}
                  <tr className="border-b">
                    <td className="py-2.5 px-3">
                      Последняя миля (FBO)
                    </td>
                    <td className="text-right py-2.5 px-3 text-red-500">
                      {calcResult.fbo.lastMileFee ? `−${fmtMoney(calcResult.fbo.lastMileFee)}` : "—"}
                    </td>
                    <td className="text-right py-2.5 px-3 text-muted-foreground">—</td>
                    <td className="text-right py-2.5 px-3 text-muted-foreground">—</td>
                  </tr>

                  {/* Тариф за отправление FBS */}
                  {calcResult.fbs.dispatchFee !== undefined && calcResult.fbs.dispatchFee > 0 && (
                    <tr className="border-b">
                      <td className="py-2.5 px-3">
                        Тариф за отправление
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 text-muted-foreground inline ml-1 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs">
                              <p className="text-xs">{calcResult.fbs.dispatchDetails || "Тариф за отправление"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="text-right py-2.5 px-3 text-muted-foreground">—</td>
                      <td className="text-right py-2.5 px-3 text-red-500">−{fmtMoney(calcResult.fbs.dispatchFee)}</td>
                      <td className="text-right py-2.5 px-3 text-muted-foreground">—</td>
                    </tr>
                  )}

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

                  {/* Итого удержания (без себестоимости) */}
                  <tr className="border-b-2 border-t-2">
                    <td className="py-2.5 px-3 font-bold">Итого удержания</td>
                    <td className="text-right py-2.5 px-3 font-bold text-red-600">−{fmtMoney(calcResult.fbo.totalFees)}</td>
                    <td className="text-right py-2.5 px-3 font-bold text-red-600">−{fmtMoney(calcResult.fbs.totalFees)}</td>
                    <td className="text-right py-2.5 px-3 font-bold text-red-600">−{fmtMoney(calcResult.rfbs.totalFees)}</td>
                  </tr>

                  {/* Сумма к начислению */}
                  <tr className="border-b-2 bg-emerald-50/40 dark:bg-emerald-950/20">
                    <td className="py-2.5 px-3 font-bold">
                      Сумма к начислению
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground inline ml-1 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p className="text-xs">Цена продажи минус все удержания маркетплейса (комиссия, логистика, обработка, эквайринг и т.д.)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    <td className="text-right py-2.5 px-3 font-bold text-emerald-600">{fmtMoney(calcResult.price - calcResult.fbo.totalFees)}</td>
                    <td className="text-right py-2.5 px-3 font-bold text-emerald-600">{fmtMoney(calcResult.price - calcResult.fbs.totalFees)}</td>
                    <td className="text-right py-2.5 px-3 font-bold text-emerald-600">{fmtMoney(calcResult.price - calcResult.rfbs.totalFees)}</td>
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

                  {/* Прибыль до налогов */}
                  <tr className="bg-muted/10">
                    <td className="py-3 px-3 font-bold text-base">
                      Прибыль до налогов
                    </td>
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

                  {/* ═══ СРАВНЕНИЕ ВСЕХ НАЛОГОВЫХ РЕЖИМОВ ═══ */}
                  {(() => {
                    const fboAll = calculateAllTaxes("fbo");
                    const fbsAll = calculateAllTaxes("fbs");
                    const rfbsAll = calculateAllTaxes("rfbs");

                    const regimes: { key: string; label: string; sublabel: string }[] = [
                      { key: "none", label: "Без налога", sublabel: "0%" },
                      { key: "usn6", label: "УСН Доходы", sublabel: "6% от начислений" },
                      { key: "usn15", label: "УСН Доходы−Расходы", sublabel: "15%" },
                      { key: "nds22", label: "НДС 22% + Прибыль 25%", sublabel: "ОСНО" },
                    ];

                    // Находим лучший режим (максимальная чистая прибыль для FBO)
                    const bestRegime = regimes.reduce((best, r) => {
                      const profit = fboAll[r.key as keyof AllTaxCalcs].netProfit;
                      return profit > fboAll[best as keyof AllTaxCalcs].netProfit ? r.key : best;
                    }, "none");

                    return (
                      <>
                        {/* Заголовок секции */}
                        <tr className="border-t-2">
                          <td colSpan={4} className="py-2 px-3 bg-slate-100/60 dark:bg-slate-900/30">
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                              <span>Сравнение налоговых режимов</span>
                              <span className="text-xs font-normal text-muted-foreground">
                                (выбранный: {regimes.find(r => r.key === taxRegime)?.label || "Без налога"})
                              </span>
                            </div>
                          </td>
                        </tr>

                        {regimes.map((regime) => {
                          const isSelected = taxRegime === regime.key;
                          const fbo = fboAll[regime.key as keyof AllTaxCalcs];
                          const fbs = fbsAll[regime.key as keyof AllTaxCalcs];
                          const rfbs = rfbsAll[regime.key as keyof AllTaxCalcs];
                          const isBest = regime.key === bestRegime;

                          return (
                            <tr
                              key={regime.key}
                              className={`border-b cursor-pointer transition-colors ${
                                isSelected
                                  ? "bg-amber-50/60 dark:bg-amber-950/20 ring-1 ring-inset ring-amber-300 dark:ring-amber-700"
                                  : "hover:bg-muted/20"
                              }`}
                              onClick={() => setTaxRegime(regime.key)}
                              title={`Нажмите, чтобы выбрать «${regime.label}»`}
                            >
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-2">
                                  {/* Радио-индикатор */}
                                  <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                    isSelected ? "border-amber-500 bg-amber-500" : "border-muted-foreground/40"
                                  }`}>
                                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                  </div>
                                  <div>
                                    <span className={`text-sm ${isSelected ? "font-bold" : "font-medium"}`}>
                                      {regime.label}
                                    </span>
                                    <span className="text-xs text-muted-foreground ml-1.5">
                                      {regime.sublabel}
                                    </span>
                                    {isBest && regime.key !== "none" && (
                                      <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 text-green-600 border-green-300">
                                        выгоднее
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                {/* Детализация для НДС */}
                                {regime.key === "nds22" && fbo.totalTax > 0 && (
                                  <div className="text-[10px] text-muted-foreground ml-5.5 mt-0.5">
                                    НДС: {fmtMoney(fbo.vatPayable)} + Прибыль: {fmtMoney(fbo.profitTax)} (FBO)
                                  </div>
                                )}
                              </td>
                              <td className="text-right py-2 px-3">
                                <div className="space-y-0.5">
                                  <div className={`text-sm ${isSelected ? "font-bold" : "font-medium"} ${fbo.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                    {fbo.netProfit >= 0 ? "+" : ""}{fmtMoney(fbo.netProfit)}
                                  </div>
                                  {fbo.totalTax > 0 && (
                                    <div className="text-[10px] text-orange-500">−{fmtMoney(fbo.totalTax)}</div>
                                  )}
                                </div>
                              </td>
                              <td className="text-right py-2 px-3">
                                <div className="space-y-0.5">
                                  <div className={`text-sm ${isSelected ? "font-bold" : "font-medium"} ${fbs.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                    {fbs.netProfit >= 0 ? "+" : ""}{fmtMoney(fbs.netProfit)}
                                  </div>
                                  {fbs.totalTax > 0 && (
                                    <div className="text-[10px] text-orange-500">−{fmtMoney(fbs.totalTax)}</div>
                                  )}
                                </div>
                              </td>
                              <td className="text-right py-2 px-3">
                                <div className="space-y-0.5">
                                  <div className={`text-sm ${isSelected ? "font-bold" : "font-medium"} ${rfbs.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                    {rfbs.netProfit >= 0 ? "+" : ""}{fmtMoney(rfbs.netProfit)}
                                  </div>
                                  {rfbs.totalTax > 0 && (
                                    <div className="text-[10px] text-orange-500">−{fmtMoney(rfbs.totalTax)}</div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {/* Итоговая строка — выбранный режим */}
                        {(() => {
                          const selected = taxRegime as keyof AllTaxCalcs;
                          const fbo = fboAll[selected];
                          const fbs = fbsAll[selected];
                          const rfbs = rfbsAll[selected];
                          const selectedLabel = regimes.find(r => r.key === taxRegime)?.label || "Без налога";

                          return (
                            <>
                              <tr className="bg-muted/30 border-t-2">
                                <td className="py-3 px-3 font-bold text-base">
                                  Чистая прибыль
                                  <span className="text-xs font-normal text-muted-foreground ml-1">
                                    ({selectedLabel})
                                  </span>
                                </td>
                                <td className={`text-right py-3 px-3 font-bold text-base ${fbo.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {fbo.netProfit >= 0 ? "+" : ""}{fmtMoney(fbo.netProfit)}
                                </td>
                                <td className={`text-right py-3 px-3 font-bold text-base ${fbs.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {fbs.netProfit >= 0 ? "+" : ""}{fmtMoney(fbs.netProfit)}
                                </td>
                                <td className={`text-right py-3 px-3 font-bold text-base ${rfbs.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {rfbs.netProfit >= 0 ? "+" : ""}{fmtMoney(rfbs.netProfit)}
                                </td>
                              </tr>

                              {/* Маржинальность (чистая, от цены) */}
                              <tr className="border-t">
                                <td className="py-3 px-3 font-medium">
                                  Маржинальность
                                  <span className="text-xs text-muted-foreground ml-1">(чистая, от цены)</span>
                                </td>
                                <td className="text-right py-3 px-3">
                                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-bold ${
                                    fbo.netMargin >= 20
                                      ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400"
                                      : fbo.netMargin >= 0
                                        ? "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400"
                                        : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                                  }`}>
                                    {fbo.netMargin >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                                    {fbo.netMargin}%
                                  </div>
                                </td>
                                <td className="text-right py-3 px-3">
                                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-bold ${
                                    fbs.netMargin >= 20
                                      ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400"
                                      : fbs.netMargin >= 0
                                        ? "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400"
                                        : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                                  }`}>
                                    {fbs.netMargin >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                                    {fbs.netMargin}%
                                  </div>
                                </td>
                                <td className="text-right py-3 px-3">
                                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-bold ${
                                    rfbs.netMargin >= 20
                                      ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400"
                                      : rfbs.netMargin >= 0
                                        ? "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400"
                                        : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                                  }`}>
                                    {rfbs.netMargin >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                                    {rfbs.netMargin}%
                                  </div>
                                </td>
                              </tr>
                            </>
                          );
                        })()}
                      </>
                    );
                  })()}

                  {/* Наценка (от себестоимости) */}
                  {calcResult.totalCost > 0 && (
                  <tr className="border-t">
                    <td className="py-3 px-3 font-medium">
                      Наценка
                      <span className="text-xs font-normal text-muted-foreground ml-1">(от себестоимости)</span>
                    </td>
                    <td className="text-right py-3 px-3">
                      <span className={`font-bold ${calcResult.fbo.markup >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {calcResult.fbo.markup}%
                      </span>
                    </td>
                    <td className="text-right py-3 px-3">
                      <span className={`font-bold ${calcResult.fbs.markup >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {calcResult.fbs.markup}%
                      </span>
                    </td>
                    <td className="text-right py-3 px-3">
                      <span className={`font-bold ${calcResult.rfbs.markup >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {calcResult.rfbs.markup}%
                      </span>
                    </td>
                  </tr>
                  )}

                  {/* Наценка от себестоимости (текущая, при обратном расчёте) */}
                  {calcResult.reverseCalculation && (
                    <tr className="border-t">
                      <td className="py-3 px-3 font-medium">
                        Текущая наценка
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 text-muted-foreground inline ml-1 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs">
                                Прибыль / Себестоимость × 100%. 
                                Показывает, какой процент от себестоимости составляет ваша прибыль при текущей цене.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="text-right py-3 px-3">
                        <span className={`font-bold ${calcResult.reverseCalculation.fbo.currentMarkupFromCost >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {calcResult.reverseCalculation.fbo.currentMarkupFromCost}%
                        </span>
                      </td>
                      <td className="text-right py-3 px-3">
                        <span className={`font-bold ${calcResult.reverseCalculation.fbs.currentMarkupFromCost >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {calcResult.reverseCalculation.fbs.currentMarkupFromCost}%
                        </span>
                      </td>
                      <td className="text-right py-3 px-3">
                        <span className={`font-bold ${calcResult.reverseCalculation.rfbs.currentMarkupFromCost >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {calcResult.reverseCalculation.rfbs.currentMarkupFromCost}%
                        </span>
                      </td>
                    </tr>
                  )}

                  {/* Рекомендуемая цена (обратный расчёт) */}
                  {calcResult.reverseCalculation && (
                    <tr className="border-t-2 bg-amber-50/50 dark:bg-amber-950/20">
                      <td className="py-3 px-3 font-bold text-amber-800 dark:text-amber-300">
                        <div className="flex items-center gap-1.5">
                          <Target className="h-4 w-4" />
                          Цена при {calcResult.reverseCalculation.marginMode === "margin" ? "маржинальности" : "наценке"} {calcResult.reverseCalculation.targetMargin}%
                        </div>
                        <span className="text-xs font-normal text-muted-foreground">
                          {calcResult.reverseCalculation.marginMode === "margin" ? "от цены продажи" : "от себестоимости"}
                        </span>
                      </td>
                      <td className="text-right py-3 px-3">
                        <span className="font-bold text-amber-700 dark:text-amber-400 text-base">
                          {fmtMoney(calcResult.reverseCalculation.fbo.requiredPrice)}
                        </span>
                      </td>
                      <td className="text-right py-3 px-3">
                        <span className="font-bold text-amber-700 dark:text-amber-400 text-base">
                          {fmtMoney(calcResult.reverseCalculation.fbs.requiredPrice)}
                        </span>
                      </td>
                      <td className="text-right py-3 px-3">
                        <span className="font-bold text-amber-700 dark:text-amber-400 text-base">
                          {fmtMoney(calcResult.reverseCalculation.rfbs.requiredPrice)}
                        </span>
                      </td>
                    </tr>
                  )}
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
