"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, FileText, ShoppingCart, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ArticlesComparisonProps {
  costArticles: string[];
  orderArticles: string[];
}

export function ArticlesComparison({ costArticles, orderArticles }: ArticlesComparisonProps) {
  const [searchCost, setSearchCost] = useState("");
  const [searchOrder, setSearchOrder] = useState("");
  const [selectedCost, setSelectedCost] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [isCostOpen, setIsCostOpen] = useState(true);
  const [isOrderOpen, setIsOrderOpen] = useState(true);

  // Фильтрация артикулов
  const filteredCostArticles = costArticles.filter(art =>
    art.toLowerCase().includes(searchCost.toLowerCase())
  );
  const filteredOrderArticles = orderArticles.filter(art =>
    art.toLowerCase().includes(searchOrder.toLowerCase())
  );

  // Поиск похожих артикулов
  const findSimilar = (article: string, inCost: boolean) => {
    const target = article.toLowerCase();
    const source = inCost ? orderArticles : costArticles;
    
    return source
      .filter(a => {
        const lower = a.toLowerCase();
        return lower === target ||
               lower.includes(target.substring(0, Math.min(5, target.length))) ||
               target.includes(lower.substring(0, Math.min(5, lower.length)));
      })
      .slice(0, 5);
  };

  const similarToCost = selectedCost ? findSimilar(selectedCost, true) : [];
  const similarToOrder = selectedOrder ? findSimilar(selectedOrder, false) : [];

  return (
    <div className="space-y-6">
      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="glass">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Артикулы из файла себестоимости</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{costArticles.length}</div>
            <div className="text-sm text-muted-foreground mt-2">
              Всего уникальных артикулов
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Артикулы из файла начислений</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{orderArticles.length}</div>
            <div className="text-sm text-muted-foreground mt-2">
              Всего уникальных артикулов
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Списки артикулов */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Артикулы из файла себестоимости */}
        <Card className="glass">
          <Collapsible open={isCostOpen} onOpenChange={setIsCostOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2">
                  <ChevronRight className={cn("h-5 w-5 transition-transform", isCostOpen && "rotate-90")} />
                  <CardTitle>Артикулы из файла себестоимости</CardTitle>
                  <span className="text-sm font-normal text-muted-foreground">
                    ({costArticles.length})
                  </span>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск артикула..."
                    value={searchCost}
                    onChange={(e) => setSearchCost(e.target.value)}
                    className="pl-10"
                  />
                </div>
            <div className="max-h-[600px] overflow-y-auto space-y-2">
              {filteredCostArticles.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Артикулы не найдены
                </div>
              ) : (
                filteredCostArticles.map((article, idx) => {
                  const isSelected = selectedCost === article;
                  const hasMatch = orderArticles.some(oa => 
                    oa.toLowerCase() === article.toLowerCase() ||
                    oa.replace(/\s/g, "").toLowerCase() === article.replace(/\s/g, "").toLowerCase()
                  );
                  
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedCost(isSelected ? null : article)}
                      className={cn(
                        "p-3 rounded-lg border cursor-pointer transition-colors",
                        isSelected
                          ? "bg-primary/10 border-primary"
                          : "bg-muted/30 border-transparent hover:bg-muted/50",
                        hasMatch && "border-success/50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-sm break-all">{article}</div>
                          <div className="flex items-center gap-2 mt-1">
                            {hasMatch && (
                              <Badge variant="outline" className="text-xs border-success text-success">
                                Есть совпадение
                              </Badge>
                            )}
                            {/[а-яё]/i.test(article) && (
                              <Badge variant="outline" className="text-xs">
                                Кириллица
                              </Badge>
                            )}
                            {/[a-z]/i.test(article) && (
                              <Badge variant="outline" className="text-xs">
                                Латиница
                              </Badge>
                            )}
                            {/\s/.test(article) && (
                              <Badge variant="outline" className="text-xs">
                                Пробелы
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      {isSelected && similarToCost.length > 0 && (
                        <div className="mt-2 pt-2 border-t">
                          <div className="text-xs text-muted-foreground mb-1">Похожие в файле начислений:</div>
                          {similarToCost.map((similar, sIdx) => (
                            <div key={sIdx} className="text-xs font-mono bg-muted/50 p-1 rounded mt-1">
                              {similar}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
        </Card>

        {/* Артикулы из файла начислений */}
        <Card className="glass">
          <Collapsible open={isOrderOpen} onOpenChange={setIsOrderOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2">
                  <ChevronRight className={cn("h-5 w-5 transition-transform", isOrderOpen && "rotate-90")} />
                  <CardTitle>Артикулы из файла начислений</CardTitle>
                  <span className="text-sm font-normal text-muted-foreground">
                    ({orderArticles.length})
                  </span>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск артикула..."
                    value={searchOrder}
                    onChange={(e) => setSearchOrder(e.target.value)}
                    className="pl-10"
                  />
                </div>
            <div className="max-h-[600px] overflow-y-auto space-y-2">
              {filteredOrderArticles.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Артикулы не найдены
                </div>
              ) : (
                filteredOrderArticles.map((article, idx) => {
                  const isSelected = selectedOrder === article;
                  const hasMatch = costArticles.some(ca => 
                    ca.toLowerCase() === article.toLowerCase() ||
                    ca.replace(/\s/g, "").toLowerCase() === article.replace(/\s/g, "").toLowerCase()
                  );
                  
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedOrder(isSelected ? null : article)}
                      className={cn(
                        "p-3 rounded-lg border cursor-pointer transition-colors",
                        isSelected
                          ? "bg-primary/10 border-primary"
                          : "bg-muted/30 border-transparent hover:bg-muted/50",
                        hasMatch && "border-success/50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-sm break-all">{article}</div>
                          <div className="flex items-center gap-2 mt-1">
                            {hasMatch && (
                              <Badge variant="outline" className="text-xs border-success text-success">
                                Есть совпадение
                              </Badge>
                            )}
                            {/[а-яё]/i.test(article) && (
                              <Badge variant="outline" className="text-xs">
                                Кириллица
                              </Badge>
                            )}
                            {/[a-z]/i.test(article) && (
                              <Badge variant="outline" className="text-xs">
                                Латиница
                              </Badge>
                            )}
                            {/\s/.test(article) && (
                              <Badge variant="outline" className="text-xs">
                                Пробелы
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      {isSelected && similarToOrder.length > 0 && (
                        <div className="mt-2 pt-2 border-t">
                          <div className="text-xs text-muted-foreground mb-1">Похожие в файле себестоимости:</div>
                          {similarToOrder.map((similar, sIdx) => (
                            <div key={sIdx} className="text-xs font-mono bg-muted/50 p-1 rounded mt-1">
                              {similar}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
        </Card>
      </div>
    </div>
  );
}
