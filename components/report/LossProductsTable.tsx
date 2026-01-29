"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, Search, ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { ProductData } from "@/lib/types/analysis";

interface LossProductsTableProps {
  products: ProductData[];
}

type SortField = "name" | "revenue" | "profit" | "margin" | "returnRate" | "orders";
type SortDirection = "asc" | "desc" | null;

export function LossProductsTable({ products }: LossProductsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortField, setSortField] = useState<SortField>("profit");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [isOpen, setIsOpen] = useState(false); // Изначально свернуто
  
  // Фильтры
  const [minMargin, setMinMargin] = useState<string>("");
  const [maxMargin, setMaxMargin] = useState<string>("");
  const [minReturnRate, setMinReturnRate] = useState<string>("");
  const [minProfit, setMinProfit] = useState<string>("");

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
          String(p.sku || "").toLowerCase().includes(query)
      );
    }

    // Фильтр по марже
    if (minMargin || maxMargin) {
      filtered = filtered.filter((p) => {
        const margin = p.margin || 0;
        if (minMargin && margin < parseFloat(minMargin)) return false;
        if (maxMargin && margin > parseFloat(maxMargin)) return false;
        return true;
      });
    }

    // Фильтр по проценту возвратов
    if (minReturnRate) {
      filtered = filtered.filter((p) => (p.returnRate || 0) >= parseFloat(minReturnRate));
    }

    // Фильтр по прибыли (минимальная)
    if (minProfit) {
      filtered = filtered.filter((p) => (p.profit || 0) <= parseFloat(minProfit));
    }

    return filtered;
  }, [products, searchQuery, minMargin, maxMargin, minReturnRate, minProfit]);

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
        case "revenue":
          aValue = a.revenue || 0;
          bValue = b.revenue || 0;
          break;
        case "profit":
          aValue = a.profit || 0;
          bValue = b.profit || 0;
          break;
        case "margin":
          aValue = a.margin || 0;
          bValue = b.margin || 0;
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
          ? aValue.localeCompare(bValue, "ru")
          : bValue.localeCompare(aValue, "ru");
      }

      return sortDirection === "asc"
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    });
  }, [filteredProducts, sortField, sortDirection]);

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
        setSortField("profit");
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
    setMinMargin("");
    setMaxMargin("");
    setMinReturnRate("");
    setMinProfit("");
    setCurrentPage(1);
  };

  return (
    <Card className="glass border-destructive/30">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ChevronRight className={cn("h-5 w-5 transition-transform", isOpen && "rotate-90")} />
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Убыточные товары
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
          {/* Поиск */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по названию, SKU или артикулу..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10"
            />
          </div>

          {/* Фильтры */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Маржа от %</label>
              <Input
                type="number"
                placeholder="Мин"
                value={minMargin}
                onChange={(e) => {
                  setMinMargin(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Маржа до %</label>
              <Input
                type="number"
                placeholder="Макс"
                value={maxMargin}
                onChange={(e) => {
                  setMaxMargin(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Возвраты от %</label>
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
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Прибыль до ₽</label>
              <Input
                type="number"
                placeholder="Макс"
                value={minProfit}
                onChange={(e) => {
                  setMinProfit(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          {/* Кнопка сброса фильтров */}
          {(searchQuery || minMargin || maxMargin || minReturnRate || minProfit) && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Сбросить фильтры
            </Button>
          )}
        </div>

        {/* Таблица */}
        {sortedProducts.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            {products.length === 0 ? "Нет убыточных товаров" : "Нет товаров, соответствующих фильтрам"}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th
                      className="text-left py-3 px-2 font-medium cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("name")}
                    >
                      <div className="flex items-center">
                        Название
                        {getSortIcon("name")}
                      </div>
                    </th>
                    <th className="text-left py-3 px-2 font-medium">SKU</th>
                    <th
                      className="text-right py-3 px-2 font-medium cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("revenue")}
                    >
                      <div className="flex items-center justify-end">
                        Выручка
                        {getSortIcon("revenue")}
                      </div>
                    </th>
                    <th
                      className="text-right py-3 px-2 font-medium cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("profit")}
                    >
                      <div className="flex items-center justify-end">
                        Прибыль
                        {getSortIcon("profit")}
                      </div>
                    </th>
                    <th
                      className="text-right py-3 px-2 font-medium cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("margin")}
                    >
                      <div className="flex items-center justify-end">
                        Маржа
                        {getSortIcon("margin")}
                      </div>
                    </th>
                    <th
                      className="text-right py-3 px-2 font-medium cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("returnRate")}
                    >
                      <div className="flex items-center justify-end">
                        Возвраты %
                        {getSortIcon("returnRate")}
                      </div>
                    </th>
                    <th
                      className="text-right py-3 px-2 font-medium cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort("orders")}
                    >
                      <div className="flex items-center justify-end">
                        Заказов
                        {getSortIcon("orders")}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedProducts.map((product, index) => (
                    <tr key={index} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-3 px-2 max-w-[300px]">
                        <div className="break-words">{product.name || "Без названия"}</div>
                      </td>
                      <td className="py-3 px-2 font-mono text-xs">{product.sku || "-"}</td>
                      <td className="py-3 px-2 text-right">{formatCurrency(product.revenue || 0)}</td>
                      <td className="py-3 px-2 text-right font-medium text-destructive">
                        {formatCurrency(product.profit || 0)}
                      </td>
                      <td className="py-3 px-2 text-right text-destructive">
                        {(product.margin || 0).toFixed(1)}%
                      </td>
                      <td className="py-3 px-2 text-right">
                        {(product.returnRate || 0).toFixed(1)}%
                      </td>
                      <td className="py-3 px-2 text-right">{product.orders || 0}</td>
                    </tr>
                  ))}
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
                    if (value === "all") {
                      setPageSize(0);
                    } else {
                      setPageSize(parseInt(value));
                    }
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="all">Все</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {pageSize > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Страница {currentPage} из {totalPages}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                    >
                      ««
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      ‹
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      ›
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                    >
                      »»
                    </Button>
                  </div>
                </div>
              )}

              <div className="text-sm text-muted-foreground">
                Показано {paginatedProducts.length} из {sortedProducts.length}
              </div>
            </div>
          </>
        )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
