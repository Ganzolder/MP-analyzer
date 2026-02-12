"use client";

import Link from "next/link";
import { BarChart3, Settings, FileText, Menu, X, Calculator, Package } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary to-purple-500 rounded-lg blur-md opacity-50 group-hover:opacity-75 transition-opacity" />
            <div className="relative bg-gradient-to-r from-primary to-purple-500 p-2 rounded-lg">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg leading-tight">Ozon Analyzer</span>
            <span className="text-xs text-muted-foreground leading-tight">Анализ отчётов</span>
          </div>
        </Link>
        
        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <NavLink href="/" active>
            Анализ
          </NavLink>
          <NavLink href="/calculator">
            Калькулятор
          </NavLink>
          <NavLink href="/reports">
            История
          </NavLink>
          <NavLink href="/admin/category-commissions">
            Комиссии
          </NavLink>
          <NavLink href="/admin/shipping-tariffs">
            Тарифы
          </NavLink>
          <NavLink href="/admin/processing-tariffs">
            Обработка FBS
          </NavLink>
          <NavLink href="/settings" badge="Скоро">
            Настройки
          </NavLink>
        </nav>
        
        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-2">
          <Button variant="ghost" size="icon" className="relative">
            <Settings className="h-5 w-5" />
          </Button>
          {/* Заготовка для авторизации */}
          <Button variant="outline" size="sm" disabled>
            Войти
          </Button>
        </div>
        
        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>
      
      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="md:hidden border-t bg-background">
          <nav className="container py-4 flex flex-col gap-2">
            <MobileNavLink href="/" icon={<BarChart3 className="h-4 w-4" />} onClick={() => setIsMenuOpen(false)}>
              Анализ
            </MobileNavLink>
            <MobileNavLink href="/calculator" icon={<Calculator className="h-4 w-4" />} onClick={() => setIsMenuOpen(false)}>
              Калькулятор
            </MobileNavLink>
            <MobileNavLink href="/reports" icon={<FileText className="h-4 w-4" />} onClick={() => setIsMenuOpen(false)}>
              История отчётов
            </MobileNavLink>
            <MobileNavLink href="/admin/category-commissions" icon={<Settings className="h-4 w-4" />} onClick={() => setIsMenuOpen(false)}>
              Комиссии
            </MobileNavLink>
            <MobileNavLink href="/admin/shipping-tariffs" icon={<Package className="h-4 w-4" />} onClick={() => setIsMenuOpen(false)}>
              Тарифы
            </MobileNavLink>
            <MobileNavLink href="/admin/processing-tariffs" icon={<Settings className="h-4 w-4" />} onClick={() => setIsMenuOpen(false)}>
              Обработка FBS
            </MobileNavLink>
            <MobileNavLink href="/settings" icon={<Settings className="h-4 w-4" />} badge="Скоро" onClick={() => setIsMenuOpen(false)}>
              Настройки
            </MobileNavLink>
            <div className="pt-4 mt-2 border-t">
              <Button variant="outline" className="w-full" disabled>
                Войти
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  badge?: string;
}

function NavLink({ href, children, active, badge }: NavLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "relative text-sm font-medium transition-colors hover:text-foreground flex items-center gap-2",
        active ? "text-foreground" : "text-muted-foreground"
      )}
    >
      {children}
      {badge && (
        <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
          {badge}
        </span>
      )}
      {active && (
        <span className="absolute -bottom-[21px] left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-purple-500 rounded-full" />
      )}
    </Link>
  );
}

interface MobileNavLinkProps {
  href: string;
  children: React.ReactNode;
  icon: React.ReactNode;
  badge?: string;
  onClick?: () => void;
}

function MobileNavLink({ href, children, icon, badge, onClick }: MobileNavLinkProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="font-medium">{children}</span>
      </div>
      {badge && (
        <span className="text-[10px] bg-primary/20 text-primary px-2 py-1 rounded-full">
          {badge}
        </span>
      )}
    </Link>
  );
}
