"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Search, 
  ChevronUp, 
  ChevronDown, 
  ChevronsUpDown, 
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  TrendingDown,
  ArrowLeft,
} from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { AggregatedOrder } from "@/lib/analysis/types";

interface OrdersProfitabilityTableProps {
  orders: AggregatedOrder[];
}

type SortField = "orderNumber" | "date" | "revenue" | "netAmount" | "totalCost" | "netProfit" | "profitMargin";
type SortDirection = "asc" | "desc" | null;

interface GroupedOrder {
  orderNumber: string;
  date: Date | null;
  status: string;
  // Суммы по заказу
  grossRevenue: number;
  netAmount: number;
  totalCost: number;
  netProfit?: number;
  profitMargin?: number;
  // Детализация по товарам
  products: AggregatedOrder[];
  // Детализация начислений
  commissionAmount: number;
  logisticsAmount: number;
  acquiringAmount: number;
  returnAmount: number;
  otherFeesAmount: number;
  totalFees: number;
  // Флаги
  isFromPreviousPeriod?: boolean;
}

export function OrdersProfitabilityTable({ orders }: OrdersProfitabilityTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isOpen, setIsOpen] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  
  // Фильтры
  const [minRevenue, setMinRevenue] = useState<string>("");
  const [minNetAmount, setMinNetAmount] = useState<string>("");
  const [minNetProfit, setMinNetProfit] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showOnlyUnprofitable, setShowOnlyUnprofitable] = useState<boolean>(false);
  
  // Группируем заказы по номеру заказа (для многотоварных заказов)
  const groupedOrders = useMemo(() => {
    const groups = new Map<string, GroupedOrder>();
    
    orders.forEach(order => {
      const key = order.orderNumber;
      
      if (!groups.has(key)) {
        groups.set(key, {
          orderNumber: key,
          date: order.orderDate || order.chargeDate,
          status: order.status,
          grossRevenue: 0,
          netAmount: 0,
          totalCost: 0,
          products: [],
          commissionAmount: 0,
          logisticsAmount: 0,
          acquiringAmount: 0,
          returnAmount: 0,
          otherFeesAmount: 0,
          totalFees: 0,
        });
      }
      
      const group = groups.get(key)!;
      group.grossRevenue += order.grossRevenue || 0;
      group.netAmount += order.totalAmountRub || 0;
      group.totalCost += order.totalCost || 0;
      group.commissionAmount += order.commissionAmount || 0;
      group.logisticsAmount += order.logisticsAmount || 0;
      group.acquiringAmount += order.acquiringAmount || 0;
      group.returnAmount += order.returnAmount || 0;
      group.otherFeesAmount += order.otherFeesAmount || 0;
      group.totalFees += order.totalFees || 0;
      // Если хотя бы один товар из прошлого периода, помечаем весь заказ
      if (order.isFromPreviousPeriod) {
        group.isFromPreviousPeriod = true;
      }
      group.products.push(order);
    });
    
    // Рассчитываем чистую прибыль и рентабельность
    Array.from(groups.values()).forEach(group => {
      // Если выручка равна 0, себестоимость не учитывается
      if (group.grossRevenue === 0) {
        group.netProfit = group.netAmount;
        group.profitMargin = 0;
        // Обнуляем себестоимость для отображения
        group.totalCost = 0;
      } else if (group.totalCost > 0) {
        group.netProfit = group.netAmount - group.totalCost;
        group.profitMargin = group.grossRevenue > 0 
          ? (group.netProfit / group.grossRevenue) * 100 
          : 0;
      }
    });
    
    return Array.from(groups.values());
  }, [orders]);
  
  // Поиск и фильтрация
  const filteredOrders = useMemo(() => {
    let filtered = [...groupedOrders];
    
    // Поиск по номеру заказа, товарам
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order => {
        const orderMatch = order.orderNumber.toLowerCase().includes(query);
        const productMatch = order.products.some(p => 
          p.productName?.toLowerCase().includes(query) ||
          p.sku?.toLowerCase().includes(query) ||
          p.article?.toLowerCase().includes(query)
        );
        return orderMatch || productMatch;
      });
    }
    
    // Фильтр по статусу
    if (statusFilter !== "all") {
      filtered = filtered.filter(order => order.status === statusFilter);
    }
    
    // Фильтр по выручке
    if (minRevenue) {
      filtered = filtered.filter(order => order.grossRevenue >= parseFloat(minRevenue));
    }
    
    // Фильтр по начислено
    if (minNetAmount) {
      filtered = filtered.filter(order => order.netAmount >= parseFloat(minNetAmount));
    }
    
    // Фильтр по чистой прибыли
    if (minNetProfit) {
      filtered = filtered.filter(order => {
        const netProfit = order.netProfit !== undefined ? order.netProfit : 0;
        return netProfit >= parseFloat(minNetProfit);
      });
    }
    
    // Фильтр: показать только убыточные заказы
    if (showOnlyUnprofitable) {
      filtered = filtered.filter(order => order.netProfit !== undefined && order.netProfit < 0);
    }
    
    return filtered;
  }, [groupedOrders, searchQuery, statusFilter, minRevenue, minNetAmount, minNetProfit, showOnlyUnprofitable]);
  
  // Сортировка
  const sortedOrders = useMemo(() => {
    if (!sortField || !sortDirection) return filteredOrders;
    
    return [...filteredOrders].sort((a, b) => {
      let aValue: number | string | Date = 0;
      let bValue: number | string | Date = 0;
      
      switch (sortField) {
        case "orderNumber":
          aValue = a.orderNumber;
          bValue = b.orderNumber;
          break;
        case "date":
          aValue = a.date || new Date(0);
          bValue = b.date || new Date(0);
          break;
        case "revenue":
          aValue = a.grossRevenue;
          bValue = b.grossRevenue;
          break;
        case "netAmount":
          aValue = a.netAmount;
          bValue = b.netAmount;
          break;
        case "totalCost":
          aValue = a.totalCost;
          bValue = b.totalCost;
          break;
        case "netProfit":
          aValue = a.netProfit !== undefined ? a.netProfit : 0;
          bValue = b.netProfit !== undefined ? b.netProfit : 0;
          break;
        case "profitMargin":
          aValue = a.profitMargin !== undefined ? a.profitMargin : 0;
          bValue = b.profitMargin !== undefined ? b.profitMargin : 0;
          break;
      }
      
      if (aValue instanceof Date && bValue instanceof Date) {
        return sortDirection === "asc"
          ? aValue.getTime() - bValue.getTime()
          : bValue.getTime() - aValue.getTime();
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
  }, [filteredOrders, sortField, sortDirection]);
  
  // Агрегированные суммы по отфильтрованным заказам
  const filteredSummary = useMemo(() => {
    if (filteredOrders.length === 0) {
      return {
        totalRevenue: 0,
        totalNetAmount: 0,
        totalCost: 0,
        totalNetProfit: 0,
        avgProfitMargin: 0,
        ordersCount: 0,
      };
    }
    
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.grossRevenue || 0), 0);
    const totalNetAmount = filteredOrders.reduce((sum, o) => sum + (o.netAmount || 0), 0);
    const totalCost = filteredOrders.reduce((sum, o) => {
      // Себестоимость учитываем только если выручка > 0
      if (o.grossRevenue > 0) {
        return sum + (o.totalCost || 0);
      }
      return sum;
    }, 0);
    const totalNetProfit = filteredOrders.reduce((sum, o) => {
      if (o.netProfit !== undefined) {
        return sum + o.netProfit;
      }
      // Если нет netProfit, считаем как netAmount (для заказов без себестоимости)
      return sum + (o.netAmount || 0);
    }, 0);
    
    // Средняя рентабельность (только для заказов с выручкой > 0)
    const ordersWithRevenue = filteredOrders.filter(o => o.grossRevenue > 0);
    const avgProfitMargin = ordersWithRevenue.length > 0
      ? ordersWithRevenue.reduce((sum, o) => {
          if (o.profitMargin !== undefined) {
            return sum + o.profitMargin;
          }
          // Если нет profitMargin, считаем из netProfit или netAmount
          if (o.grossRevenue > 0) {
            const profit = o.netProfit !== undefined ? o.netProfit : (o.netAmount || 0);
            return sum + (profit / o.grossRevenue) * 100;
          }
          return sum;
        }, 0) / ordersWithRevenue.length
      : 0;
    
    return {
      totalRevenue,
      totalNetAmount,
      totalCost,
      totalNetProfit,
      avgProfitMargin,
      ordersCount: filteredOrders.length,
    };
  }, [filteredOrders]);
  
  // Пагинация
  const totalPages = pageSize > 0 ? Math.ceil(sortedOrders.length / pageSize) : 1;
  const paginatedOrders = useMemo(() => {
    if (pageSize <= 0) return sortedOrders;
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return sortedOrders.slice(start, end);
  }, [sortedOrders, currentPage, pageSize]);
  
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortDirection(null);
        setSortField("date");
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
  
  const toggleOrder = (orderNumber: string) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderNumber)) {
      newExpanded.delete(orderNumber);
    } else {
      newExpanded.add(orderNumber);
    }
    setExpandedOrders(newExpanded);
  };
  
  const resetFilters = () => {
    setSearchQuery("");
    setMinRevenue("");
    setMinNetAmount("");
    setMinNetProfit("");
    setStatusFilter("all");
    setShowOnlyUnprofitable(false);
    setCurrentPage(1);
  };
  
  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      completed: { label: "Завершен", className: "bg-success/20 text-success border-success/30" },
      returned: { label: "Возврат", className: "bg-destructive/20 text-destructive border-destructive/30" },
      partial_return: { label: "Частичный возврат", className: "bg-warning/20 text-warning border-warning/30" },
      cancelled: { label: "Отменен", className: "bg-muted/50 text-muted-foreground border-muted/30" },
      in_progress: { label: "В работе", className: "bg-blue-500/20 text-blue-600 border-blue-500/30" },
    };
    
    const variant = variants[status] || { label: status, className: "bg-muted text-muted-foreground" };
    
    return (
      <span className={cn("px-2 py-1 rounded text-xs font-medium border", variant.className)}>
        {variant.label}
      </span>
    );
  };
  
  return (
    <Card className="glass">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ChevronRight className={cn("h-5 w-5 transition-transform", isOpen && "rotate-90")} />
                Рентабельность заказов
                <span className="text-sm font-normal text-muted-foreground">
                  ({sortedOrders.length} {sortedOrders.length === 1 ? "заказ" : sortedOrders.length < 5 ? "заказа" : "заказов"})
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
                  placeholder="Поиск по номеру заказа, товару, SKU или артикулу..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10"
                />
              </div>
              
              {/* Фильтры */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Статус</label>
                  <Select
                    value={statusFilter}
                    onValueChange={(value) => {
                      setStatusFilter(value);
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="all">Все</SelectItem>
                       <SelectItem value="completed">Завершен</SelectItem>
                       <SelectItem value="returned">Возврат</SelectItem>
                       <SelectItem value="partial_return">Частичный возврат</SelectItem>
                       <SelectItem value="cancelled">Отменен</SelectItem>
                       <SelectItem value="in_progress">В работе</SelectItem>
                     </SelectContent>
                  </Select>
                </div>
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
                    value={minNetAmount}
                    onChange={(e) => {
                      setMinNetAmount(e.target.value);
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
                <div className="flex items-end">
                  <div className="flex items-center gap-2 w-full">
                    <input
                      type="checkbox"
                      id="showOnlyUnprofitableOrders"
                      checked={showOnlyUnprofitable}
                      onChange={(e) => {
                        setShowOnlyUnprofitable(e.target.checked);
                        setCurrentPage(1);
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                    />
                    <label htmlFor="showOnlyUnprofitableOrders" className="text-xs text-muted-foreground cursor-pointer">
                      Только убыточные
                    </label>
                  </div>
                </div>
              </div>
              
              {/* Кнопка сброса фильтров */}
              {(searchQuery || statusFilter !== "all" || minRevenue || minNetAmount || minNetProfit || showOnlyUnprofitable) && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Сбросить фильтры
                </Button>
              )}
            </div>
            
            {/* Панель с агрегированными суммами по отфильтрованным заказам */}
            {filteredOrders.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                <Card className="glass">
                  <CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground mb-1">Выручка</div>
                    <div className="text-lg font-semibold">{formatCurrency(filteredSummary.totalRevenue)}</div>
                    <div className="text-xs text-muted-foreground mt-1">{filteredSummary.ordersCount} заказов</div>
                  </CardContent>
                </Card>
                <Card className="glass">
                  <CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground mb-1">Начислено</div>
                    <div className={cn(
                      "text-lg font-semibold",
                      filteredSummary.totalNetAmount >= 0 ? "text-success" : "text-destructive"
                    )}>
                      {formatCurrency(filteredSummary.totalNetAmount)}
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
            {sortedOrders.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {groupedOrders.length === 0 ? "Нет заказов для отображения" : "Нет заказов, соответствующих фильтрам"}
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
                          onClick={() => handleSort("orderNumber")}
                        >
                          <div className="flex items-center">
                            Номер заказа
                            {getSortIcon("orderNumber")}
                          </div>
                        </th>
                        <th
                          className="text-left py-3 px-2 font-medium cursor-pointer hover:bg-muted/50 select-none"
                          onClick={() => handleSort("date")}
                        >
                          <div className="flex items-center">
                            Дата
                            {getSortIcon("date")}
                          </div>
                        </th>
                        <th className="text-left py-3 px-2 font-medium">Статус</th>
                        <th className="text-left py-3 px-2 font-medium">Товары</th>
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
                          onClick={() => handleSort("netAmount")}
                        >
                          <div className="flex items-center justify-end">
                            Начислено
                            {getSortIcon("netAmount")}
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
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedOrders.map((order) => {
                        const isExpanded = expandedOrders.has(order.orderNumber);
                        const hasMultipleProducts = order.products.length > 1;
                        
                        return (
                          <>
                            <tr 
                              key={order.orderNumber}
                              className={cn(
                                "border-b last:border-0 hover:bg-muted/30",
                                isExpanded && "bg-muted/20"
                              )}
                            >
                              <td className="py-3 px-2">
                                {(hasMultipleProducts || order.products.some(p => p.chargesCount > 1)) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => toggleOrder(order.orderNumber)}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                              </td>
                              <td className="py-3 px-2">
                                <div className="flex items-center gap-1">
                                  {order.isFromPreviousPeriod && (
                                    <span title="Заказ из прошлого периода, не все начисления в текущем периоде">
                                      <ArrowLeft className="h-3 w-3 text-muted-foreground" />
                                    </span>
                                  )}
                                  <span className="font-mono text-xs">{order.orderNumber}</span>
                                </div>
                              </td>
                              <td className="py-3 px-2 text-muted-foreground">
                                {order.date ? formatDate(order.date) : "-"}
                              </td>
                              <td className="py-3 px-2">
                                {getStatusBadge(order.status)}
                              </td>
                              <td className="py-3 px-2">
                                <div className="space-y-1">
                                  {order.products.slice(0, 1).map((p, idx) => (
                                    <div key={idx} className="max-w-[200px] truncate" title={p.productName}>
                                      {p.productName || "Без названия"}
                                    </div>
                                  ))}
                                  {order.products.length > 1 && (
                                    <div className="text-xs text-muted-foreground">
                                      +{order.products.length - 1} товар(ов)
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-2 text-right">{formatCurrency(order.grossRevenue)}</td>
                              <td className="py-3 px-2 text-right text-muted-foreground">
                                {order.totalCost > 0 ? formatCurrency(order.totalCost) : "-"}
                              </td>
                              <td className={cn(
                                "py-3 px-2 text-right font-medium",
                                order.netAmount >= 0 ? "text-success" : "text-destructive"
                              )}>
                                {formatCurrency(order.netAmount)}
                              </td>
                              <td className={cn(
                                "py-3 px-2 text-right font-semibold",
                                order.netProfit !== undefined
                                  ? (order.netProfit >= 0 ? "text-success" : "text-destructive")
                                  : "text-muted-foreground"
                              )}>
                                {order.netProfit !== undefined ? formatCurrency(order.netProfit) : "-"}
                              </td>
                              <td className={cn(
                                "py-3 px-2 text-right",
                                order.profitMargin !== undefined
                                  ? (order.profitMargin >= 15 ? "text-success" : order.profitMargin < 0 ? "text-destructive" : "")
                                  : "text-muted-foreground"
                              )}>
                                {order.profitMargin !== undefined ? `${order.profitMargin.toFixed(1)}%` : "-"}
                              </td>
                            </tr>
                            
                            {/* Детализация заказа */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={10} className="py-4 px-2 bg-muted/10">
                                  <div className="space-y-4 pl-6 border-l-2 border-primary/20">
                                    {/* Товары в заказе */}
                                    {hasMultipleProducts && (
                                      <div>
                                        <h4 className="text-sm font-semibold mb-2">Товары в заказе:</h4>
                                        <div className="space-y-2">
                                          {order.products.map((product, idx) => (
                                            <div key={idx} className="p-3 rounded-lg bg-muted/30 border border-border">
                                              <div className="flex items-start justify-between gap-4 mb-2">
                                                <div className="flex-1">
                                                  <div className="font-medium">{product.productName || "Без названия"}</div>
                                                  <div className="text-xs text-muted-foreground mt-1">
                                                    SKU: {product.sku || "-"} | Артикул: {product.article || "-"} | Кол-во: {product.quantity || 0}
                                                  </div>
                                                </div>
                                                <div className="text-right text-sm">
                                                  <div className="text-muted-foreground">Выручка: {formatCurrency(product.grossRevenue || 0)}</div>
                                                  {product.totalCost !== undefined && product.totalCost > 0 && (
                                                    <div className="text-muted-foreground">Себестоимость: {formatCurrency(product.totalCost)}</div>
                                                  )}
                                                  <div className={cn(
                                                    "font-medium",
                                                    (product.totalAmountRub || 0) >= 0 ? "text-success" : "text-destructive"
                                                  )}>
                                                    Начислено: {formatCurrency(product.totalAmountRub || 0)}
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Детализация начислений */}
                                    <div>
                                      <h4 className="text-sm font-semibold mb-2">Детализация начислений:</h4>
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                        <div className="p-2 rounded bg-muted/30">
                                          <div className="text-xs text-muted-foreground">Выручка</div>
                                          <div className="font-medium text-success">{formatCurrency(order.grossRevenue)}</div>
                                        </div>
                                        <div className="p-2 rounded bg-muted/30">
                                          <div className="text-xs text-muted-foreground">Комиссия</div>
                                          <div className="font-medium text-destructive">-{formatCurrency(order.commissionAmount)}</div>
                                        </div>
                                        <div className="p-2 rounded bg-muted/30">
                                          <div className="text-xs text-muted-foreground">Логистика</div>
                                          <div className="font-medium text-destructive">-{formatCurrency(order.logisticsAmount)}</div>
                                        </div>
                                        <div className="p-2 rounded bg-muted/30">
                                          <div className="text-xs text-muted-foreground">Эквайринг</div>
                                          <div className="font-medium text-destructive">-{formatCurrency(order.acquiringAmount)}</div>
                                        </div>
                                        {order.returnAmount > 0 && (
                                          <div className="p-2 rounded bg-muted/30">
                                            <div className="text-xs text-muted-foreground">Возвраты</div>
                                            <div className="font-medium text-destructive">-{formatCurrency(order.returnAmount)}</div>
                                          </div>
                                        )}
                                        {order.otherFeesAmount > 0 && (
                                          <div className="p-2 rounded bg-muted/30">
                                            <div className="text-xs text-muted-foreground">Прочие</div>
                                            <div className="font-medium text-destructive">-{formatCurrency(order.otherFeesAmount)}</div>
                                          </div>
                                        )}
                                        {order.totalCost > 0 && (
                                          <div className="p-2 rounded bg-primary/10">
                                            <div className="text-xs text-muted-foreground">Себестоимость</div>
                                            <div className="font-medium">-{formatCurrency(order.totalCost)}</div>
                                          </div>
                                        )}
                                        <div className={cn(
                                          "p-2 rounded font-semibold",
                                          order.netProfit !== undefined
                                            ? (order.netProfit >= 0 ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive")
                                            : "bg-muted/30"
                                        )}>
                                          <div className="text-xs text-muted-foreground">Чистая прибыль</div>
                                          <div className="font-medium">
                                            {order.netProfit !== undefined ? formatCurrency(order.netProfit) : formatCurrency(order.netAmount)}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Типы начислений по товарам */}
                                    {order.products.some(p => p.chargesCount > 1) && (
                                      <div>
                                        <h4 className="text-sm font-semibold mb-2">Типы начислений:</h4>
                                        <div className="flex flex-wrap gap-2">
                                          {Array.from(new Set(order.products.flatMap(p => p.chargeTypes || []))).map((chargeType, idx) => (
                                            <span 
                                              key={idx}
                                              className="px-2 py-1 rounded text-xs bg-muted/50 text-muted-foreground"
                                            >
                                              {chargeType}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
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
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
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
                    Показано {paginatedOrders.length} из {sortedOrders.length}
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
