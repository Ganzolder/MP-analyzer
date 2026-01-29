"use client";

import { useState } from "react";
import { Sparkles, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AIToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function AIToggle({ enabled, onToggle, disabled, className }: AIToggleProps) {
  return (
    <Card className={cn("p-4 space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <Label htmlFor="ai-toggle" className="text-sm font-medium cursor-pointer">
            AI анализ и рекомендации
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  Включите для получения расширенных AI-рекомендаций на основе анализа ваших данных.
                  Требуется API ключ z.ai (ZAI_API_KEY в переменных окружения).
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Switch
          id="ai-toggle"
          checked={enabled}
          onCheckedChange={onToggle}
          disabled={disabled}
        />
      </div>
      {enabled && (
        <p className="text-xs text-muted-foreground">
          AI будет анализировать ваши данные и генерировать персонализированные рекомендации
        </p>
      )}
    </Card>
  );
}
