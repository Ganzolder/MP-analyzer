"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

interface ExportSectionButtonProps {
  onExport: () => void;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function ExportSectionButton({
  onExport,
  label = "Экспорт в XLSX",
  variant = "outline",
  size = "default",
}: ExportSectionButtonProps) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await onExport();
      toast({
        title: "Экспорт завершен",
        description: "Файл успешно загружен",
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Ошибка экспорта",
        description: "Не удалось создать файл",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={isExporting}
      variant={variant}
      size={size}
      className="gap-2"
    >
      {isExporting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileSpreadsheet className="h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
