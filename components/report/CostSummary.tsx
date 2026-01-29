"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
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
import { Search, Filter } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";

interface ChargeTypeDetail {
  name: string;
  amount: number;
  count: number;
}

interface ChargeGroup {
  groupName: string;
  amount: number;
  count: number;
  chargeTypes: ChargeTypeDetail[];
}

interface CostSummaryProps {
  chargeTypeBreakdown: ChargeGroup[];
}

// Цвета для групп затрат
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

// Генерируем цвет для группы, если его нет в маппинге
function getGroupColor(groupName: string, index: number): string {
  if (GROUP_COLORS[groupName]) {
    return GROUP_COLORS[groupName];
  }
  // Используем палитру, если группы нет в маппинге
  const colors = [
    "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6",
    "#8b5cf6", "#ec4899", "#6b7280", "#06b6d4", "#a855f7",
  ];
  return colors[index % colors.length];
}

export function CostSummary({ chargeTypeBreakdown }: CostSummaryProps) {
  const [filterGroup, setFilterGroup] = useState<string>("Все");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Получаем уникальные группы (все начисления, включая выручку)
  const uniqueGroups = useMemo(() => {
    return ["Все", ...chargeTypeBreakdown.map((g) => g.groupName)];
  }, [chargeTypeBreakdown]);

  // Фильтрация групп (все группы, включая выручку)
  const filteredGroups = useMemo(() => {
    let filtered = chargeTypeBreakdown;

    // Фильтр по группе
    if (filterGroup !== "Все") {
      filtered = filtered.filter((g) => g.groupName === filterGroup);
    }

    // Фильтр по поиску
    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      filtered = filtered.filter((g) =>
        g.groupName.toLowerCase().includes(query)
      );
    }

    return filtered.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }, [chargeTypeBreakdown, filterGroup, searchTerm]);

  // Преобразуем в формат для pie chart
  const pieData = useMemo(() => {
    const total = filteredGroups.reduce((sum, g) => sum + Math.abs(g.amount), 0);
    
    return filteredGroups.map((group, index) => ({
      category: group.groupName,
      amount: Math.abs(group.amount),
      percent: total > 0 ? (Math.abs(group.amount) / total) * 100 : 0,
      color: getGroupColor(group.groupName, index),
      count: group.count,
    }));
  }, [filteredGroups]);

  const totalAmount = filteredGroups.reduce((sum, g) => sum + Math.abs(g.amount), 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Pie Chart */}
      <Card className="glass">
        <CardHeader>
          <CardTitle>Структура начислений</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="amount"
                  nameKey="category"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload as typeof pieData[0];
                    return (
                      <div className="glass-card p-3 shadow-xl">
                        <p className="text-sm font-medium">{data.category}</p>
                        <p className="text-sm text-muted-foreground">
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
        </CardContent>
      </Card>

      {/* Список групп с фильтрацией */}
      <Card className="glass">
        <CardHeader>
          <CardTitle>Сводка по категориям</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Фильтры */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по группе..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {uniqueGroups.slice(0, 8).map((group) => (
                <Button
                  key={group}
                  variant={filterGroup === group ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterGroup(group)}
                >
                  {group}
                </Button>
              ))}
            </div>
          </div>

          {/* Список групп */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {filteredGroups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Ничего не найдено
              </div>
            ) : (
              filteredGroups.map((group, index) => {
                const color = getGroupColor(group.groupName, index);
                const percent = totalAmount > 0 
                  ? (Math.abs(group.amount) / totalAmount) * 100 
                  : 0;

                return (
                  <motion.div
                    key={group.groupName}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg bg-muted/50",
                      group.amount < 0 && "bg-destructive/5"
                    )}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm truncate">{group.groupName}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        ({group.count})
                      </span>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className={cn(
                        "text-sm font-medium",
                        group.amount >= 0 ? "text-success" : "text-destructive"
                      )}>
                        {formatCurrency(group.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {percent.toFixed(1)}%
                      </p>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
