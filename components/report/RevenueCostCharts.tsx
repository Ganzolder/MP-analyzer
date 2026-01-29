"use client";

import { useState, useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface ChargeGroup {
  groupName: string;
  amount: number;
  count: number;
  chargeTypes: any[];
}

interface RevenueCostChartsProps {
  chargeTypeBreakdown: ChargeGroup[];
}

// Цвета для групп
const GROUP_COLORS: Record<string, string> = {
  "Вознаграждение OZON": "#ef4444",
  "Вознаграждение OZON возврат": "#f87171",
  "Логистика": "#f97316",
  "Логистика возврат": "#fb923c",
  "Эквайринг": "#eab308",
  "Подписка": "#8b5cf6",
  "Продвижение": "#3b82f6",
  "Штрафы": "#ec4899",
  "Штрафы возврат": "#f472b6",
  "Прочие": "#6b7280",
  "Выручка": "#22c55e",
  "Выручка возврат": "#86efac",
  "Баллы": "#fbbf24",
  "Выплата": "#06b6d4",
  "Бухгалтерские": "#a855f7",
};

// Палитра для автоматической генерации цветов
const COLOR_PALETTE = [
  "#22c55e", "#3b82f6", "#8b5cf6", "#f97316", "#eab308",
  "#06b6d4", "#a855f7", "#ec4899", "#6b7280", "#ef4444",
];

function getGroupColor(groupName: string, index: number): string {
  if (GROUP_COLORS[groupName]) {
    return GROUP_COLORS[groupName];
  }
  return COLOR_PALETTE[index % COLOR_PALETTE.length];
}

export function RevenueCostCharts({ chargeTypeBreakdown }: RevenueCostChartsProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [positiveFilterGroup, setPositiveFilterGroup] = useState<string>("Все");
  const [positiveSearchTerm, setPositiveSearchTerm] = useState<string>("");
  const [negativeFilterGroup, setNegativeFilterGroup] = useState<string>("Все");
  const [negativeSearchTerm, setNegativeSearchTerm] = useState<string>("");

  // Разделяем на положительные и отрицательные группы (без фильтров)
  const { allPositiveGroups, allNegativeGroups } = useMemo(() => {
    const positive: ChargeGroup[] = [];
    const negative: ChargeGroup[] = [];

    chargeTypeBreakdown.forEach((group) => {
      if (group.amount > 0) {
        positive.push(group);
      } else if (group.amount < 0) {
        negative.push(group);
      }
    });

    // Сортируем по абсолютному значению суммы
    positive.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    negative.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    return { allPositiveGroups: positive, allNegativeGroups: negative };
  }, [chargeTypeBreakdown]);

  // Получаем уникальные группы для фильтров
  const positiveGroupsList = useMemo(() => {
    return ["Все", ...allPositiveGroups.map((g) => g.groupName)];
  }, [allPositiveGroups]);

  const negativeGroupsList = useMemo(() => {
    return ["Все", ...allNegativeGroups.map((g) => g.groupName)];
  }, [allNegativeGroups]);

  // Применяем фильтры к положительным группам
  const positiveGroups = useMemo(() => {
    let filtered = allPositiveGroups;

    // Фильтр по группе
    if (positiveFilterGroup !== "Все") {
      filtered = filtered.filter((g) => g.groupName === positiveFilterGroup);
    }

    // Фильтр по поиску
    if (positiveSearchTerm) {
      const query = positiveSearchTerm.toLowerCase();
      filtered = filtered.filter((g) =>
        g.groupName.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [allPositiveGroups, positiveFilterGroup, positiveSearchTerm]);

  // Применяем фильтры к отрицательным группам
  const negativeGroups = useMemo(() => {
    let filtered = allNegativeGroups;

    // Фильтр по группе
    if (negativeFilterGroup !== "Все") {
      filtered = filtered.filter((g) => g.groupName === negativeFilterGroup);
    }

    // Фильтр по поиску
    if (negativeSearchTerm) {
      const query = negativeSearchTerm.toLowerCase();
      filtered = filtered.filter((g) =>
        g.groupName.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [allNegativeGroups, negativeFilterGroup, negativeSearchTerm]);

  // Подготавливаем данные для положительных поступлений
  const positiveData = useMemo(() => {
    const total = positiveGroups.reduce((sum, g) => sum + g.amount, 0);
    return positiveGroups.map((group, index) => ({
      category: group.groupName,
      amount: group.amount,
      percent: total > 0 ? (group.amount / total) * 100 : 0,
      color: getGroupColor(group.groupName, index),
      count: group.count,
    }));
  }, [positiveGroups]);

  // Подготавливаем данные для отрицательных поступлений
  const negativeData = useMemo(() => {
    const total = Math.abs(negativeGroups.reduce((sum, g) => sum + g.amount, 0));
    return negativeGroups.map((group, index) => ({
      category: group.groupName,
      amount: Math.abs(group.amount),
      percent: total > 0 ? (Math.abs(group.amount) / total) * 100 : 0,
      color: getGroupColor(group.groupName, index),
      count: group.count,
    }));
  }, [negativeGroups]);

  const totalPositive = positiveGroups.reduce((sum, g) => sum + g.amount, 0);
  const totalNegative = Math.abs(negativeGroups.reduce((sum, g) => sum + g.amount, 0));

  const hasActivePositiveFilters = positiveFilterGroup !== "Все" || positiveSearchTerm !== "";
  const hasActiveNegativeFilters = negativeFilterGroup !== "Все" || negativeSearchTerm !== "";

  return (
    <div className="space-y-6">
      {/* Фильтры */}
      <Card className="glass">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              Фильтры
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              {showFilters ? "Скрыть" : "Показать"}
            </Button>
          </div>
        </CardHeader>
        {showFilters && (
          <CardContent className="space-y-6">
            {/* Фильтр для положительных поступлений */}
            <div className="space-y-4 p-4 rounded-lg border border-success/30 bg-success/5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-success">Положительные поступления</CardTitle>
                {hasActivePositiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPositiveFilterGroup("Все");
                      setPositiveSearchTerm("");
                    }}
                    className="gap-2 h-7"
                  >
                    <X className="h-3 w-3" />
                    Сбросить
                  </Button>
                )}
              </div>
              
              {/* Поиск по положительным */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по группе..."
                  value={positiveSearchTerm}
                  onChange={(e) => setPositiveSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Фильтр по группе для положительных */}
              <div className="flex flex-wrap gap-2">
                {positiveGroupsList.slice(0, 8).map((group) => (
                  <Button
                    key={group}
                    variant={positiveFilterGroup === group ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPositiveFilterGroup(group)}
                    className={positiveFilterGroup === group ? "bg-success text-success-foreground" : ""}
                  >
                    {group}
                  </Button>
                ))}
                {positiveGroupsList.length > 8 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="text-muted-foreground"
                  >
                    +{positiveGroupsList.length - 8} ещё
                  </Button>
                )}
              </div>
            </div>

            {/* Фильтр для отрицательных поступлений */}
            <div className="space-y-4 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-destructive">Отрицательные поступления</CardTitle>
                {hasActiveNegativeFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setNegativeFilterGroup("Все");
                      setNegativeSearchTerm("");
                    }}
                    className="gap-2 h-7"
                  >
                    <X className="h-3 w-3" />
                    Сбросить
                  </Button>
                )}
              </div>
              
              {/* Поиск по отрицательным */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по группе..."
                  value={negativeSearchTerm}
                  onChange={(e) => setNegativeSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Фильтр по группе для отрицательных */}
              <div className="flex flex-wrap gap-2">
                {negativeGroupsList.slice(0, 8).map((group) => (
                  <Button
                    key={group}
                    variant={negativeFilterGroup === group ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNegativeFilterGroup(group)}
                    className={negativeFilterGroup === group ? "bg-destructive text-destructive-foreground" : ""}
                  >
                    {group}
                  </Button>
                ))}
                {negativeGroupsList.length > 8 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="text-muted-foreground"
                  >
                    +{negativeGroupsList.length - 8} ещё
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Диаграммы */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Положительные поступления */}
        <Card className="glass border-success/30">
        <CardHeader>
          <CardTitle className="text-success">Положительные поступления</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Всего: {formatCurrency(totalPositive)}
          </p>
        </CardHeader>
        <CardContent>
          {positiveData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              Нет положительных поступлений
            </div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={positiveData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="amount"
                    nameKey="category"
                  >
                    {positiveData.map((entry, index) => (
                      <Cell key={`cell-positive-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload as typeof positiveData[0];
                      return (
                        <div className="glass-card p-3 shadow-xl">
                          <p className="text-sm font-medium">{data.category}</p>
                          <p className="text-sm text-success">
                            {formatCurrency(data.amount)} ({data.percent.toFixed(1)}%)
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {data.count} операций
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
          )}
        </CardContent>
      </Card>

      {/* Отрицательные поступления (затраты) */}
      <Card className="glass border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Отрицательные поступления</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Всего: {formatCurrency(totalNegative)}
          </p>
        </CardHeader>
        <CardContent>
          {negativeData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              Нет отрицательных поступлений
            </div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={negativeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="amount"
                    nameKey="category"
                  >
                    {negativeData.map((entry, index) => (
                      <Cell key={`cell-negative-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload as typeof negativeData[0];
                      return (
                        <div className="glass-card p-3 shadow-xl">
                          <p className="text-sm font-medium">{data.category}</p>
                          <p className="text-sm text-destructive">
                            {formatCurrency(-data.amount)} ({data.percent.toFixed(1)}%)
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {data.count} операций
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
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
