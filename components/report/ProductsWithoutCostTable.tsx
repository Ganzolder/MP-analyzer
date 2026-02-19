"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, ChevronRight, RotateCcw } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { useExcludedProductsStore } from "@/lib/store/excluded-products-store";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";

interface ProductWithoutCost {
  article?: string;
  sku?: string;
  name: string;
  revenue?: number;
  profit?: number;
  orders?: number;
}

interface ProductsWithoutCostTableProps {
  products: ProductWithoutCost[];
  title?: string;
  onRecalculate?: (excludedSkus: string[]) => void;
}

export function ProductsWithoutCostTable({ products, title = "Товары без себестоимости", onRecalculate }: ProductsWithoutCostTableProps) {
  const [isOpen, setIsOpen] = useState(false); // Изначально свернут
  const [searchQuery, setSearchQuery] = useState("");
  const [minRevenue, setMinRevenue] = useState<string>("");
  const [minProfit, setMinProfit] = useState<string>("");
  const [minOrders, setMinOrders] = useState<string>("");
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [selectedToReturn, setSelectedToReturn] = useState<Set<string>>(new Set()); // Для возврата товаров
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const { toast } = useToast();
  const { excludedSkus, addExcludedSku, removeExcludedSku, clearExcludedSkus } = useExcludedProductsStore();

  // Фильтрация
  const filteredProducts = useMemo(() => {
    let filtered = [...products];

    // Поиск
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name?.toLowerCase().includes(query) ||
          p.article?.toLowerCase().includes(query) ||
          p.sku?.toLowerCase().includes(query)
      );
    }

    // Фильтр по выручке
    if (minRevenue) {
      filtered = filtered.filter((p) => (p.revenue || 0) >= parseFloat(minRevenue));
    }

    // Фильтр по прибыли
    if (minProfit) {
      filtered = filtered.filter((p) => (p.profit || 0) >= parseFloat(minProfit));
    }

    // Фильтр по заказам
    if (minOrders) {
      filtered = filtered.filter((p) => (p.orders || 0) >= parseFloat(minOrders));
    }

    return filtered;
  }, [products, searchQuery, minRevenue, minProfit, minOrders]);

  const resetFilters = () => {
    setSearchQuery("");
    setMinRevenue("");
    setMinProfit("");
    setMinOrders("");
  };

  const handleToggleProduct = (sku: string) => {
    const newSelected = new Set(selectedSkus);
    if (newSelected.has(sku)) {
      newSelected.delete(sku);
    } else {
      newSelected.add(sku);
    }
    setSelectedSkus(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedSkus.size === filteredProducts.length) {
      setSelectedSkus(new Set());
    } else {
      setSelectedSkus(new Set(filteredProducts.map(p => p.sku).filter(Boolean) as string[]));
    }
  };

  const handleExcludeProducts = async () => {
    if (selectedSkus.size === 0) {
      toast({
        title: "Не выбраны товары",
        description: "Выберите товары для исключения из расчётов",
        variant: "destructive",
      });
      return;
    }

    if (!onRecalculate) {
      toast({
        title: "Ошибка",
        description: "Функция пересчёта недоступна",
        variant: "destructive",
      });
      return;
    }

    setIsRecalculating(true);
    try {
      selectedSkus.forEach(sku => addExcludedSku(sku));
      const fullExcluded = useExcludedProductsStore.getState().excludedSkus;
      await onRecalculate(Array.from(fullExcluded));
      toast({
        title: "Товары исключены",
        description: `Исключено товаров: ${selectedSkus.size}`,
      });
      setSelectedSkus(new Set());
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось исключить товары",
        variant: "destructive",
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <Card className="glass border-warning/30">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2">
              <ChevronRight className={cn("h-5 w-5 transition-transform", isOpen && "rotate-90")} />
              <CardTitle>
                {title} ({products.length})
              </CardTitle>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            {/* Поиск и фильтры */}
            <div className="space-y-4 mb-6">
              {/* Поиск */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по названию, артикулу или SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Фильтры */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Выручка от ₽</label>
                  <Input
                    type="number"
                    placeholder="Мин"
                    value={minRevenue}
                    onChange={(e) => setMinRevenue(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Прибыль от ₽</label>
                  <Input
                    type="number"
                    placeholder="Мин"
                    value={minProfit}
                    onChange={(e) => setMinProfit(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Заказы от</label>
                  <Input
                    type="number"
                    placeholder="Мин"
                    value={minOrders}
                    onChange={(e) => setMinOrders(e.target.value)}
                  />
                </div>
              </div>

              {/* Кнопка сброса фильтров */}
              {(searchQuery || minRevenue || minProfit || minOrders) && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Сбросить фильтры
                </Button>
              )}

              {/* Панель выбора товаров для исключения */}
              <div className="flex items-center justify-between gap-4 p-4 bg-muted/30 rounded-lg border">
                <div className="flex items-center gap-4">
                  <Checkbox
                    checked={filteredProducts.length > 0 && selectedSkus.size === filteredProducts.length}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm">
                    Выбрано: {selectedSkus.size} из {filteredProducts.length}
                  </span>
                </div>
                <Button
                  onClick={handleExcludeProducts}
                  disabled={selectedSkus.size === 0 || isRecalculating}
                  variant="destructive"
                  className="gap-2"
                >
                  <RotateCcw className={cn("h-4 w-4", isRecalculating && "animate-spin")} />
                  {isRecalculating ? "Исключаем..." : "Исключить из расчёта"}
                </Button>
              </div>
            </div>

            {/* Таблица */}
            {filteredProducts.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {products.length === 0 ? "Нет товаров для отображения" : "Нет товаров, соответствующих фильтрам"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 font-medium w-10">
                        <Checkbox
                          checked={filteredProducts.length > 0 && selectedSkus.size === filteredProducts.length}
                          onCheckedChange={handleSelectAll}
                        />
                      </th>
                      <th className="text-left py-3 px-2 font-medium">Артикул</th>
                      <th className="text-left py-3 px-2 font-medium">Название</th>
                      <th className="text-right py-3 px-2 font-medium">Выручка</th>
                      <th className="text-right py-3 px-2 font-medium">Прибыль</th>
                      <th className="text-right py-3 px-2 font-medium">Заказы</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product, index) => {
                      const sku = product.sku || product.article || "";
                      const isSelected = selectedSkus.has(sku);
                      const isExcluded = excludedSkus.has(sku);
                      return (
                      <tr 
                        key={index} 
                        className={cn(
                          "border-b last:border-0 hover:bg-muted/30", 
                          isSelected && "bg-primary/5",
                          isExcluded && "opacity-50 bg-warning/10"
                        )}
                      >
                        <td className="py-3 px-2">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleProduct(sku)}
                            disabled={isExcluded}
                          />
                        </td>
                        <td className="py-3 px-2 font-mono text-xs">{product.article || product.sku || "-"}</td>
                        <td className="py-3 px-2 max-w-[200px] truncate">
                          {product.name}
                          {isExcluded && <Badge variant="outline" className="ml-2 text-xs">Исключён</Badge>}
                        </td>
                        <td className="py-3 px-2 text-right">{formatCurrency(product.revenue || 0)}</td>
                        <td className={cn(
                          "py-3 px-2 text-right font-medium",
                          (product.profit || 0) >= 0 ? "text-success" : "text-destructive"
                        )}>
                          {formatCurrency(product.profit || 0)}
                        </td>
                        <td className="py-3 px-2 text-right">{product.orders || 0}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Секция с исключёнными товарами из этого списка */}
            {(() => {
              const excludedFromThisList = products.filter(p => {
                const sku = p.sku || p.article || "";
                return excludedSkus.has(sku);
              });

              if (excludedFromThisList.length === 0) {
                return null;
              }

              return (
                <div className="mt-6 p-4 bg-warning/10 border border-warning/30 rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Исключённые товары из этого списка:</span>
                      <Badge variant="outline">{excludedFromThisList.length}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={async () => {
                          if (!onRecalculate) {
                            toast({
                              title: "Ошибка",
                              description: "Функция пересчёта не доступна",
                              variant: "destructive",
                            });
                            return;
                          }

                          setIsRecalculating(true);
                          try {
                            await onRecalculate(Array.from(excludedSkus));
                            toast({
                              title: "Пересчёт выполнен",
                              description: `Данные пересчитаны с учётом ${excludedSkus.size} исключённых товаров`,
                            });
                          } catch (error: any) {
                            toast({
                              title: "Ошибка при пересчёте",
                              description: error.message || "Не удалось пересчитать данные",
                              variant: "destructive",
                            });
                          } finally {
                            setIsRecalculating(false);
                          }
                        }}
                        disabled={isRecalculating}
                        className="gap-2"
                      >
                        <RotateCcw className={cn("h-4 w-4", isRecalculating && "animate-spin")} />
                        {isRecalculating ? "Пересчитываем..." : "Пересчитать"}
                      </Button>
                    </div>
                  </div>

                  {/* Список исключённых товаров с возможностью возврата поштучно */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={excludedFromThisList.length > 0 && selectedToReturn.size === excludedFromThisList.length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedToReturn(new Set(excludedFromThisList.map(p => p.sku || p.article || "").filter(Boolean)));
                            } else {
                              setSelectedToReturn(new Set());
                            }
                          }}
                        />
                        <span>Выбрано для возврата: {selectedToReturn.size} из {excludedFromThisList.length}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            if (selectedToReturn.size === 0) {
                              toast({
                                title: "Не выбраны товары",
                                description: "Выберите товары для возврата в расчёт",
                                variant: "destructive",
                              });
                              return;
                            }

                            if (!onRecalculate) {
                              toast({
                                title: "Ошибка",
                                description: "Функция пересчёта не доступна",
                                variant: "destructive",
                              });
                              return;
                            }

                            setIsReturning(true);
                            try {
                              const returnCount = selectedToReturn.size;
                              
                              // Удаляем выбранные товары из исключённых
                              selectedToReturn.forEach(sku => removeExcludedSku(sku));
                              
                              // Пересчитываем с оставшимися исключёнными товарами
                              const remainingExcluded = Array.from(excludedSkus).filter(sku => !selectedToReturn.has(sku));
                              await onRecalculate(remainingExcluded);
                              
                              setSelectedToReturn(new Set());
                              
                              toast({
                                title: "Товары возвращены в расчёт",
                                description: `Возвращено товаров: ${returnCount}`,
                              });
                            } catch (error: any) {
                              toast({
                                title: "Ошибка при возврате товаров",
                                description: error.message || "Не удалось вернуть товары в расчёт",
                                variant: "destructive",
                              });
                            } finally {
                              setIsReturning(false);
                            }
                          }}
                          disabled={selectedToReturn.size === 0 || isReturning}
                          className="gap-2"
                        >
                          <RotateCcw className={cn("h-4 w-4", isReturning && "animate-spin")} />
                          {isReturning ? "Возвращаем..." : "Вернуть выбранные"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            if (!onRecalculate) {
                              toast({
                                title: "Ошибка",
                                description: "Функция пересчёта не доступна",
                                variant: "destructive",
                              });
                              return;
                            }

                            setIsReturning(true);
                            try {
                              // Очищаем все исключённые товары
                              clearExcludedSkus();
                              
                              // Пересчитываем с пустым списком исключённых
                              await onRecalculate([]);
                              
                              setSelectedToReturn(new Set());
                              
                              toast({
                                title: "Товары возвращены в расчёт",
                                description: "Все исключённые товары возвращены в расчёт и данные пересчитаны",
                              });
                            } catch (error: any) {
                              toast({
                                title: "Ошибка при возврате товаров",
                                description: error.message || "Не удалось вернуть товары в расчёт",
                                variant: "destructive",
                              });
                            } finally {
                              setIsReturning(false);
                            }
                          }}
                          disabled={isReturning}
                          className="gap-2"
                        >
                          <RotateCcw className={cn("h-4 w-4", isReturning && "animate-spin")} />
                          {isReturning ? "Возвращаем..." : "Вернуть все в расчёт"}
                        </Button>
                      </div>
                    </div>
                    
                    {/* Таблица исключённых товаров */}
                    <div className="max-h-60 overflow-y-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="text-left py-2 px-3 w-10">
                              <Checkbox
                                checked={excludedFromThisList.length > 0 && selectedToReturn.size === excludedFromThisList.length}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedToReturn(new Set(excludedFromThisList.map(p => p.sku || p.article || "").filter(Boolean)));
                                  } else {
                                    setSelectedToReturn(new Set());
                                  }
                                }}
                              />
                            </th>
                            <th className="text-left py-2 px-3">Артикул</th>
                            <th className="text-left py-2 px-3">Название</th>
                            <th className="text-right py-2 px-3">Выручка</th>
                            <th className="text-right py-2 px-3">Прибыль</th>
                          </tr>
                        </thead>
                        <tbody>
                          {excludedFromThisList.map((product) => {
                            const sku = product.sku || product.article || "";
                            const isSelected = selectedToReturn.has(sku);
                            return (
                              <tr 
                                key={sku} 
                                className={cn(
                                  "border-b hover:bg-muted/30",
                                  isSelected && "bg-primary/5"
                                )}
                              >
                                <td className="py-2 px-3">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={(checked) => {
                                      const newSelected = new Set(selectedToReturn);
                                      if (checked) {
                                        newSelected.add(sku);
                                      } else {
                                        newSelected.delete(sku);
                                      }
                                      setSelectedToReturn(newSelected);
                                    }}
                                  />
                                </td>
                                <td className="py-2 px-3 font-mono text-xs">{product.article || product.sku || "-"}</td>
                                <td className="py-2 px-3 max-w-[200px] truncate" title={product.name}>
                                  {product.name}
                                </td>
                                <td className="py-2 px-3 text-right">{formatCurrency(product.revenue || 0)}</td>
                                <td className={cn(
                                  "py-2 px-3 text-right font-medium",
                                  (product.profit || 0) >= 0 ? "text-success" : "text-destructive"
                                )}>
                                  {formatCurrency(product.profit || 0)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
