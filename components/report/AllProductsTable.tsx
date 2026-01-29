"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight, BarChart3 } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { ProductData } from "@/lib/types/analysis";
import type { AggregatedOrder } from "@/lib/analysis/types";
import { ProductSalesAnalytics } from "./ProductSalesAnalytics";

interface AllProductsTableProps {
  products: ProductData[];
  orders?: AggregatedOrder[];
  analysisId?: string;
  summary?: any;
}

type SortField = "name" | "sku" | "revenue" | "profit" | "netProfit" | "profitMargin" | "returnRate" | "orders";
type SortDirection = "asc" | "desc" | null;

export function AllProductsTable({ products, orders = [], analysisId, summary }: AllProductsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState<SortField>("revenue");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isOpen, setIsOpen] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  
  // Фильтры
  const [minRevenue, setMinRevenue] = useState<string>("");
  const [minProfit, setMinProfit] = useState<string>("");
  const [minNetProfit, setMinNetProfit] = useState<string>("");
  const [minProfitMargin, setMinProfitMargin] = useState<string>("");
  const [minReturnRate, setMinReturnRate] = useState<string>("");
  const [showOnlyUnprofitable, setShowOnlyUnprofitable] = useState<boolean>(false);
  

  // Поиск и фильтрация
  const filteredProducts = useMemo(() => {
    let filtered = [...products];

    // Поиск по названию, SKU, артикулу
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name?.toLowerCase().includes(query) ||
          p.sku?.toLowerCase().includes(query) ||
          (p as any).article?.toLowerCase().includes(query)
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

    // Фильтр по проценту возвратов
    if (minReturnRate) {
      filtered = filtered.filter((p) => (p.returnRate || 0) >= parseFloat(minReturnRate));
    }

    // Фильтр: показать только убыточные товары (с отрицательной чистой прибылью)
    if (showOnlyUnprofitable) {
      filtered = filtered.filter((p) => p.netProfit !== undefined && p.netProfit < 0);
    }

    return filtered;
  }, [products, searchQuery, minRevenue, minProfit, minNetProfit, minProfitMargin, minReturnRate, showOnlyUnprofitable]);

  // Сортировка
  const sortedProducts = useMemo(() => {
    if (!sortField || !sortDirection) return filteredProducts;

    return [...filteredProducts].sort((a, b) => {
      let aValue: number | string = 0;
      let bValue: number | string = 0;

      switch (sortField) {
        case "name":
          aValue = a.name || "";
          bValue = b.name || "";
          break;
        case "sku":
          aValue = a.sku || "";
          bValue = b.sku || "";
          break;
        case "revenue":
          aValue = a.revenue || 0;
          bValue = b.revenue || 0;
          break;
        case "profit":
          aValue = a.profit || 0;
          bValue = b.profit || 0;
          break;
        case "netProfit":
          aValue = a.netProfit !== undefined ? a.netProfit : 0;
          bValue = b.netProfit !== undefined ? b.netProfit : 0;
          break;
        case "profitMargin":
          aValue = a.profitMargin !== undefined ? a.profitMargin : 0;
          bValue = b.profitMargin !== undefined ? b.profitMargin : 0;
          break;
        case "returnRate":
          aValue = a.returnRate || 0;
          bValue = b.returnRate || 0;
          break;
        case "orders":
          aValue = a.orders || 0;
          bValue = b.orders || 0;
          break;
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortDirection === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return sortDirection === "asc"
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    });
  }, [filteredProducts, sortField, sortDirection]);

  // Агрегированные суммы по отфильтрованным товарам
  const filteredSummary = useMemo(() => {
    if (filteredProducts.length === 0) {
      return {
        totalRevenue: 0,
        totalProfit: 0,
        totalNetProfit: 0,
        totalCost: 0,
        avgProfitMargin: 0,
        productsCount: 0,
        totalCommission: 0,
        totalLogistics: 0,
        totalReturns: 0,
        totalQuantity: 0,
        totalReturnsCount: 0,
      };
    }
    
    const totalRevenue = filteredProducts.reduce((sum, p) => sum + (p.revenue || 0), 0);
    const totalProfit = filteredProducts.reduce((sum, p) => sum + (p.profit || 0), 0);
    const totalNetProfit = filteredProducts.reduce((sum, p) => {
      if (p.netProfit !== undefined) {
        return sum + p.netProfit;
      }
      return sum + (p.profit || 0);
    }, 0);
    const totalCost = filteredProducts.reduce((sum, p) => {
      if (p.totalCost !== undefined && p.totalCost > 0) {
        return sum + p.totalCost;
      }
      return sum;
    }, 0);
    
    // Средняя рентабельность (только для товаров с выручкой > 0)
    const productsWithRevenue = filteredProducts.filter(p => (p.revenue || 0) > 0);
    const avgProfitMargin = productsWithRevenue.length > 0
      ? productsWithRevenue.reduce((sum, p) => {
          if (p.profitMargin !== undefined) {
            return sum + p.profitMargin;
          }
          // Если нет profitMargin, считаем из netProfit или profit
          if (p.revenue > 0) {
            const profit = p.netProfit !== undefined ? p.netProfit : (p.profit || 0);
            return sum + (profit / p.revenue) * 100;
          }
          return sum;
        }, 0) / productsWithRevenue.length
      : 0;
    
    // Дополнительные метрики (если есть в данных)
    const totalCommission = filteredProducts.reduce((sum, p) => sum + ((p as any).totalCommission || (p as any).commissionAmount || 0), 0);
    const totalLogistics = filteredProducts.reduce((sum, p) => sum + ((p as any).totalLogistics || (p as any).logisticsAmount || 0), 0);
    const totalReturns = filteredProducts.reduce((sum, p) => sum + ((p as any).totalReturnsAmount || (p as any).returnsAmount || 0), 0);
    const totalQuantity = filteredProducts.reduce((sum, p) => sum + ((p as any).totalQuantity || (p as any).totalSold || (p as any).quantity || 0), 0);
    const totalReturnsCount = filteredProducts.reduce((sum, p) => sum + ((p as any).returnsCount || (p as any).totalReturned || 0), 0);
    
    return {
      totalRevenue,
      totalProfit,
      totalNetProfit,
      totalCost,
      avgProfitMargin,
      productsCount: filteredProducts.length,
      totalCommission,
      totalLogistics,
      totalReturns,
      totalQuantity,
      totalReturnsCount,
    };
  }, [filteredProducts]);
  
  // Пагинация
  const totalPages = pageSize > 0 ? Math.ceil(sortedProducts.length / pageSize) : 1;
  const paginatedProducts = useMemo(() => {
    if (pageSize <= 0) return sortedProducts; // "Все записи"
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return sortedProducts.slice(start, end);
  }, [sortedProducts, currentPage, pageSize]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortDirection(null);
        setSortField("revenue");
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="h-4 w-4 ml-1 opacity-30" />;
    }
    if (sortDirection === "asc") {
      return <ChevronUp className="h-4 w-4 ml-1" />;
    }
    if (sortDirection === "desc") {
      return <ChevronDown className="h-4 w-4 ml-1" />;
    }
    return <ChevronsUpDown className="h-4 w-4 ml-1 opacity-30" />;
  };

  const resetFilters = () => {
    setSearchQuery("");
    setMinRevenue("");
    setMinProfit("");
    setMinNetProfit("");
    setMinProfitMargin("");
    setMinReturnRate("");
    setShowOnlyUnprofitable(false);
    setCurrentPage(1);
  };

  return (
    <Card className="glass">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ChevronRight className={cn("h-5 w-5 transition-transform", isOpen && "rotate-90")} />
                Все товары по прибыльности
                <span className="text-sm font-normal text-muted-foreground">
                  ({sortedProducts.length} {sortedProducts.length === 1 ? "товар" : sortedProducts.length < 5 ? "товара" : "товаров"})
                </span>
              </CardTitle>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            {/* Поиск и фильтры */}
            <div className="space-y-4 mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по названию, SKU, артикулу..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Выручка от ₽</label>
                  <Input
                    type="number"
                    placeholder="Мин"
                    value={minRevenue}
                    onChange={(e) => {
                      setMinRevenue(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Начислено от ₽</label>
                  <Input
                    type="number"
                    placeholder="Мин"
                    value={minProfit}
                    onChange={(e) => {
                      setMinProfit(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Чистая прибыль от ₽</label>
                  <Input
                    type="number"
                    placeholder="Мин"
                    value={minNetProfit}
                    onChange={(e) => {
                      setMinNetProfit(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Рентабельность от %</label>
                  <Input
                    type="number"
                    placeholder="Мин"
                    value={minProfitMargin}
                    onChange={(e) => {
                      setMinProfitMargin(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">% возврата от</label>
                  <Input
                    type="number"
                    placeholder="Мин"
                    value={minReturnRate}
                    onChange={(e) => {
                      setMinReturnRate(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
              </div>

              {/* Чекбокс для фильтрации убыточных товаров */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showOnlyUnprofitable"
                  checked={showOnlyUnprofitable}
                  onChange={(e) => {
                    setShowOnlyUnprofitable(e.target.checked);
                    setCurrentPage(1);
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                />
                <label htmlFor="showOnlyUnprofitable" className="text-sm cursor-pointer">
                  Показать только убыточные товары (с отрицательной чистой прибылью)
                </label>
              </div>

              {/* Кнопка сброса фильтров */}
              {(searchQuery || minRevenue || minProfit || minNetProfit || minProfitMargin || minReturnRate || showOnlyUnprofitable) && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Сбросить фильтры
                </Button>
              )}
            </div>

            {/* Панель с агрегированными суммами по отфильтрованным товарам */}
            {filteredProducts.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                <Card className="glass">
                  <CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground mb-1">Выручка</div>
                    <div className="text-lg font-semibold">{formatCurrency(filteredSummary.totalRevenue)}</div>
                    <div className="text-xs text-muted-foreground mt-1">{filteredSummary.productsCount} товаров</div>
                  </CardContent>
                </Card>
                <Card className="glass">
                  <CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground mb-1">Начислено</div>
                    <div className={cn(
                      "text-lg font-semibold",
                      filteredSummary.totalProfit >= 0 ? "text-success" : "text-destructive"
                    )}>
                      {formatCurrency(filteredSummary.totalProfit)}
                    </div>
                  </CardContent>
                </Card>
                <Card className="glass">
                  <CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground mb-1">Себестоимость</div>
                    <div className="text-lg font-semibold">{formatCurrency(filteredSummary.totalCost)}</div>
                  </CardContent>
                </Card>
                <Card className="glass">
                  <CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground mb-1">Чистая прибыль</div>
                    <div className={cn(
                      "text-lg font-semibold",
                      filteredSummary.totalNetProfit >= 0 ? "text-success" : "text-destructive"
                    )}>
                      {formatCurrency(filteredSummary.totalNetProfit)}
                    </div>
                  </CardContent>
                </Card>
                <Card className="glass">
                  <CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground mb-1">Средняя рентабельность</div>
                    <div className={cn(
                      "text-lg font-semibold",
                      filteredSummary.avgProfitMargin >= 15 ? "text-success" : filteredSummary.avgProfitMargin < 0 ? "text-destructive" : ""
                    )}>
                      {filteredSummary.avgProfitMargin.toFixed(1)}%
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Таблица */}
            {sortedProducts.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {products.length === 0 ? "Нет товаров для отображения" : "Нет товаров, соответствующих фильтрам"}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 font-medium w-8"></th>
                        <th
                          className="text-left py-3 px-2 font-medium cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => handleSort("sku")}
                        >
                          <div className="flex items-center">
                            SKU
                            {getSortIcon("sku")}
                          </div>
                        </th>
                        <th
                          className="text-left py-3 px-2 font-medium cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => handleSort("name")}
                        >
                          <div className="flex items-center">
                            Название
                            {getSortIcon("name")}
                          </div>
                        </th>
                        <th
                          className="text-right py-3 px-2 font-medium cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => handleSort("revenue")}
                        >
                          <div className="flex items-center justify-end">
                            Выручка
                            {getSortIcon("revenue")}
                          </div>
                        </th>
                        <th className="text-right py-3 px-2 font-medium">Себестоимость</th>
                        <th
                          className="text-right py-3 px-2 font-medium cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => handleSort("profit")}
                        >
                          <div className="flex items-center justify-end">
                            Начислено
                            {getSortIcon("profit")}
                          </div>
                        </th>
                        <th
                          className="text-right py-3 px-2 font-medium cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => handleSort("netProfit")}
                        >
                          <div className="flex items-center justify-end">
                            Чистая прибыль
                            {getSortIcon("netProfit")}
                          </div>
                        </th>
                        <th
                          className="text-right py-3 px-2 font-medium cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => handleSort("profitMargin")}
                        >
                          <div className="flex items-center justify-end">
                            Рентабельность
                            {getSortIcon("profitMargin")}
                          </div>
                        </th>
                        <th
                          className="text-right py-3 px-2 font-medium cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => handleSort("orders")}
                        >
                          <div className="flex items-center justify-end">
                            Заказы
                            {getSortIcon("orders")}
                          </div>
                        </th>
                        <th
                          className="text-right py-3 px-2 font-medium cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => handleSort("returnRate")}
                        >
                          <div className="flex items-center justify-end">
                            % возврата
                            {getSortIcon("returnRate")}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedProducts.map((product, index) => {
                        return (
                          <tr 
                            key={index} 
                            className="border-b last:border-0 hover:bg-muted/30"
                          >
                            <td className="py-3 px-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => {
                                  setSelectedProduct(product);
                                  setIsAnalyticsOpen(true);
                                }}
                                title="Аналитика продаж"
                              >
                                <BarChart3 className="h-4 w-4" />
                              </Button>
                            </td>
                            <td className="py-3 px-2 font-mono text-xs">{product.sku || "-"}</td>
                            <td className="py-3 px-2 max-w-[300px]">
                              <div className="break-words">{product.name || "Без названия"}</div>
                            </td>
                            <td className="py-3 px-2 text-right">{formatCurrency(product.revenue || 0)}</td>
                            <td className="py-3 px-2 text-right text-muted-foreground">
                              {product.totalCost ? formatCurrency(product.totalCost) : "-"}
                            </td>
                            <td className={cn(
                              "py-3 px-2 text-right font-medium",
                              (product.profit || 0) >= 0 ? "text-success" : "text-destructive"
                            )}>
                              {formatCurrency(product.profit || 0)}
                            </td>
                            <td className={cn(
                              "py-3 px-2 text-right font-semibold",
                              product.netProfit !== undefined
                                ? ((product.netProfit >= 0) ? "text-success" : "text-destructive")
                                : "text-muted-foreground"
                            )}>
                              {product.netProfit !== undefined ? formatCurrency(product.netProfit) : "-"}
                            </td>
                            <td className={cn(
                              "py-3 px-2 text-right",
                              product.profitMargin !== undefined
                                ? ((product.profitMargin >= 15) ? "text-success" : (product.profitMargin < 0) ? "text-destructive" : "")
                                : "text-muted-foreground"
                            )}>
                              {product.profitMargin !== undefined ? `${product.profitMargin.toFixed(1)}%` : "-"}
                            </td>
                            <td className="py-3 px-2 text-right">{product.orders || 0}</td>
                            <td className={cn(
                              "py-3 px-2 text-right",
                              (product.returnRate || 0) > 5 ? "text-destructive" : ""
                            )}>
                              {(product.returnRate || 0).toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Пагинация */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Записей на странице:</span>
                    <Select
                      value={pageSize === 0 ? "all" : String(pageSize)}
                      onValueChange={(value) => {
                        setPageSize(value === "all" ? 0 : parseInt(value));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="all">Все</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronRight className="h-4 w-4 rotate-180" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Страница {currentPage} из {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      {/* Модальное окно аналитики продаж */}
      {selectedProduct && (
        <ProductSalesAnalytics
          product={selectedProduct}
          orders={orders}
          analysisId={analysisId}
          summary={summary}
          isOpen={isAnalyticsOpen}
          onClose={() => {
            setIsAnalyticsOpen(false);
            setSelectedProduct(null);
          }}
        />
      )}
    </Card>
  );
}
