# 📊 Ozon Analyzer

Веб-приложение для анализа финансовых отчётов Ozon селлеров. Загружайте XLS-файлы с начислениями и получайте детальную аналитику, графики и AI-рекомендации для роста бизнеса.

![Next.js](https://img.shields.io/badge/Next.js-14+-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8?style=flat-square&logo=tailwind-css)
![Python](https://img.shields.io/badge/Python-3.11+-3776ab?style=flat-square&logo=python)

## ✨ Возможности

### MVP (реализовано)
- 📁 Drag-and-drop загрузка XLS/XLSX файлов
- 📈 Интерактивные графики (Recharts)
- 💰 Анализ выручки, прибыли и затрат
- 🎯 Топ прибыльных и убыточных товаров
- 🤖 AI-рекомендации (mock данные)
- 📱 Адаптивный дизайн (mobile-first)
- 🌙 Современная тёмная тема

### В разработке
- 🔐 Авторизация (NextAuth.js)
- 📚 История отчётов
- ⚙️ Настройки и персонализация
- 💳 Система подписок
- 🧠 Реальная AI интеграция

## 🛠 Технологии

### Frontend
- **Framework:** Next.js 14+ (App Router)
- **UI:** React, TypeScript, Tailwind CSS
- **Компоненты:** Radix UI (shadcn/ui)
- **Анимации:** Framer Motion
- **Графики:** Recharts
- **State:** Zustand

### Backend
- **API:** Next.js API Routes
- **БД:** Prisma + SQLite (MVP) / PostgreSQL
- **Python:** FastAPI для тяжёлых вычислений
- **Анализ:** pandas, openpyxl

## 🚀 Быстрый старт

### Требования
- Node.js 18+
- Python 3.11+ (для Python сервиса)
- npm или yarn

### Установка

1. **Клонирование и установка зависимостей:**
```bash
# Клонировать репозиторий
cd "C:\IAO\MP analyzer"

# Установить Node.js зависимости
npm install

# Создать файл окружения
copy env.example.txt .env.local
```

2. **Настройка базы данных:**
```bash
# Генерация Prisma клиента
npx prisma generate

# Создание БД (SQLite)
npx prisma db push
```

3. **Запуск Next.js приложения:**
```bash
npm run dev
```
Приложение будет доступно на http://localhost:3000

4. **Запуск Python сервиса (опционально):**
```bash
cd python-service

# Создание виртуального окружения
python -m venv venv
venv\Scripts\activate  # Windows
# или: source venv/bin/activate  # Linux/Mac

# Установка зависимостей
pip install -r requirements.txt

# Запуск сервиса
uvicorn main:app --reload --port 8000
```

## 📁 Структура проекта

```
├── app/                      # Next.js App Router
│   ├── page.tsx             # Главная страница (загрузка)
│   ├── analysis/[id]/       # Страница результатов
│   ├── reports/             # История отчётов (заготовка)
│   ├── settings/            # Настройки (заготовка)
│   ├── api/                 # API Routes
│   │   ├── upload/          # Загрузка файлов
│   │   ├── analyze/         # Запуск анализа
│   │   ├── analysis/[id]/   # Получение результатов
│   │   └── export/          # Экспорт PDF/XLSX
│   └── layout.tsx           # Корневой layout
│
├── components/               # React компоненты
│   ├── ui/                  # shadcn/ui компоненты
│   ├── upload/              # Компоненты загрузки
│   ├── analysis/            # Компоненты анализа
│   ├── report/              # Компоненты отчёта
│   └── layout/              # Layout компоненты
│
├── lib/                      # Библиотеки и утилиты
│   ├── db/                  # Prisma client
│   ├── store/               # Zustand stores
│   ├── types/               # TypeScript типы
│   ├── mock/                # Mock данные
│   └── utils.ts             # Утилиты
│
├── prisma/                   # Prisma схема
│   └── schema.prisma        # Модели БД
│
├── python-service/           # Python микросервис
│   ├── main.py              # FastAPI приложение
│   ├── analyzers/           # Модули анализа
│   ├── utils/               # Утилиты
│   └── models/              # Pydantic модели
│
└── public/                   # Статические файлы
```

## 🔧 Конфигурация

### Переменные окружения (.env.local)

```env
# База данных
DATABASE_URL="file:./dev.db"

# NextAuth (для будущей авторизации)
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key"

# Python сервис
PYTHON_SERVICE_URL="http://localhost:8000"

# AI провайдеры (опционально)
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
```

## 📊 API Endpoints

### Загрузка файлов
```
POST /api/upload
Content-Type: multipart/form-data

Параметры:
- file: XLS/XLSX файл

Ответ:
{
  "success": true,
  "data": {
    "fileId": "abc123",
    "fileName": "report.xlsx",
    "fileSize": 1024000
  }
}
```

### Запуск анализа
```
POST /api/analyze
Content-Type: application/json

{
  "fileId": "abc123",
  "customPrompt": "Сфокусируйся на возвратах"
}

Ответ:
{
  "success": true,
  "data": {
    "analysisId": "xyz789"
  }
}
```

### Получение результатов
```
GET /api/analysis/{id}

Ответ:
{
  "success": true,
  "data": {
    "summary": {...},
    "profitTrends": [...],
    "recommendations": [...]
  }
}
```

## 🎨 Дизайн

- **Тема:** Тёмная по умолчанию (CSS variables для переключения)
- **Шрифт:** Geist от Vercel
- **Эффекты:** Glassmorphism, градиенты, мягкие тени
- **Анимации:** Framer Motion для плавных переходов

## 🗺 Roadmap

### Этап 1 ✅ MVP
- [x] Загрузка файлов
- [x] Mock анализ и результаты
- [x] Интерактивные графики
- [x] Страница отчёта
- [x] Python сервис (структура)

### Этап 2 🔄 В процессе
- [ ] NextAuth интеграция
- [ ] История отчётов
- [ ] Реальный парсинг XLS
- [ ] Экспорт PDF/XLSX

### Этап 3 📋 Планируется
- [ ] AI интеграция (OpenAI/Anthropic)
- [ ] Система подписок (Stripe)
- [ ] База себестоимости
- [ ] Сравнение периодов

## 🤝 Разработка

### Скрипты

```bash
# Разработка
npm run dev

# Сборка
npm run build

# Запуск продакшн
npm start

# Линтинг
npm run lint

# Prisma Studio
npm run db:studio

# Python сервис
npm run python:dev
```

### Структура коммитов
```
feat: добавление новой функции
fix: исправление бага
docs: изменения в документации
style: форматирование кода
refactor: рефакторинг
```

## 📝 Лицензия

MIT License - свободное использование для личных и коммерческих проектов.

---

Сделано с ❤️ для селлеров Ozon
