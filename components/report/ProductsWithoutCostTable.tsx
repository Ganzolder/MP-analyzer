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
  const [isRecalculating, setIsRecalculating] = useState(false);
  const { toast } = useToast();
  const { addExcludedSku } = useExcludedProductsStore();

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

    setIsRecalculating(true);
    try {
      // Сохраняем исключённые товары в store
      selectedSkus.forEach(sku => addExcludedSku(sku));
      
      if (onRecalculate) {
        await onRecalculate(Array.from(selectedSkus));
        toast({
          title: "Товары исключены",
          description: `Исключено товаров: ${selectedSkus.size}`,
        });
        setSelectedSkus(new Set());
      } else {
        toast({
          title: "Товары исключены",
          description: `Исключено товаров: ${selectedSkus.size}. Пересчитайте анализ для применения изменений.`,
        });
        setSelectedSkus(new Set());
      }
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
                      return (
                      <tr key={index} className={cn("border-b last:border-0 hover:bg-muted/30", isSelected && "bg-primary/5")}>
                        <td className="py-3 px-2">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleProduct(sku)}
                          />
                        </td>
                        <td className="py-3 px-2 font-mono text-xs">{product.article || product.sku || "-"}</td>
                        <td className="py-3 px-2 max-w-[200px] truncate">{product.name}</td>
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
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
