"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCalculatorStore } from "@/lib/store/calculator-store";
import { OzonCalculator } from "@/components/calculator/OzonCalculator";
import { ShoppingBag, Package, Store } from "lucide-react";

export default function CalculatorPage() {
  const { marketplace, setMarketplace } = useCalculatorStore();

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-3xl">Калькулятор оптимальных цен</CardTitle>
            <CardDescription>
              Расчёт оптимальных цен для товаров на различных маркетплейсах
            </CardDescription>
          </CardHeader>
        </Card>

        <Tabs value={marketplace} onValueChange={(value) => setMarketplace(value as any)}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="ozon" className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Озон
            </TabsTrigger>
            <TabsTrigger value="wildberries" className="flex items-center gap-2" disabled>
              <Package className="h-4 w-4" />
              Вайлдберриз
              <span className="text-xs ml-1">(скоро)</span>
            </TabsTrigger>
            <TabsTrigger value="yandex-market" className="flex items-center gap-2" disabled>
              <Store className="h-4 w-4" />
              Яндекс Маркет
              <span className="text-xs ml-1">(скоро)</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ozon">
            <OzonCalculator />
          </TabsContent>

          <TabsContent value="wildberries">
            <Card>
              <CardHeader>
                <CardTitle>Калькулятор Вайлдберриз</CardTitle>
                <CardDescription>Функционал находится в разработке</CardDescription>
              </CardHeader>
            </Card>
          </TabsContent>

          <TabsContent value="yandex-market">
            <Card>
              <CardHeader>
                <CardTitle>Калькулятор Яндекс Маркет</CardTitle>
                <CardDescription>Функционал находится в разработке</CardDescription>
              </CardHeader>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
