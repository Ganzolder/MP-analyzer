import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Header } from "@/components/layout/Header";

export const metadata: Metadata = {
  title: "Ozon Analyzer - Анализ финансовых отчётов",
  description:
    "Анализируйте отчёты Ozon с помощью AI. Получайте детальную аналитику, рекомендации и инсайты для роста вашего бизнеса на маркетплейсе.",
  keywords: [
    "Ozon",
    "аналитика",
    "маркетплейс",
    "отчёты",
    "финансы",
    "AI",
    "селлер",
  ],
  authors: [{ name: "Ozon Analyzer" }],
  openGraph: {
    title: "Ozon Analyzer - Анализ финансовых отчётов",
    description:
      "Анализируйте отчёты Ozon с помощью AI. Получайте детальную аналитику и рекомендации.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="dark">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased min-h-screen bg-background`}
      >
        {/* Фоновые эффекты */}
        <div className="fixed inset-0 -z-10">
          {/* Градиентный фон */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-purple-500/5" />
          
          {/* Сетка */}
          <div className="absolute inset-0 bg-grid opacity-30" />
          
          {/* Свечение */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-0 right-0 w-[600px] h-[300px] bg-purple-500/10 blur-[100px] rounded-full" />
        </div>
        
        {/* Основной контент */}
        <div className="relative flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">{children}</main>
          
          {/* Футер */}
          <footer className="border-t py-6 md:py-8">
            <div className="container flex flex-col items-center justify-between gap-4 md:flex-row">
              <p className="text-sm text-muted-foreground">
                © 2024 Ozon Analyzer. Все права защищены.
              </p>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <a href="#" className="hover:text-foreground transition-colors">
                  Политика конфиденциальности
                </a>
                <a href="#" className="hover:text-foreground transition-colors">
                  Условия использования
                </a>
              </div>
            </div>
          </footer>
        </div>
        
        <Toaster />
      </body>
    </html>
  );
}
