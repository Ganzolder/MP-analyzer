"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Filter } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { ProductData, CancellationReason } from "@/lib/types/analysis";
import type { DailyMetrics } from "@/lib/analysis/types";
import type { TimeGranularity, ProfitTrend } from "@/lib/utils/date-grouping";
import {
  groupMetricsByGranularity,
  filterMetricsByPeriod,
  convertToProfitTrend,
  formatDateForGranularity,
} from "@/lib/utils/date-grouping";

// Цвета для графиков
const CHART_COLORS = {
  primary: "hsl(263, 70%, 58%)",
  secondary: "hsl(173, 80%, 40%)",
  accent: "hsl(38, 92%, 50%)",
  success: "hsl(142, 76%, 45%)",
  destructive: "hsl(0, 84%, 60%)",
  muted: "hsl(215, 20%, 65%)",
};

// Кастомный тултип
const CustomTooltip = ({ active, payload, label, formatter }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
  formatter?: (value: number) => string;
}) => {
  if (!active || !payload?.length) return null;
  
  return (
    <div className="glass-card p-3 shadow-xl">
      <p className="text-sm font-medium mb-2">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">
            {formatter ? formatter(entry.value) : formatNumber(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

// График динамики прибыли
interface ProfitChartProps {
  data: ProfitTrend[];
  dailyMetrics?: DailyMetrics[]; // Исходные данные по дням для фильтрации
  periodStart?: Date;
  periodEnd?: Date;
}

export function ProfitChart({ data, dailyMetrics, periodStart, periodEnd }: ProfitChartProps) {
  const [granularity, setGranularity] = useState<TimeGranularity>("day");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [showNetProfit, setShowNetProfit] = useState(false); // Переключатель чистой прибыли

  // Если есть dailyMetrics, используем их для фильтрации и группировки
  const processedData = useMemo(() => {
    // Отладка
    if (typeof window !== 'undefined') {
      console.log('[ProfitChart] dailyMetrics:', dailyMetrics?.length || 0, 'записей');
      console.log('[ProfitChart] data (profitTrends):', data?.length || 0, 'записей');
      if (dailyMetrics && dailyMetrics.length > 0) {
        console.log('[ProfitChart] Первая запись dailyMetrics:', dailyMetrics[0]);
      }
      if (data && data.length > 0) {
        console.log('[ProfitChart] Первая запись data:', data[0]);
      }
    }
    
    // Если есть dailyMetrics с данными, используем их (приоритет)
    if (dailyMetrics && Array.isArray(dailyMetrics) && dailyMetrics.length > 0) {
      console.log('[ProfitChart] dailyMetrics до фильтрации:', dailyMetrics.length, 'записей');
      if (dailyMetrics.length > 0) {
        console.log('   Первая дата:', dailyMetrics[0].date);
        console.log('   Последняя дата:', dailyMetrics[dailyMetrics.length - 1].date);
      }
      
      // Фильтруем по периоду только если указаны даты фильтра
      const startDate = filterStartDate ? new Date(filterStartDate) : (periodStart || null);
      const endDate = filterEndDate ? new Date(filterEndDate) : (periodEnd || null);
      
      console.log('[ProfitChart] Параметры фильтрации:', {
        filterStartDate,
        filterEndDate,
        periodStart: periodStart?.toISOString(),
        periodEnd: periodEnd?.toISOString(),
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
      });
      
      // Если нет явных фильтров, не фильтруем (используем все данные)
      let filtered = dailyMetrics;
      if (filterStartDate || filterEndDate || (periodStart && periodEnd)) {
        filtered = filterMetricsByPeriod(dailyMetrics, startDate, endDate);
        console.log('[ProfitChart] После фильтрации:', filtered.length, 'записей');
      } else {
        console.log('[ProfitChart] Фильтрация не применяется, используем все данные');
      }

      // Если после фильтрации данных нет, но есть исходные данные - используем их без фильтра
      if (filtered.length === 0 && dailyMetrics.length > 0) {
        console.warn('[ProfitChart] После фильтрации данных нет, используем все dailyMetrics без фильтра');
        filtered = dailyMetrics;
      }

      // Группируем по градации
      const grouped = groupMetricsByGranularity(filtered, granularity);

      // Преобразуем в ProfitTrend
      const result = convertToProfitTrend(grouped);
      console.log('[ProfitChart] Обработано dailyMetrics:', result.length, 'записей');
      
      // Выводим первые 3 записи для проверки
      if (result.length > 0) {
        console.log('\n📊 [ProfitChart] Первые 3 записи данных для графика:');
        result.slice(0, 3).forEach((item, index) => {
          console.log(`   ${index + 1}.`, {
            date: item.date,
            revenue: item.revenue,
            costs: item.costs,
            profit: item.profit,
            orders: item.orders,
            totalCost: item.totalCost,
            netProfit: item.netProfit,
          });
        });
      }
      
      return result;
    }
    
    // Если dailyMetrics нет, используем data (profitTrends) как fallback
    if (data && data.length > 0) {
      console.log('[ProfitChart] Используем data (profitTrends) как fallback:', data.length, 'записей');
      
      // Выводим первые 3 записи для проверки
      console.log('\n📊 [ProfitChart] Первые 3 записи данных для графика (из profitTrends):');
      data.slice(0, 3).forEach((item, index) => {
        console.log(`   ${index + 1}.`, {
          date: item.date,
          revenue: item.revenue,
          costs: item.costs,
          profit: item.profit,
          orders: item.orders,
          totalCost: item.totalCost,
          netProfit: item.netProfit,
        });
      });
      
      return data;
    }
    
    console.warn('[ProfitChart] Нет данных ни в dailyMetrics, ни в data');
    return [];
  }, [dailyMetrics, granularity, filterStartDate, filterEndDate, periodStart, periodEnd, data]);

  // Проверка на пустые данные
  if (!processedData || processedData.length === 0) {
    return (
      <Card glass>
        <CardHeader>
          <CardTitle>Обзор по динамике</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            <p>Нет данных для отображения</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card glass>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Обзор по динамике</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Filter className="h-4 w-4" />
            Фильтры
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Фильтры */}
        {showFilters && (
          <div className="mb-6 p-4 rounded-lg bg-muted/30 space-y-4 border border-border">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Градация */}
              <div className="space-y-2">
                <Label htmlFor="granularity">Градация</Label>
                <Select
                  value={granularity}
                  onValueChange={(value) => setGranularity(value as TimeGranularity)}
                >
                  <SelectTrigger id="granularity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">День</SelectItem>
                    <SelectItem value="week">Неделя</SelectItem>
                    <SelectItem value="month">Месяц</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Период начала */}
              <div className="space-y-2">
                <Label htmlFor="startDate">Период с</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  placeholder="Начало периода"
                />
              </div>

              {/* Период окончания */}
              <div className="space-y-2">
                <Label htmlFor="endDate">Период по</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  placeholder="Конец периода"
                />
              </div>
            </div>

            {/* Кнопка сброса фильтров */}
            {(filterStartDate || filterEndDate || granularity !== "day") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterStartDate("");
                  setFilterEndDate("");
                  setGranularity("day");
                }}
                className="w-full md:w-auto"
              >
                Сбросить фильтры
              </Button>
            )}
          </div>
        )}

        <Tabs defaultValue="profit" className="w-full">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="profit">Прибыль</TabsTrigger>
              <TabsTrigger value="revenue">Выручка</TabsTrigger>
              <TabsTrigger value="orders">Заказы</TabsTrigger>
            </TabsList>
            
            {/* Переключатель чистой прибыли */}
            {processedData.some(d => d.netProfit !== undefined) && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showNetProfit"
                  checked={showNetProfit}
                  onChange={(e) => setShowNetProfit(e.target.checked)}
                  className="h-4 w-4 rounded border-input cursor-pointer"
                />
                <Label htmlFor="showNetProfit" className="text-sm cursor-pointer">
                  Показать чистую прибыль
                </Label>
              </div>
            )}
          </div>
          
          <TabsContent value="profit" className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={processedData}>
                <defs>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                  {showNetProfit && (
                    <linearGradient id="colorNetProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0} />
                    </linearGradient>
                  )}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={(value) => formatDateForGranularity(value, granularity)}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip formatter={formatCurrency} />} />
                <Area
                  type="monotone"
                  dataKey="profit"
                  name="Прибыль"
                  stroke={CHART_COLORS.primary}
                  fill="url(#colorProfit)"
                  strokeWidth={2}
                />
                {showNetProfit && (
                  <Area
                    type="monotone"
                    dataKey="netProfit"
                    name="Чистая прибыль"
                    stroke={CHART_COLORS.success}
                    fill="url(#colorNetProfit)"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </TabsContent>
          
          <TabsContent value="revenue" className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={processedData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.secondary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.secondary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={(value) => formatDateForGranularity(value, granularity)}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip formatter={formatCurrency} />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Выручка"
                  stroke={CHART_COLORS.secondary}
                  fill="url(#colorRevenue)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </TabsContent>
          
          <TabsContent value="orders" className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={processedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={(value) => formatDateForGranularity(value, granularity)}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="orders" name="Заказы" fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Круговая диаграмма начислений
interface CostBreakdownItem {
  category: string;
  amount: number;
  color: string;
  percent: number;
}

interface CostPieChartProps {
  data: CostBreakdownItem[];
}

export function CostPieChart({ data }: CostPieChartProps) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle>Структура начислений</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="amount"
                nameKey="category"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0].payload as CostBreakdownItem;
                  return (
                    <div className="glass-card p-3 shadow-xl">
                      <p className="text-sm font-medium">{data.category}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(data.amount)} ({data.percent}%)
                      </p>
                    </div>
                  );
                }}
              />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                formatter={(value) => (
                  <span className="text-sm text-muted-foreground">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// Топ товары по прибыли
interface TopProductsChartProps {
  data: ProductData[];
}

export function TopProductsChart({ data }: TopProductsChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card glass>
        <CardHeader>
          <CardTitle>Топ-10 товаров по прибыли</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] flex items-center justify-center text-muted-foreground">
            <p>Нет данных для отображения</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  const chartData = data.slice(0, 10).map((item) => ({
    ...item,
    shortName: (item.name || "Без названия").length > 25 
      ? (item.name || "Без названия").slice(0, 25) + "..." 
      : (item.name || "Без названия"),
  }));
  
  return (
    <Card glass>
      <CardHeader>
        <CardTitle>Топ-10 товаров по прибыли</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              />
              <YAxis
                type="category"
                dataKey="shortName"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                width={150}
              />
              <Tooltip content={<CustomTooltip formatter={formatCurrency} />} />
              <Bar dataKey="profit" name="Прибыль" fill={CHART_COLORS.success} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// Причины отмен
interface CancellationChartProps {
  data: CancellationReason[];
  title: string;
}

export function CancellationChart({ data, title }: CancellationChartProps) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis
                type="category"
                dataKey="reason"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                width={140}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0].payload as CancellationReason;
                  return (
                    <div className="glass-card p-3 shadow-xl">
                      <p className="text-sm font-medium">{data.reason}</p>
                      <p className="text-sm text-muted-foreground">
                        {data.count} ({data.percent}%)
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" name="Количество" fill={CHART_COLORS.destructive} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
