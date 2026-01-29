"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  ChevronDown,
  Package,
  Truck,
  Percent,
  CreditCard,
  RotateCcw,
  Tag,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";

interface ChargeItem {
  chargeType: string;
  category: string;
  amount: number;
  count: number;
  percent: number;
}

interface CostDetailsProps {
  orders?: Array<{
    chargeTypes: string[];
    commissionAmount: number;
    logisticsAmount: number;
    returnAmount: number;
    acquiringAmount: number;
    otherFeesAmount: number;
  }>;
  nonOrderCharges?: Array<{
    chargeType: string;
    totalAmountRub: number;
    count: number;
  }>;
  subscriptions?: Array<{
    chargeType: string;
    totalAmount: number;
  }>;
  chargeTypeBreakdown?: Array<{
    chargeType: string;
    amount: number;
    count: number;
  }>;
  totalFees: number;
}

// Категории для фильтрации
const CATEGORIES = [
  { id: "all", name: "Все", icon: Filter },
  { id: "commission", name: "Комиссия", icon: Percent },
  { id: "logistics", name: "Логистика", icon: Truck },
  { id: "returns", name: "Возвраты", icon: RotateCcw },
  { id: "acquiring", name: "Эквайринг", icon: CreditCard },
  { id: "subscription", name: "Подписки", icon: Tag },
  { id: "other", name: "Прочее", icon: Package },
];

// Определение категории по типу начисления
function getCategoryFromType(chargeType: string): string {
  const lower = chargeType.toLowerCase();
  
  if (lower.includes("комисси") || lower.includes("вознагражден")) return "commission";
  if (lower.includes("логист") || lower.includes("доставк") || lower.includes("drop-off") || lower.includes("отправлен")) return "logistics";
  if (lower.includes("возврат") || lower.includes("обратн")) return "returns";
  if (lower.includes("эквайринг")) return "acquiring";
  if (lower.includes("подписк") || lower.includes("premium")) return "subscription";
  
  return "other";
}

// Цвет для категории
function getCategoryColor(category: string): string {
  switch (category) {
    case "commission": return "text-red-500";
    case "logistics": return "text-orange-500";
    case "returns": return "text-yellow-500";
    case "acquiring": return "text-blue-500";
    case "subscription": return "text-violet-500";
    default: return "text-gray-500";
  }
}

// Иконка для категории
function getCategoryIcon(category: string) {
  switch (category) {
    case "commission": return Percent;
    case "logistics": return Truck;
    case "returns": return RotateCcw;
    case "acquiring": return CreditCard;
    case "subscription": return Tag;
    default: return Package;
  }
}

