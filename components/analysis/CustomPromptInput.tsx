"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronDown, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CustomPromptInputProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
}

const promptTemplates = [
  {
    id: "returns",
    label: "Возвраты",
    prompt: "Сфокусируйся на анализе возвратов: выяви товары с высоким процентом возвратов, определи причины и дай рекомендации по снижению.",
  },
  {
    id: "top-sku",
    label: "Топ SKU",
    prompt: "Проведи детальный анализ топ-10 SKU по выручке. Дай рекомендации по оптимизации цен и увеличению маржи.",
  },
  {
    id: "costs",
    label: "Затраты",
    prompt: "Сделай акцент на анализе всех видов затрат. Найди возможности для их оптимизации и снижения.",
  },
  {
    id: "losers",
    label: "Убыточные",
    prompt: "Выяви все убыточные товары и дай рекомендации: что вывести из ассортимента, а что можно оптимизировать.",
  },
];

export function CustomPromptInput({
  value,
  onChange,
  maxLength = 1000,
  disabled = false,
}: CustomPromptInputProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  
  // Автоматически раскрываем если есть значение
  useEffect(() => {
    if (value && !isExpanded) {
      setIsExpanded(true);
    }
  }, [value, isExpanded]);
  
  const handleTemplateClick = (template: typeof promptTemplates[0]) => {
    onChange(template.prompt);
    setShowTemplates(false);
  };
  
  const charactersLeft = maxLength - value.length;
  const isNearLimit = charactersLeft < 100;
  
  return (
    <div className="space-y-3">
      {/* Заголовок с кнопкой раскрытия */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={disabled}
        className={cn(
          "w-full flex items-center justify-between p-4 rounded-xl transition-all duration-200",
          "bg-muted/50 hover:bg-muted border border-transparent hover:border-border",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left">
            <p className="font-medium text-sm">Дополнительные инструкции для AI</p>
            <p className="text-xs text-muted-foreground">
              {value ? "Инструкции добавлены" : "Необязательно"}
            </p>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-muted-foreground transition-transform duration-200",
            isExpanded && "rotate-180"
          )}
        />
      </button>
      
      {/* Раскрывающийся контент */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pt-1">
              {/* Шаблоны промптов */}
              <div className="flex flex-wrap gap-2">
                {promptTemplates.map((template) => (
                  <Button
                    key={template.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleTemplateClick(template)}
                    disabled={disabled}
                    className="text-xs"
                  >
                    {template.label}
                  </Button>
                ))}
              </div>
              
              {/* Текстовое поле */}
              <div className="relative">
                <Textarea
                  value={value}
                  onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
                  placeholder="Добавьте свои пожелания к анализу, например: 'Сфокусируйся на товарах с высоким процентом возврата' или 'Дай рекомендации по оптимизации топ-10 SKU'"
                  disabled={disabled}
                  className={cn(
                    "min-h-[100px] pr-12 resize-none",
                    "bg-background/50 focus:bg-background transition-colors"
                  )}
                />
                
                {/* Кнопка очистки */}
                {value && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onChange("")}
                    className="absolute top-2 right-2"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              
              {/* Счётчик символов */}
              <div className="flex items-center justify-between text-xs">
                <p className="text-muted-foreground">
                  Эти инструкции будут учтены AI при генерации рекомендаций
                </p>
                <p
                  className={cn(
                    "tabular-nums",
                    isNearLimit ? "text-warning" : "text-muted-foreground",
                    charactersLeft <= 0 && "text-destructive"
                  )}
                >
                  {value.length}/{maxLength}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
