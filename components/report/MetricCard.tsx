"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: number;
  format?: "currency" | "number" | "percent";
  change?: number;
  changeLabel?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  className?: string;
  delay?: number;
}

export function MetricCard({
  title,
  value,
  format = "number",
  change,
  changeLabel,
  subtitle,
  icon,
  className,
  delay = 0,
}: MetricCardProps) {
  const formattedValue = () => {
    switch (format) {
      case "currency":
        return formatCurrency(value);
      case "percent":
        return `${value.toFixed(1)}%`;
      default:
        return formatNumber(value);
    }
  };
  
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  const isNeutral = change === 0;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={cn("metric-card", className)}
    >
      <div className="flex items-start justify-between mb-4">
        <span className="text-sm text-muted-foreground">{title}</span>
        {icon && (
          <div className="p-2 bg-primary/10 rounded-lg">
            <span className="text-primary">{icon}</span>
          </div>
        )}
      </div>
      
      <div className="metric-value">{formattedValue()}</div>
      
      {subtitle && (
        <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
      )}
      
      {change !== undefined && (
        <div
          className={cn(
            "metric-change",
            isPositive && "metric-change-positive",
            isNegative && "metric-change-negative",
            isNeutral && "text-muted-foreground"
          )}
        >
          {isPositive && <TrendingUp className="h-3 w-3" />}
          {isNegative && <TrendingDown className="h-3 w-3" />}
          {isNeutral && <Minus className="h-3 w-3" />}
          <span>{formatPercent(change)}</span>
          {changeLabel && (
            <span className="text-muted-foreground ml-1">{changeLabel}</span>
          )}
        </div>
      )}
    </motion.div>
  );
}
