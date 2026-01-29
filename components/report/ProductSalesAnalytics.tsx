"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
} from "recharts";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Search, Calendar, ChevronRight } from "lucide-react";
import type { AggregatedOrder } from "@/lib/analysis/types";
import type { ProductData } from "@/lib/types/analysis";
import type { TimeGranularity } from "@/lib/utils/date-grouping";
import { AIAnalysisButton } from "@/components/analysis/AIAnalysisButton";
import { prepareSingleProductContext } from "@/lib/ai/context-preparer";

interface ProductSalesAnalyticsProps {
  product: ProductData | null;
  orders: AggregatedOrder[];
  analysisId?: string;
  summary?: any;
  isOpen: boolean;
  onClose: () => void;
}

interface DailyProductData {
  date: string;
  dateObj: Date;
  revenue: number;
  netAmount: number;
  netProfit: number;
  profitMargin: number;
  ordersCount: number;
  avgPrice: number;
  avgCommission: number;
  avgCommissionPercent: number;
  totalCost: number;
  quantity: number;
  orders?: AggregatedOrder[];
}

// Функция для группировки даты по периоду
function getDateKey(date: Date, granularity: TimeGranularity): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  
  if (granularity === "day") {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  } else if (granularity === "week") {
    // Получаем номер недели (ISO week)
    const d = new Date(Date.UTC(year, month, day));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${year}-W${String(weekNum).padStart(2, "0")}`;
  } else if (granularity === "month") {
    return `${year}-${String(month + 1).padStart(2, "0")}`;
  }
  return date.toISOString().split('T')[0];
}

// Функция для форматирования даты в зависимости от периода
function formatDateForGranularity(dateKey: string, granularity: TimeGranularity): string {
  if (granularity === "day") {
    return formatDate(new Date(dateKey));
  } else if (granularity === "week") {
    const [year, week] = dateKey.split('-W');
    return `Неделя ${week}, ${year}`;
  } else if (granularity === "month") {
    const [year, month] = dateKey.split('-');
    const monthNames = [
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  }
  return dateKey;
}

export function ProductSalesAnalytics({
  product,
  orders,
  analysisId,
  summary,
  isOpen,
  onClose,
}: ProductSalesAnalyticsProps) {
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [granularity, setGranularity] = useState<TimeGranularity>("day");
  const [searchQuery, setSearchQuery] = useState("");

  // Фильтруем заказы по товару
  const productOrders = useMemo(() => {
    if (!product) return [];
    
    // Используем SKU или артикул для поиска
    const productKey = (product.sku || product.article || "").trim();
    if (!productKey) return [];
    
    return orders
      .filter(order => {
        const orderSku = (order.sku || "").trim();
        const orderArticle = (order.article || "").trim();
        // Сравниваем по SKU или артикулу
        return orderSku === productKey || orderArticle === productKey;
      })
      .map(order => ({
        ...order,
        // Преобразуем chargeDate в Date, если это строка
        chargeDate: order.chargeDate instanceof Date 
          ? order.chargeDate 
          : new Date(order.chargeDate),
        // Также преобразуем orderDate, если нужно
        orderDate: order.orderDate 
          ? (order.orderDate instanceof Date ? order.orderDate : new Date(order.orderDate))
          : null,
      }))
      .sort((a, b) => a.chargeDate.getTime() - b.chargeDate.getTime());
  }, [product, orders]);

  // Группируем заказы по выбранному периоду
  const dailyData = useMemo(() => {
    if (productOrders.length === 0) return [];

    const dailyMap = new Map<string, DailyProductData>();

    productOrders.forEach(order => {
      const dateKey = getDateKey(order.chargeDate, granularity);
      // Для создания dateObj используем первый день периода
      let dateObj: Date;
      if (granularity === "day") {
        dateObj = new Date(order.chargeDate);
        dateObj.setHours(0, 0, 0, 0);
      } else if (granularity === "week") {
        // Берем понедельник недели
        const d = new Date(order.chargeDate);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        dateObj = new Date(d.setDate(diff));
        dateObj.setHours(0, 0, 0, 0);
      } else {
        // Месяц - первый день месяца
        dateObj = new Date(order.chargeDate.getFullYear(), order.chargeDate.getMonth(), 1);
      }
      
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          date: dateKey,
          dateObj,
          revenue: 0,
          netAmount: 0,
          netProfit: 0,
          profitMargin: 0,
          ordersCount: 0,
          avgPrice: 0,
          avgCommission: 0,
          avgCommissionPercent: 0,
          totalCost: 0,
          quantity: 0,
          orders: [],
        });
      }

      const dayData = dailyMap.get(dateKey)!;
      dayData.revenue += order.grossRevenue || 0;
      dayData.netAmount += order.totalAmountRub || 0;
      dayData.ordersCount += 1;
      dayData.quantity += order.quantity || 0;
      dayData.orders!.push(order);
      
      // Себестоимость учитываем только если есть выручка (иначе это возвраты/отмена/прочие случаи)
      if ((order.grossRevenue || 0) > 0 && order.totalCost !== undefined && order.totalCost > 0) {
        dayData.totalCost += order.totalCost;
        dayData.netProfit += (order.totalAmountRub - order.totalCost);
      } else {
        // Если выручки нет, себестоимость не учитываем, чистая прибыль = начислено
        dayData.netProfit += order.totalAmountRub || 0;
      }

      // Средняя цена (выручка / количество)
      if (order.quantity > 0 && order.grossRevenue > 0) {
        const price = order.grossRevenue / order.quantity;
        dayData.avgPrice = (dayData.avgPrice * (dayData.ordersCount - 1) + price) / dayData.ordersCount;
      }

      // Средняя комиссия
      if (order.commissionAmount > 0) {
        dayData.avgCommission = (dayData.avgCommission * (dayData.ordersCount - 1) + order.commissionAmount) / dayData.ordersCount;
      }

      // Средний процент комиссии
      if (order.grossRevenue > 0 && order.commissionAmount > 0) {
        const commissionPercent = (order.commissionAmount / order.grossRevenue) * 100;
        dayData.avgCommissionPercent = (dayData.avgCommissionPercent * (dayData.ordersCount - 1) + commissionPercent) / dayData.ordersCount;
      }
    });

    // Рассчитываем рентабельность для каждого дня
    Array.from(dailyMap.values()).forEach(day => {
      if (day.revenue > 0) {
        if (day.totalCost > 0) {
          day.profitMargin = (day.netProfit / day.revenue) * 100;
        } else {
          day.profitMargin = (day.netAmount / day.revenue) * 100;
        }
      }
    });

    return Array.from(dailyMap.values()).sort((a, b) => 
      a.dateObj.getTime() - b.dateObj.getTime()
    );
  }, [productOrders, granularity]);

  // Фильтруем данные по поисковому запросу
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return dailyData;
    
    const query = searchQuery.toLowerCase().trim();
    return dailyData.filter(day => {
      const dateStr = formatDateForGranularity(day.date, granularity).toLowerCase();
      return dateStr.includes(query);
    });
  }, [dailyData, searchQuery, granularity]);

  // Раскрытие строк в таблице детализации
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());
  const togglePeriod = (dateKey: string) => {
    setExpandedPeriods(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  };

  // Кастомный тултип
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    return (
      <div className="glass-card p-3 shadow-xl rounded-lg border">
        <p className="text-sm font-medium mb-2">{formatDateForGranularity(label, granularity)}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-medium">
              {entry.dataKey === "profitMargin" || entry.dataKey === "avgCommissionPercent"
                ? `${entry.value.toFixed(1)}%`
                : formatCurrency(entry.value)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  if (!product) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle>Аналитика продаж: {product.name || product.sku}</DialogTitle>
              <DialogDescription>
                Динамика продаж, рентабельности и изменения цен
                {product.sku && ` • SKU: ${product.sku}`}
                {product.article && ` • Артикул: ${product.article}`}
              </DialogDescription>
            </div>
            {analysisId && (
              <div className="ml-4">
                <AIAnalysisButton
                  analysisId={analysisId}
                  analysisType="products"
                  analysisData={prepareSingleProductContext(product, orders, summary)}
                  label="AI Анализ"
                  className="h-9"
                />
              </div>
            )}
          </div>
        </DialogHeader>

        {dailyData.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            Нет данных для отображения
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            {/* Поиск и фильтры */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по дате..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={granularity}
                  onValueChange={(value) => setGranularity(value as TimeGranularity)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Дни</SelectItem>
                    <SelectItem value="week">Недели</SelectItem>
                    <SelectItem value="month">Месяцы</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Сводка */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="p-3 rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground">Всего заказов</div>
                <div className="text-lg font-semibold">{productOrders.length}</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground">Выручка</div>
                <div className="text-lg font-semibold text-success">
                  {formatCurrency((product as any).revenue || 0)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground">Начислено</div>
                <div className={cn(
                  "text-lg font-semibold",
                  ((product as any).profit || 0) >= 0 ? "text-success" : "text-destructive"
                )}>
                  {formatCurrency((product as any).profit || 0)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground">Рентабельность</div>
                <div className={cn(
                  "text-lg font-semibold",
                  (product as any).profitMargin !== undefined
                    ? ((product as any).profitMargin >= 15 ? "text-success" : (product as any).profitMargin < 0 ? "text-destructive" : "")
                    : "text-muted-foreground"
                )}>
                  {(product as any).profitMargin !== undefined ? `${(product as any).profitMargin.toFixed(1)}%` : "-"}
                </div>
              </div>
            </div>

            {/* График динамики рентабельности */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Динамика рентабельности</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setChartType("line")}
                    className={cn(
                      "px-3 py-1 rounded text-sm transition-colors",
                      chartType === "line"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    Линия
                  </button>
                  <button
                    onClick={() => setChartType("bar")}
                    className={cn(
                      "px-3 py-1 rounded text-sm transition-colors",
                      chartType === "bar"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    Столбцы
                  </button>
                </div>
              </div>
              
              <ResponsiveContainer width="100%" height={300}>
                {chartType === "line" ? (
                  <LineChart data={filteredData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => formatDateForGranularity(value, granularity)}
                      style={{ fontSize: "12px" }}
                    />
                    <YAxis
                      yAxisId="left"
                      tickFormatter={(value) => `${value}%`}
                      style={{ fontSize: "12px" }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="profitMargin"
                      name="Рентабельность, %"
                      stroke="hsl(142, 76%, 45%)"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                ) : (
                  <BarChart data={filteredData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => formatDateForGranularity(value, granularity)}
                      style={{ fontSize: "12px" }}
                    />
                    <YAxis
                      tickFormatter={(value) => `${value}%`}
                      style={{ fontSize: "12px" }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar
                      dataKey="profitMargin"
                      name="Рентабельность, %"
                      fill="hsl(142, 76%, 45%)"
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* График выручки и начислений */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Выручка и начисления</h3>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={filteredData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => formatDateForGranularity(value, granularity)}
                    style={{ fontSize: "12px" }}
                  />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={(value) => formatCurrency(value)}
                    style={{ fontSize: "12px" }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="revenue"
                    name="Выручка"
                    fill="hsl(142, 76%, 45%)"
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="netAmount"
                    name="Начислено"
                    fill="hsl(263, 70%, 58%)"
                  />
                  {filteredData.some(d => d.totalCost > 0) && (
                    <Bar
                      yAxisId="left"
                      dataKey="netProfit"
                      name="Чистая прибыль"
                      fill="hsl(38, 92%, 50%)"
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* График средней цены и комиссии */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Средняя цена и комиссия</h3>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={filteredData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => formatDateForGranularity(value, granularity)}
                    style={{ fontSize: "12px" }}
                  />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={(value) => formatCurrency(value)}
                    style={{ fontSize: "12px" }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(value) => `${value}%`}
                    style={{ fontSize: "12px" }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="avgPrice"
                    name="Средняя цена"
                    fill="hsl(173, 80%, 40%)"
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="avgCommission"
                    name="Средняя комиссия"
                    fill="hsl(0, 84%, 60%)"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="avgCommissionPercent"
                    name="% комиссии"
                    stroke="hsl(38, 92%, 50%)"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Таблица детализации */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Детализация</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 font-medium">Период</th>
                      <th className="text-right py-2 px-2 font-medium">Заказов</th>
                      <th className="text-right py-2 px-2 font-medium">Кол-во</th>
                      <th className="text-right py-2 px-2 font-medium">Выручка</th>
                      <th className="text-right py-2 px-2 font-medium">Начислено</th>
                      <th className="text-right py-2 px-2 font-medium">Чистая прибыль</th>
                      <th className="text-right py-2 px-2 font-medium">Рентабельность</th>
                      <th className="text-right py-2 px-2 font-medium">Средняя цена</th>
                      <th className="text-right py-2 px-2 font-medium">% комиссии</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((period, idx) => {
                      const isExpanded = expandedPeriods.has(period.date);
                      const ordersInPeriod: AggregatedOrder[] = Array.isArray(period.orders) ? period.orders : [];

                      return (
                        <>
                          <tr
                            key={idx}
                            className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                            onClick={() => togglePeriod(period.date)}
                          >
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-2">
                                <ChevronRight
                                  className={cn(
                                    "h-4 w-4 text-muted-foreground transition-transform",
                                    isExpanded && "rotate-90"
                                  )}
                                />
                                <span>{formatDateForGranularity(period.date, granularity)}</span>
                              </div>
                            </td>
                            <td className="py-2 px-2 text-right">{period.ordersCount}</td>
                            <td className="py-2 px-2 text-right">{period.quantity}</td>
                            <td className="py-2 px-2 text-right">{formatCurrency(period.revenue)}</td>
                            <td className={cn(
                              "py-2 px-2 text-right",
                              period.netAmount >= 0 ? "text-success" : "text-destructive"
                            )}>
                              {formatCurrency(period.netAmount)}
                            </td>
                            <td className={cn(
                              "py-2 px-2 text-right",
                              period.netProfit >= 0 ? "text-success" : "text-destructive"
                            )}>
                              {period.totalCost > 0 ? formatCurrency(period.netProfit) : "-"}
                            </td>
                            <td className={cn(
                              "py-2 px-2 text-right",
                              period.profitMargin >= 15 ? "text-success" : period.profitMargin < 0 ? "text-destructive" : ""
                            )}>
                              {period.profitMargin.toFixed(1)}%
                            </td>
                            <td className="py-2 px-2 text-right text-muted-foreground">
                              {period.avgPrice > 0 ? formatCurrency(period.avgPrice) : "-"}
                            </td>
                            <td className="py-2 px-2 text-right text-muted-foreground">
                              {period.avgCommissionPercent > 0 ? `${period.avgCommissionPercent.toFixed(1)}%` : "-"}
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="border-b last:border-0 bg-muted/10">
                              <td className="py-3 px-2" colSpan={9}>
                                <div className="space-y-2">
                                  <div className="text-sm font-semibold">Из чего сложилась сумма (заказы в периоде)</div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="border-b">
                                          <th className="text-left py-2 px-2 font-medium">Заказ</th>
                                          <th className="text-left py-2 px-2 font-medium">Дата</th>
                                          <th className="text-left py-2 px-2 font-medium">Статус</th>
                                          <th className="text-right py-2 px-2 font-medium">Кол-во</th>
                                          <th className="text-right py-2 px-2 font-medium">Выручка</th>
                                          <th className="text-right py-2 px-2 font-medium">Начислено</th>
                                          <th className="text-right py-2 px-2 font-medium">Комиссия</th>
                                          <th className="text-right py-2 px-2 font-medium">Логистика</th>
                                          <th className="text-right py-2 px-2 font-medium">Эквайринг</th>
                                          <th className="text-right py-2 px-2 font-medium">Себестоимость</th>
                                          <th className="text-right py-2 px-2 font-medium">Чистая прибыль</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {ordersInPeriod.length === 0 ? (
                                          <tr>
                                            <td className="py-2 px-2 text-muted-foreground" colSpan={11}>
                                              Нет заказов для детализации
                                            </td>
                                          </tr>
                                        ) : (
                                          ordersInPeriod
                                            .slice()
                                            .sort((a, b) => a.chargeDate.getTime() - b.chargeDate.getTime())
                                            .slice(0, 200)
                                            .map((o) => {
                                              const hasRevenue = (o.grossRevenue || 0) > 0;
                                              const hasCost = hasRevenue && !!o.totalCost && o.totalCost > 0;
                                              const netProfit = hasCost
                                                ? (o.totalAmountRub || 0) - (o.totalCost || 0)
                                                : (o.totalAmountRub || 0);
                                              return (
                                                <tr key={`${o.orderNumber}-${o.chargeDate.toISOString()}`} className="border-b last:border-0 hover:bg-muted/20">
                                                  <td className="py-2 px-2 font-medium">{o.orderNumber}</td>
                                                  <td className="py-2 px-2 text-muted-foreground">{formatDate(o.chargeDate)}</td>
                                                  <td className="py-2 px-2 text-muted-foreground">{o.status}</td>
                                                  <td className="py-2 px-2 text-right">{o.quantity || 0}</td>
                                                  <td className="py-2 px-2 text-right">{formatCurrency(o.grossRevenue || 0)}</td>
                                                  <td className={cn("py-2 px-2 text-right", (o.totalAmountRub || 0) >= 0 ? "text-success" : "text-destructive")}>
                                                    {formatCurrency(o.totalAmountRub || 0)}
                                                  </td>
                                                  <td className="py-2 px-2 text-right text-muted-foreground">{formatCurrency(o.commissionAmount || 0)}</td>
                                                  <td className="py-2 px-2 text-right text-muted-foreground">{formatCurrency(o.logisticsAmount || 0)}</td>
                                                  <td className="py-2 px-2 text-right text-muted-foreground">{formatCurrency(o.acquiringAmount || 0)}</td>
                                                  <td className="py-2 px-2 text-right text-muted-foreground">
                                                    {hasCost ? formatCurrency(o.totalCost || 0) : "-"}
                                                  </td>
                                                  <td className={cn("py-2 px-2 text-right", netProfit >= 0 ? "text-success" : "text-destructive")}>
                                                    {formatCurrency(netProfit)}
                                                  </td>
                                                </tr>
                                              );
                                            })
                                        )}
                                        {ordersInPeriod.length > 200 && (
                                          <tr>
                                            <td className="py-2 px-2 text-muted-foreground" colSpan={11}>
                                              Показаны первые 200 строк (всего {ordersInPeriod.length})
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
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
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
