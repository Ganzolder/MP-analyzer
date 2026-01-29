"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, ChevronRight } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";

interface ProductWithCost {
  article?: string;
  sku?: string;
  name: string;
  sold?: number;
  costPerUnit?: number;
  totalCost?: number;
  revenue?: number;
  netProfit?: number;
  profitMargin?: number;
}

interface ProductsWithCostTableProps {
  products: ProductWithCost[];
  title?: string;
}

export function ProductsWithCostTable({ products, title = "Товары с себестоимостью" }: ProductsWithCostTableProps) {
  const [isOpen, setIsOpen] = useState(true); // Оставляем открытым по умолчанию
  const [searchQuery, setSearchQuery] = useState("");
  const [minRevenue, setMinRevenue] = useState<string>("");
  const [minNetProfit, setMinNetProfit] = useState<string>("");
  const [minProfitMargin, setMinProfitMargin] = useState<string>("");

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

    // Фильтр по чистой прибыли
    if (minNetProfit) {
      filtered = filtered.filter((p) => {
        const netProfit = p.netProfit !== undefined ? p.netProfit : 0;
        return netProfit >= parseFloat(minNetProfit);
      });
    }

    // Фильтр по рентабельности
    if (minProfitMargin) {
      filtered = filtered.filter((p) => {
        const profitMargin = p.profitMargin !== undefined ? p.profitMargin : 0;
        return profitMargin >= parseFloat(minProfitMargin);
      });
    }

    return filtered;
  }, [products, searchQuery, minRevenue, minNetProfit, minProfitMargin]);

  const resetFilters = () => {
    setSearchQuery("");
    setMinRevenue("");
    setMinNetProfit("");
    setMinProfitMargin("");
  };

  return (
    <Card className="glass">
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
                  <label className="text-xs text-muted-foreground mb-1 block">Чистая прибыль от ₽</label>
                  <Input
                    type="number"
                    placeholder="Мин"
                    value={minNetProfit}
                    onChange={(e) => setMinNetProfit(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Рентабельность от %</label>
                  <Input
                    type="number"
                    placeholder="Мин"
                    value={minProfitMargin}
                    onChange={(e) => setMinProfitMargin(e.target.value)}
                  />
                </div>
              </div>

              {/* Кнопка сброса фильтров */}
              {(searchQuery || minRevenue || minNetProfit || minProfitMargin) && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Сбросить фильтры
                </Button>
              )}
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
                      <th className="text-left py-3 px-2 font-medium">Артикул</th>
                      <th className="text-left py-3 px-2 font-medium">Название</th>
                      <th className="text-right py-3 px-2 font-medium">Продано</th>
                      <th className="text-right py-3 px-2 font-medium">Себестоимость ед.</th>
                      <th className="text-right py-3 px-2 font-medium">Себестоимость общая</th>
                      <th className="text-right py-3 px-2 font-medium">Выручка</th>
                      <th className="text-right py-3 px-2 font-medium">Чистая прибыль</th>
                      <th className="text-right py-3 px-2 font-medium">Рентабельность</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product, index) => (
                      <tr key={index} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-3 px-2 font-mono text-xs">{product.article || product.sku || "-"}</td>
                        <td className="py-3 px-2 max-w-[200px] truncate">{product.name}</td>
                        <td className="py-3 px-2 text-right">{product.sold || 0}</td>
                        <td className="py-3 px-2 text-right text-muted-foreground">
                          {formatCurrency(product.costPerUnit || 0)}
                        </td>
                        <td className="py-3 px-2 text-right text-muted-foreground">
                          {formatCurrency(product.totalCost || 0)}
                        </td>
                        <td className="py-3 px-2 text-right">{formatCurrency(product.revenue || 0)}</td>
                        <td className={cn(
                          "py-3 px-2 text-right font-semibold",
                          (product.netProfit || 0) >= 0 ? "text-success" : "text-destructive"
                        )}>
                          {formatCurrency(product.netProfit || 0)}
                        </td>
                        <td className={cn(
                          "py-3 px-2 text-right",
                          (product.profitMargin || 0) >= 15 ? "text-success" : (product.profitMargin || 0) < 0 ? "text-destructive" : ""
                        )}>
                          {product.profitMargin !== undefined ? `${product.profitMargin.toFixed(1)}%` : "-"}
                        </td>
                      </tr>
                    ))}
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
