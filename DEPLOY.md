# 🚀 Инструкция по деплою на Vercel

## Предварительная подготовка

### 1. ✅ Проверка Git репозитория

Убедитесь, что все изменения закоммичены:

```bash
git status
git add .
git commit -m "Prepare for deployment"
git push
```

### 2. ✅ Настройка переменных окружения в Vercel

Перейдите в **Vercel Dashboard → Your Project → Settings → Environment Variables** и добавьте:

#### Обязательные переменные:

```env
# База данных Supabase (PostgreSQL)
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.vkazxfjimigdixvphori.supabase.co:5432/postgres"

# NextAuth
NEXTAUTH_URL="https://your-app.vercel.app"
NEXTAUTH_SECRET="your-secret-key-generate-with-openssl-rand-base64-32"
```

#### Опциональные переменные (для AI-функций):

```env
# AI Providers (если используете)
ZAI_API_KEY="your-zai-api-key"
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY=""
GOOGLE_GENERATIVE_AI_API_KEY=""

# Python Service (если используете)
PYTHON_SERVICE_URL="https://your-python-service.vercel.app"
```

### 3. ✅ Применение миграций БД

**Важно:** Перед деплоем убедитесь, что миграции применены к Supabase:

1. Откройте **Supabase Dashboard → SQL Editor**
2. Выполните миграции из `prisma/migrations/` (если есть)
3. Примените RLS политики из `prisma/migrations/setup-rls.sql`

### 4. ✅ Проверка vercel.json

Файл `vercel.json` уже настроен:
- ✅ Build команда включает `prisma generate`
- ✅ API routes имеют увеличенный timeout (300s)
- ✅ Увеличена память для API функций (3008MB)

## Процесс деплоя

### Вариант 1: Деплой через Vercel CLI (рекомендуется)

```bash
# Установка Vercel CLI (если не установлен)
npm i -g vercel

# Логин в Vercel
vercel login

# Деплой
vercel --prod
```

### Вариант 2: Деплой через GitHub/GitLab

1. Подключите репозиторий к Vercel:
   - Vercel Dashboard → **Add New Project**
   - Выберите ваш Git репозиторий
   - Настройте переменные окружения (см. выше)

2. Vercel автоматически задеплоит при каждом push в `main`/`master`

### Вариант 3: Деплой через Vercel Dashboard

1. Vercel Dashboard → **Deployments**
2. Нажмите **Deploy**
3. Выберите репозиторий и ветку

## После деплоя

### 1. Проверка работоспособности

Откройте endpoint проверки БД:
```
https://your-app.vercel.app/api/health/db
```

Должен вернуть:
```json
{
  "success": true,
  "checks": {
    "connection": true,
    "tables": {...},
    "write": true,
    "read": true
  },
  "message": "✅ База данных настроена правильно"
}
```

### 2. Проверка основных страниц

- ✅ Главная: `https://your-app.vercel.app`
- ✅ Калькулятор: `https://your-app.vercel.app/calculator`
- ✅ API Reports: `https://your-app.vercel.app/api/reports`

### 3. Тестовая загрузка файла

1. Загрузите тестовый файл на главной странице
2. Проверьте, что анализ запустился
3. Проверьте Supabase Dashboard → Table Editor → Report
4. Должна появиться новая запись

## Возможные проблемы

### Ошибка: "Prisma Client not generated"

**Решение:**
- Убедитесь, что в `package.json` есть `"postinstall": "prisma generate"`
- Проверьте, что `vercel.json` содержит `"buildCommand": "npx prisma generate && npm run build"`

### Ошибка: "Database connection failed"

**Решение:**
- Проверьте `DATABASE_URL` в Vercel Environment Variables
- Убедитесь, что пароль правильный
- Проверьте, что Supabase проект не заблокирован

### Ошибка: "RLS policy violation"

**Решение:**
- Примените `prisma/migrations/setup-rls.sql` в Supabase SQL Editor
- Проверьте политики в Supabase Dashboard → Authentication → Policies

### Ошибка: "Function timeout"

**Решение:**
- `vercel.json` уже настроен с `maxDuration: 300`
- Если нужно больше, увеличьте в Vercel Dashboard → Functions

### Медленная сборка

**Решение:**
- Используйте Vercel Build Cache
- Проверьте, что `node_modules` не коммитятся в Git

## Автоматические деплои

После настройки, каждый push в `main`/`master` будет автоматически деплоиться на production.

Для preview деплоев (для других веток):
- Vercel автоматически создаст preview URL для каждого PR

## Мониторинг

- **Vercel Dashboard → Deployments** - история деплоев
- **Vercel Dashboard → Analytics** - метрики производительности
- **Vercel Dashboard → Functions** - логи API routes
- **Supabase Dashboard → Logs** - логи БД

## Откат (Rollback)

Если что-то пошло не так:

1. Vercel Dashboard → **Deployments**
2. Найдите предыдущий успешный деплой
3. Нажмите **"..." → Promote to Production**

## Чеклист перед деплоем

- [ ] Все изменения закоммичены и запушены
- [ ] `DATABASE_URL` настроен в Vercel
- [ ] `NEXTAUTH_URL` и `NEXTAUTH_SECRET` настроены
- [ ] Миграции БД применены в Supabase
- [ ] RLS политики применены
- [ ] Локально всё работает (`npm run build` успешен)
- [ ] Нет ошибок линтера (`npm run lint`)

## Полезные команды

```bash
# Локальная проверка сборки
npm run build

# Проверка БД
npm run db:check

# Генерация Prisma клиента
npm run db:generate

# Применение миграций (локально)
npm run db:migrate

# Применение миграций (production)
npm run db:migrate:deploy
```
