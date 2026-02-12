"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

  // Себестоимость
  const [costMode, setCostMode] = useState<"single" | "batch">("single");
  const [productCost, setProductCost] = useState<string>("");
  const [otherExpenses, setOtherExpenses] = useState<string>("");

  // Поиск категорий
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
          `/api/category-commissions/search?q=${encodeURIComponent(productName)}&marketplace=ozon&limit=10`
        );
        const data = await response.json();

        if (data.success && data.data) {
          const options: CategoryOption[] = data.data.map((item: SearchResult) => ({
            value: item.value,
            label: item.label,
            type: item.type,
          }));
          setCategoryOptions(options);

          // Автоматически выбираем первую найденную категорию, если категория ещё не выбрана
          if (!category && options.length > 0) {
            // Приоритет: сначала категории, потом типы товаров
            const categoryOption = options.find((opt) => opt.type === "category");
            if (categoryOption) {
              setCategory(categoryOption.value);
            } else if (options[0]) {
              setCategory(options[0].value);
            }
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

          {/* Категория */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="category">Категория / Тип товара</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Категория и тип товара подбираются автоматически по названию из базы данных комиссий.
                      Вы можете изменить выбор вручную.
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
                          ? "Категория не найдена"
                          : "Выберите категорию или тип товара"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.length > 0 ? (
                  <>
                    {categoryOptions.filter((opt) => opt.type === "category").length > 0 && (
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        Категории
                      </div>
                    )}
                    {categoryOptions
                      .filter((opt) => opt.type === "category")
                      .map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    {categoryOptions.filter((opt) => opt.type === "productType").length > 0 && (
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
                        Типы товаров
                      </div>
                    )}
                    {categoryOptions
                      .filter((opt) => opt.type === "productType")
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
                        : "Ничего не найдено"}
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
    </div>
  );
}
