"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Filter,
  Search,
  ChevronDown,
  Info,
  Coins,
  Eye,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { AggregatedOrder } from "@/lib/analysis/types";
import { getChargeCategory } from "@/lib/analysis/constants";

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
  orders?: AggregatedOrder[];
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
  orders = [],
}: CostBreakdownDetailsProps) {
  const [filterGroup, setFilterGroup] = useState<string>("Все");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedChargeType, setSelectedChargeType] = useState<{
    name: string;
    groupName: string;
  } | null>(null);

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
                                  <div className="flex items-center gap-2">
                                    <div className="text-right">
                                      <p className={cn(
                                        "text-sm font-semibold",
                                        isPoints && "text-yellow-500",
                                        !isPoints && isPositive && "text-success",
                                        !isPoints && isNegative && "text-destructive"
                                      )}>
                                        {formatCurrency(displayAmount)}
                                      </p>
                                    </div>
                                    {orders.length > 0 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedChargeType({
                                            name: chargeType.name,
                                            groupName: group.groupName,
                                          });
                                        }}
                                        title="Показать расшифровку"
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    )}
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

      {/* Модальное окно с расшифровкой */}
      <Dialog open={selectedChargeType !== null} onOpenChange={(open) => !open && setSelectedChargeType(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Расшифровка начислений</DialogTitle>
            <DialogDescription>
              {selectedChargeType && (
                <>
                  Тип начисления: <strong>{selectedChargeType.name}</strong>
                  <br />
                  Группа: <strong>{selectedChargeType.groupName}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {selectedChargeType && (
              <ChargeDetailsTable
                chargeTypeName={selectedChargeType.name}
                orders={orders}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * Компонент таблицы с детальной информацией о начислениях
 */
function ChargeDetailsTable({
  chargeTypeName,
  orders,
}: {
  chargeTypeName: string;
  orders: AggregatedOrder[];
}) {
  // Фильтруем заказы, которые содержат этот тип начисления
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      return order.chargeTypes?.some((ct) => ct === chargeTypeName);
    });
  }, [orders, chargeTypeName]);

  // Определяем сумму начисления для каждого заказа
  const ordersWithAmounts = useMemo(() => {
    return filteredOrders.map((order) => {
      const category = getChargeCategory(chargeTypeName);
      let amount = 0;

      // Определяем сумму начисления в зависимости от категории
      switch (category) {
        case "revenue":
          amount = order.revenueAmount || 0;
          break;
        case "points":
          amount = order.pointsAmount || 0;
          break;
        case "commission":
          amount = order.commissionAmount || 0;
          break;
        case "logistics":
          amount = order.logisticsAmount || 0;
          break;
        case "acquiring":
          amount = order.acquiringAmount || 0;
          break;
        case "returnLogistics":
        case "returnRevenue":
        case "returnCommission":
        case "returnProcessing":
          amount = order.returnAmount || 0;
          break;
        default:
          amount = order.otherFeesAmount || 0;
      }

      return {
        order,
        amount,
      };
    }).filter((item) => Math.abs(item.amount) > 0.01); // Фильтруем заказы с нулевой суммой
  }, [filteredOrders, chargeTypeName]);

  if (ordersWithAmounts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Нет заказов с данным типом начисления
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left py-3 px-4 font-medium text-sm">Заказ</th>
            <th className="text-left py-3 px-4 font-medium text-sm">Дата</th>
            <th className="text-left py-3 px-4 font-medium text-sm">Товар</th>
            <th className="text-right py-3 px-4 font-medium text-sm">Тип начисления</th>
            <th className="text-right py-3 px-4 font-medium text-sm">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {ordersWithAmounts.map(({ order, amount }, index) => (
            <tr key={order.orderNumber} className="border-b hover:bg-muted/30">
              <td className="py-3 px-4 font-mono text-xs">{order.orderNumber}</td>
              <td className="py-3 px-4 text-sm">
                {order.chargeDate ? formatDate(order.chargeDate) : order.orderDate ? formatDate(order.orderDate) : "-"}
              </td>
              <td className="py-3 px-4 text-sm max-w-[200px] truncate" title={order.productName}>
                {order.productName || "Без названия"}
              </td>
              <td className="py-3 px-4 text-sm text-right">{chargeTypeName}</td>
              <td className={cn(
                "py-3 px-4 text-sm font-semibold text-right",
                amount >= 0 ? "text-success" : "text-destructive"
              )}>
                {formatCurrency(amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-semibold">
            <td colSpan={4} className="py-3 px-4 text-right">Итого:</td>
            <td className={cn(
              "py-3 px-4 text-right",
              ordersWithAmounts.reduce((sum, item) => sum + item.amount, 0) >= 0
                ? "text-success"
                : "text-destructive"
            )}>
              {formatCurrency(ordersWithAmounts.reduce((sum, item) => sum + item.amount, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
