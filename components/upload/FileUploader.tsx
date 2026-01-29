"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import type { FileRejection } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertCircle,
  Lock,
} from "lucide-react";
import { cn, formatFileSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  onFileRemove: () => void;
  selectedFile: { name: string; size: number } | null;
  accept?: Record<string, string[]>;
  maxSize?: number;
  disabled?: boolean;
  title: string;
  description: string;
  comingSoon?: boolean;
  tooltipText?: string;
  error?: string | null;
  className?: string;
}

export function FileUploader({
  onFileSelect,
  onFileRemove,
  selectedFile,
  accept = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    "application/vnd.ms-excel": [".xls"],
  },
  maxSize = 50 * 1024 * 1024, // 50MB
  disabled = false,
  title,
  description,
  comingSoon = false,
  tooltipText,
  error,
  className,
}: FileUploaderProps) {
  const [isDragReject, setIsDragReject] = useState(false);
  
  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setIsDragReject(false);
      
      if (rejectedFiles.length > 0) {
        // Обработка отклонённых файлов
        return;
      }
      
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect]
  );
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple: false,
    disabled: disabled || comingSoon,
    onDragEnter: () => setIsDragReject(false),
    onDragLeave: () => setIsDragReject(false),
    onDropRejected: () => setIsDragReject(true),
  });
  
  const isDisabled = disabled || comingSoon;
  
  const content = (
    <div
      {...getRootProps()}
      className={cn(
        "dropzone relative p-8 text-center transition-all duration-300 cursor-pointer group",
        isDragActive && !isDragReject && "dropzone-active border-primary",
        isDragReject && "border-destructive bg-destructive/5",
        isDisabled && "opacity-60 cursor-not-allowed",
        selectedFile && "border-success bg-success/5",
        error && "border-destructive",
        className
      )}
    >
      <input {...getInputProps()} />
      
      {/* Фоновый эффект */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
      
      <AnimatePresence mode="wait">
        {selectedFile ? (
          // Файл выбран
          <motion.div
            key="selected"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="relative flex flex-col items-center gap-4"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-success/20 rounded-full blur-xl" />
              <div className="relative p-4 bg-success/10 rounded-full">
                <FileSpreadsheet className="h-8 w-8 text-success" />
              </div>
              <CheckCircle2 className="absolute -bottom-1 -right-1 h-5 w-5 text-success bg-background rounded-full" />
            </div>
            
            <div className="space-y-1">
              <p className="font-medium text-foreground truncate max-w-[200px]">
                {selectedFile.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
            
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onFileRemove();
              }}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4 mr-1" />
              Удалить
            </Button>
          </motion.div>
        ) : (
          // Файл не выбран
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="relative flex flex-col items-center gap-4"
          >
            <div className="relative">
              {comingSoon ? (
                <div className="p-4 bg-muted rounded-full">
                  <Lock className="h-8 w-8 text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative p-4 bg-muted rounded-full group-hover:bg-primary/10 transition-colors">
                    <Upload className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                <p className="font-medium text-foreground">{title}</p>
                {comingSoon && <Badge variant="secondary">Скоро</Badge>}
              </div>
              <p className="text-sm text-muted-foreground max-w-[250px]">
                {description}
              </p>
            </div>
            
            {!comingSoon && (
              <p className="text-xs text-muted-foreground">
                XLS, XLSX до {formatFileSize(maxSize)}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Ошибка */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute bottom-2 left-2 right-2 flex items-center gap-2 text-destructive text-sm"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">{error}</span>
        </motion.div>
      )}
      
      {/* Индикатор drag reject */}
      {isDragReject && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center bg-destructive/10 rounded-xl"
        >
          <p className="text-destructive font-medium">
            Неподдерживаемый формат файла
          </p>
        </motion.div>
      )}
    </div>
  );
  
  // Оборачиваем в Tooltip если есть текст
  if (tooltipText && comingSoon) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltipText}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return content;
}
