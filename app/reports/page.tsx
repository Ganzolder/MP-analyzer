"use client";

import { motion } from "framer-motion";
import { FileText, Lock, Calendar, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Страница истории отчётов
 * ЗАГОТОВКА - будет реализована после добавления авторизации
 */
export default function ReportsPage() {
  return (
    <div className="container py-8 md:py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto space-y-8"
      >
        {/* Заголовок */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-sm">
            <Lock className="h-4 w-4" />
            <span>Функция в разработке</span>
          </div>
          
          <h1 className="text-3xl md:text-4xl font-bold">История отчётов</h1>
          
          <p className="text-muted-foreground max-w-lg mx-auto">
            Здесь будут храниться все ваши анализы. Вы сможете сравнивать периоды,
            отслеживать динамику и экспортировать данные.
          </p>
        </div>
        
        {/* Превью функционала */}
        <div className="grid gap-6 md:grid-cols-2">
          <FeaturePreviewCard
            icon={<FileText className="h-5 w-5" />}
            title="Все отчёты в одном месте"
            description="Храните историю анализов и возвращайтесь к ним в любое время"
          />
          <FeaturePreviewCard
            icon={<Calendar className="h-5 w-5" />}
            title="Сравнение периодов"
            description="Сравнивайте метрики за разные периоды и отслеживайте рост"
          />
          <FeaturePreviewCard
            icon={<TrendingUp className="h-5 w-5" />}
            title="Динамика показателей"
            description="Графики изменения ключевых метрик во времени"
          />
          <FeaturePreviewCard
            icon={<Lock className="h-5 w-5" />}
            title="Безопасное хранение"
            description="Ваши данные надёжно защищены и доступны только вам"
          />
        </div>
        
        {/* Пустое состояние */}
        <Card className="text-center py-12">
          <CardContent>
            <div className="mx-auto w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
              <FileText className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Отчётов пока нет</h3>
            <p className="text-muted-foreground mb-6">
              Авторизуйтесь, чтобы сохранять историю анализов
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild>
                <Link href="/">Создать первый анализ</Link>
              </Button>
              <Button variant="outline" disabled>
                <Lock className="mr-2 h-4 w-4" />
                Войти
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* Информация о будущих возможностях */}
        <div className="text-center text-sm text-muted-foreground">
          <p>
            Функция истории отчётов будет доступна после добавления системы авторизации.
            <br />
            Следите за обновлениями!
          </p>
        </div>
      </motion.div>
    </div>
  );
}

interface FeaturePreviewCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeaturePreviewCard({ icon, title, description }: FeaturePreviewCardProps) {
  return (
    <Card className="relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            {icon}
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="text-sm">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