export function CostDetails({ orders, nonOrderCharges, subscriptions, chargeTypeBreakdown, totalFees }: CostDetailsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"amount" | "count" | "name">("amount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showAll, setShowAll] = useState(false);

  // Собираем все типы начислений
  const chargeItems = useMemo(() => {
    // Используем готовую chargeTypeBreakdown из API (уже агрегирована)
    return (chargeTypeBreakdown || []).map(item => ({
      chargeType: item.chargeType,
      category: getCategoryFromType(item.chargeType),
      amount: item.amount,
      count: item.count,
      percent: totalFees > 0 ? (item.amount / totalFees) * 100 : 0,
    }));
  }, [chargeTypeBreakdown, totalFees]);

  // Фильтрация и сортировка
  const filteredItems = useMemo(() => {
    let items = [...chargeItems];

    // Фильтр по поиску
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item => 
        item.chargeType.toLowerCase().includes(query)
      );
    }

    // Фильтр по категории
    if (selectedCategory !== "all") {
      items = items.filter(item => item.category === selectedCategory);
    }

    // Сортировка
    items.sort((a, b) => {
      let compare = 0;
      switch (sortBy) {
        case "amount":
          compare = a.amount - b.amount;
          break;
        case "count":
          compare = a.count - b.count;
          break;
        case "name":
          compare = a.chargeType.localeCompare(b.chargeType);
          break;
      }
      return sortOrder === "desc" ? -compare : compare;
    });

    return items;
  }, [chargeItems, searchQuery, selectedCategory, sortBy, sortOrder]);

  // Показываем первые 10 или все
  const displayedItems = showAll ? filteredItems : filteredItems.slice(0, 10);

  // Статистика по категориям
  const categoryStats = useMemo(() => {
    const stats = new Map<string, number>();
    chargeItems.forEach(item => {
      const current = stats.get(item.category) || 0;
      stats.set(item.category, current + item.amount);
    });
    return stats;
  }, [chargeItems]);

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const SortIcon = ({ field }: { field: typeof sortBy }) => {
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortOrder === "desc" 
      ? <ArrowDown className="h-3 w-3" /> 
      : <ArrowUp className="h-3 w-3" />;
  };

  return (
    <Card className="glass">
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-primary" />
            Детализация удержаний
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            Всего: <span className="font-semibold text-foreground">{formatCurrency(totalFees)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Фильтры по категориям */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const amount = cat.id === "all" ? totalFees : (categoryStats.get(cat.id) || 0);
            const isActive = selectedCategory === cat.id;
            
            return (
              <Button
                key={cat.id}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "h-auto py-2 px-3",
                  isActive && "ring-2 ring-primary/20"
                )}
              >
                <Icon className="h-4 w-4 mr-1.5" />
                <span>{cat.name}</span>
                {amount > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {formatCurrency(amount)}
                  </Badge>
                )}
              </Button>
            );
          })}
        </div>

        {/* Поиск */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Поиск по типу начисления..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Таблица */}
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left py-3 px-4 font-medium">
                  <button 
                    onClick={() => toggleSort("name")}
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                  >
                    Тип начисления
                    <SortIcon field="name" />
                  </button>
                </th>
                <th className="text-center py-3 px-4 font-medium w-24">
                  <button 
                    onClick={() => toggleSort("count")}
                    className="flex items-center gap-1 hover:text-primary transition-colors mx-auto"
                  >
                    Кол-во
                    <SortIcon field="count" />
                  </button>
                </th>
                <th className="text-right py-3 px-4 font-medium w-36">
                  <button 
                    onClick={() => toggleSort("amount")}
                    className="flex items-center gap-1 hover:text-primary transition-colors ml-auto"
                  >
                    Сумма
                    <SortIcon field="amount" />
                  </button>
                </th>
                <th className="text-right py-3 px-4 font-medium w-20">%</th>
              </tr>
            </thead>
            <tbody>
              {displayedItems.map((item, index) => {
                const Icon = getCategoryIcon(item.category);
                return (
                  <motion.tr
                    key={item.chargeType}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="border-t hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Icon className={cn("h-4 w-4 flex-shrink-0", getCategoryColor(item.category))} />
                        <span className="truncate" title={item.chargeType}>
                          {item.chargeType}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center text-muted-foreground">
                      {item.count}
                    </td>
                    <td className="py-3 px-4 text-right font-medium">
                      {formatCurrency(item.amount)}
                    </td>
                    <td className="py-3 px-4 text-right text-muted-foreground">
                      {item.percent.toFixed(1)}%
                    </td>
                  </motion.tr>
                );
              })}
              
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    Нет данных по выбранным фильтрам
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Показать больше */}
        {filteredItems.length > 10 && (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              onClick={() => setShowAll(!showAll)}
              className="gap-2"
            >
              {showAll ? "Скрыть" : `Показать все (${filteredItems.length})`}
              <ChevronDown className={cn(
                "h-4 w-4 transition-transform",
                showAll && "rotate-180"
              )} />
            </Button>
          </div>
        )}

        {/* Итого по фильтру */}
        {selectedCategory !== "all" && (
          <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
            <span className="text-sm text-muted-foreground">
              Итого по категории "{CATEGORIES.find(c => c.id === selectedCategory)?.name}":
            </span>
            <span className="font-semibold">
              {formatCurrency(categoryStats.get(selectedCategory) || 0)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
