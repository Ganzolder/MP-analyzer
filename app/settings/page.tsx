"use client";

import { motion } from "framer-motion";
import {
  Settings,
  User,
  CreditCard,
  Bell,
  Sparkles,
  Database,
  Lock,
  ChevronRight,
  Calculator,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BusinessSettingsForm } from "@/components/settings/BusinessSettingsForm";

/**
 * Страница настроек
 * ЗАГОТОВКА - UI готов, логика будет добавлена позже
 */
export default function SettingsPage() {
  return (
    <div className="container py-8 md:py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto space-y-8"
      >
        {/* Заголовок */}
        <div>
          <h1 className="text-3xl font-bold">Настройки</h1>
          <p className="text-muted-foreground mt-2">
            Управляйте настройками аккаунта и приложения
          </p>
        </div>
        
        {/* Секции настроек */}
        <div className="space-y-6">
          {/* Бизнес-настройки */}
          <BusinessSettingsForm />
          
          <Separator />
          
          {/* Профиль */}
          <SettingsSection
            icon={<User className="h-5 w-5" />}
            title="Профиль"
            description="Управление данными аккаунта"
            badge="Скоро"
            disabled
          >
            <SettingsItem
              label="Имя"
              value="Не указано"
              disabled
            />
            <SettingsItem
              label="Email"
              value="Требуется авторизация"
              disabled
            />
          </SettingsSection>
          
          <Separator />
          
          {/* AI провайдер */}
          <SettingsSection
            icon={<Sparkles className="h-5 w-5" />}
            title="AI провайдер"
            description="Выбор модели для генерации рекомендаций"
            badge="Скоро"
            disabled
          >
            <div className="space-y-3">
              <AIProviderOption
                name="OpenAI GPT-4"
                description="Мощная модель с отличным качеством анализа"
                selected
                disabled
              />
              <AIProviderOption
                name="Claude 3 Opus"
                description="Альтернативная модель от Anthropic"
                disabled
              />
              <AIProviderOption
                name="Локальная модель"
                description="Без отправки данных на внешние серверы"
                comingSoon
                disabled
              />
            </div>
          </SettingsSection>
          
          <Separator />
          
          {/* База себестоимости */}
          <SettingsSection
            icon={<Database className="h-5 w-5" />}
            title="База себестоимости"
            description="Загрузка данных о закупочных ценах товаров"
            badge="Скоро"
            disabled
          >
            <div className="p-4 border border-dashed rounded-lg text-center">
              <Database className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Загрузите файл с данными: SKU | Себестоимость
              </p>
              <Button variant="outline" size="sm" className="mt-3" disabled>
                Загрузить файл
              </Button>
            </div>
          </SettingsSection>
          
          <Separator />
          
          {/* Уведомления */}
          <SettingsSection
            icon={<Bell className="h-5 w-5" />}
            title="Уведомления"
            description="Настройка оповещений"
            badge="Скоро"
            disabled
          >
            <SettingsToggle
              label="Email уведомления о завершении анализа"
              disabled
            />
            <SettingsToggle
              label="Еженедельные отчёты"
              disabled
            />
          </SettingsSection>
          
          <Separator />
          
          {/* Подписка */}
          <SettingsSection
            icon={<CreditCard className="h-5 w-5" />}
            title="Подписка"
            description="Управление тарифным планом"
            badge="Скоро"
            disabled
          >
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Free план</p>
                  <p className="text-sm text-muted-foreground">
                    3 анализа в месяц
                  </p>
                </div>
                <Button variant="outline" disabled>
                  Улучшить план
                </Button>
              </div>
            </div>
          </SettingsSection>
        </div>
        
      </motion.div>
    </div>
  );
}

interface SettingsSectionProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

function SettingsSection({ icon, title, description, badge, disabled, children }: SettingsSectionProps) {
  return (
    <div className={disabled ? "opacity-60" : ""}>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-primary/10 rounded-lg text-primary">
          {icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{title}</h3>
            {badge && <Badge variant="secondary" className="text-xs">{badge}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="pl-11 space-y-3">
        {children}
      </div>
    </div>
  );
}

interface SettingsItemProps {
  label: string;
  value: string;
  disabled?: boolean;
}

function SettingsItem({ label, value, disabled }: SettingsItemProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm">{label}</span>
      <span className="text-sm text-muted-foreground">{value}</span>
    </div>
  );
}

interface SettingsToggleProps {
  label: string;
  checked?: boolean;
  disabled?: boolean;
}

function SettingsToggle({ label, checked = false, disabled }: SettingsToggleProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm">{label}</span>
      <div className={`w-10 h-6 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}>
        <div className={`w-4 h-4 mt-1 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
      </div>
    </div>
  );
}

interface AIProviderOptionProps {
  name: string;
  description: string;
  selected?: boolean;
  comingSoon?: boolean;
  disabled?: boolean;
}

function AIProviderOption({ name, description, selected, comingSoon, disabled }: AIProviderOptionProps) {
  return (
    <div
      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
      } ${disabled ? "cursor-not-allowed" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm">{name}</p>
            {comingSoon && <Badge variant="outline" className="text-xs">Скоро</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        {selected && (
          <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white" />
          </div>
        )}
      </div>
    </div>
  );
}
