"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Filter,
  Search,
  ChevronDown,
  Info,
  Coins,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";

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

interface CostBreakdownDetailsProps {
  chargeTypeBreakdown: ChargeGroup[];
}

/**
 * Определяет, является ли группа начислений затратой (по смыслу)
 */
function isCostGroup(groupName: string): boolean {
  const costGroups = [
    "Логистика",
    "Логистика возврат",
    "Вознаграждение OZON",
    "Вознаграждение OZON возврат",
    "Подписка",
    "Продвижение",
    "Штрафы",
    "Штрафы возврат",
    "Эквайринг",
    "Прочие",
  ];
  return costGroups.includes(groupName);
}

export function CostBreakdownDetails({
  chargeTypeBreakdown,
}: CostBreakdownDetailsProps) {
  const [filterGroup, setFilterGroup] = useState<string>("Все");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Получаем уникальные группы (все начисления, включая выручку)
  const uniqueGroups = useMemo(() => {
    return ["Все", ...chargeTypeBreakdown.map((g) => g.groupName)];
  }, [chargeTypeBreakdown]);

  // Фильтрация и сортировка (все группы, включая выручку)
  const filteredGroups = useMemo(() => {
    let filtered = chargeTypeBreakdown;

    // Фильтр по группе
    if (filterGroup !== "Все") {
      filtered = filtered.filter((g) => g.groupName === filterGroup);
    }

    // Фильтр по поиску (в названии группы или типах начислений)
    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      filtered = filtered.filter((g) => {
        if (g.groupName.toLowerCase().includes(query)) return true;
        return g.chargeTypes.some((ct) =>
          ct.name.toLowerCase().includes(query)
        );
      });
    }

    return filtered.sort((a, b) => b.amount - a.amount);
  }, [chargeTypeBreakdown, filterGroup, searchTerm]);

  // Переключение раскрытия группы
  const toggleGroup = (groupName: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupName)) {
      newExpanded.delete(groupName);
    } else {
      newExpanded.add(groupName);
    }
    setExpandedGroups(newExpanded);
  };

  return (
    <Card className="glass lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-6 w-6 text-primary" />
          Детализация начислений
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Фильтры и поиск */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex flex-wrap gap-2 flex-1">
            {uniqueGroups.slice(0, 10).map((group) => (
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

          <div className="relative flex-1 md:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по группе или типу..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Список групп */}
        <div className="space-y-3">
          {filteredGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Ничего не найдено
            </div>
          ) : (
            filteredGroups.map((group, index) => {
              const isExpanded = expandedGroups.has(group.groupName);
              const isCost = isCostGroup(group.groupName);

              return (
                <motion.div
                  key={group.groupName}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className={cn(
                    "border rounded-xl backdrop-blur-sm bg-background/50",
                    isCost && "border-destructive/30 bg-destructive/5"
                  )}
                >
                  <Collapsible open={isExpanded} onOpenChange={() => toggleGroup(group.groupName)}>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full justify-between p-4 text-left font-semibold"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className={cn(
                            "text-lg font-bold",
                            group.amount >= 0 ? "text-success" : "text-destructive"
                          )}>
                            {formatCurrency(group.amount)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                isCost && "font-semibold",
                                group.amount >= 0 && isCost && "text-success",
                                group.amount < 0 && isCost && "text-destructive"
                              )}>{group.groupName}</span>
                              <Badge variant={isCost ? "destructive" : "secondary"}>{group.count} шт</Badge>
                            </div>
                          </div>
                        </div>
                        <ChevronDown
                          className={cn(
                            "h-5 w-5 transition-transform flex-shrink-0",
                            isExpanded && "rotate-180"
                          )}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="p-4 border-t border-border/50 space-y-3 bg-muted/20"
                      >
                        {/* Легенда: какие типы входят в группу */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Info className="h-4 w-4" />
                            <span>Типы начислений в группе "{group.groupName}":</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {group.chargeTypes.map((chargeType, idx) => {
                              const isPoints = chargeType.name.toLowerCase().includes("балл");
                              const displayAmount = isPoints ? Math.abs(chargeType.amount) : chargeType.amount;
                              const isPositive = chargeType.amount >= 0;
                              const isNegative = chargeType.amount < 0;
                              
                              return (
                                <div
                                  key={idx}
                                  className={cn(
                                    "flex items-center justify-between p-3 rounded-lg bg-background/50 border",
                                    isPositive && "border-success/30",
                                    isNegative && "border-destructive/30"
                                  )}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start gap-2">
                                      {isPoints && (
                                        <Coins className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                                      )}
                                      <p className="text-sm font-medium break-words leading-relaxed">
                                        {chargeType.name}
                                      </p>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {chargeType.count} шт
                                    </p>
                                  </div>
                                  <div className="text-right ml-2">
                                    <p className={cn(
                                      "text-sm font-semibold",
                                      isPoints && "text-yellow-500",
                                      !isPoints && isPositive && "text-success",
                                      !isPoints && isNegative && "text-destructive"
                                    )}>
                                      {formatCurrency(displayAmount)}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    </CollapsibleContent>
                  </Collapsible>
                </motion.div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
