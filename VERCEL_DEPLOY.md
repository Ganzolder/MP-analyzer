# 🚀 Инструкция по деплою на Vercel

## 📋 Подготовка проекта

### 1. Настройка базы данных

Vercel не поддерживает SQLite в production. Нужно переключиться на PostgreSQL.

#### Вариант A: Использовать Vercel Postgres (рекомендуется)

1. В панели Vercel перейдите в раздел **Storage**
2. Создайте новую **Postgres** базу данных
3. Скопируйте `DATABASE_URL` из настроек базы

#### Вариант B: Использовать внешний PostgreSQL

- [Supabase](https://supabase.com) (бесплатный план)
- [Neon](https://neon.tech) (бесплатный план)
- [Railway](https://railway.app) (бесплатный план)

### 2. Обновление Prisma Schema

Измените `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"  // было: "sqlite"
  url      = env("DATABASE_URL")
}
```

### 3. Создание файла конфигурации Vercel

Создайте файл `vercel.json` в корне проекта (уже создан ниже).

---

## 🔧 Шаг 1: Регистрация на Vercel

1. Перейдите на [vercel.com](https://vercel.com)
2. Нажмите **Sign Up**
3. Войдите через **GitHub** (рекомендуется для автоматического деплоя)

---

## 🔗 Шаг 2: Подключение репозитория

1. В панели Vercel нажмите **Add New Project**
2. Выберите репозиторий `Ganzolder/MP-analyzer`
3. Нажмите **Import**

---

## ⚙️ Шаг 3: Настройка проекта

### 3.1. Framework Preset
- **Framework Preset:** Next.js (автоматически определится)

### 3.2. Build Settings
- **Build Command:** `npm run build` (по умолчанию)
- **Output Directory:** `.next` (по умолчанию)
- **Install Command:** `npm install` (по умолчанию)

### 3.3. Root Directory
- Оставьте пустым (если проект в корне репозитория)

---

## 🔐 Шаг 4: Переменные окружения

В разделе **Environment Variables** добавьте:

### Обязательные переменные:

```env
# База данных (PostgreSQL)
DATABASE_URL="postgresql://user:password@host:5432/database?schema=public"

# NextAuth
NEXTAUTH_URL="https://your-project.vercel.app"
NEXTAUTH_SECRET="сгенерируйте_через_openssl_rand_base64_32"

# AI провайдеры (хотя бы один)
OPENAI_API_KEY="sk-..."
# ИЛИ
ANTHROPIC_API_KEY="sk-ant-..."
# ИЛИ
GOOGLE_GENERATIVE_AI_API_KEY="..."

# ZAI API (если используется)
ZAI_API_KEY="your-zai-api-key"
```

### Опциональные переменные:

```env
# Python сервис (если деплоите отдельно)
PYTHON_SERVICE_URL="https://your-python-service.vercel.app"

# Stripe (если используется)
STRIPE_PUBLIC_KEY="pk_..."
STRIPE_SECRET_KEY="sk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Аналитика
NEXT_PUBLIC_ANALYTICS_ID="your-analytics-id"

# Настройки файлов
MAX_FILE_SIZE="52428800"
UPLOAD_DIR="./uploads"
```

### Генерация NEXTAUTH_SECRET:

```bash
openssl rand -base64 32
```

Или онлайн: https://generate-secret.vercel.app/32

---

## 🗄️ Шаг 5: Настройка базы данных

### 5.1. Обновите Prisma Schema

Измените `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 5.2. Создайте миграции

```bash
npx prisma migrate dev --name init
```

### 5.3. Сгенерируйте Prisma Client

```bash
npx prisma generate
```

### 5.4. Примените миграции на production

После деплоя на Vercel, в настройках проекта добавьте **Build Command**:

```bash
npx prisma generate && npx prisma migrate deploy && npm run build
```

Или используйте Vercel Postgres, который автоматически применит миграции.

---

## 🐍 Шаг 6: Python сервис (опционально)

Если используете Python сервис для декодирования файлов:

### Вариант A: Отключить Python сервис

Измените `next.config.js`:

```js
const nextConfig = {
  // Убрать rewrites для Python API
  // async rewrites() { ... }
};
```

И обновите код, чтобы не использовать Python API.

### Вариант B: Деплой Python сервиса отдельно

1. Создайте отдельный проект на Vercel для Python сервиса
2. Используйте Vercel Serverless Functions для Python
3. Обновите `PYTHON_SERVICE_URL` в переменных окружения

---

## 📦 Шаг 7: Деплой

1. Нажмите **Deploy** в панели Vercel
2. Дождитесь завершения сборки (2-5 минут)
3. После успешного деплоя получите URL: `https://your-project.vercel.app`

---

## 🔄 Шаг 8: Автоматический деплой

После первого деплоя Vercel автоматически будет деплоить при каждом push в `main` ветку.

---

## 🛠️ Шаг 9: Post-Deploy скрипты

### Применить миграции базы данных

После первого деплоя выполните:

```bash
npx prisma migrate deploy
```

Или через Vercel CLI:

```bash
vercel env pull .env.local
npx prisma migrate deploy
```

---

## 📝 Создание vercel.json (опционально)

Создайте файл `vercel.json` в корне проекта:

```json
{
  "buildCommand": "npx prisma generate && npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["iad1"],
  "env": {
    "SKIP_ENV_VALIDATION": "true"
  }
}
```

---

## 🐛 Решение проблем

### Ошибка: "Prisma Client not generated"

**Решение:** Добавьте в Build Command:
```bash
npx prisma generate && npm run build
```

### Ошибка: "Database connection failed"

**Решение:**
1. Проверьте `DATABASE_URL` в Environment Variables
2. Убедитесь, что база данных доступна из интернета
3. Проверьте firewall настройки базы данных

### Ошибка: "Module not found"

**Решение:**
1. Проверьте, что все зависимости в `package.json`
2. Убедитесь, что `node_modules` не в `.gitignore` (но он должен быть)
3. Vercel автоматически установит зависимости

### Ошибка: "Build timeout"

**Решение:**
1. Оптимизируйте сборку (уменьшите размер бандла)
2. Используйте Vercel Pro план (увеличивает лимит времени)

---

## 📊 Мониторинг

После деплоя вы можете:

1. **Просматривать логи:** Vercel Dashboard → Your Project → Logs
2. **Мониторить производительность:** Vercel Dashboard → Analytics
3. **Проверять ошибки:** Vercel Dashboard → Functions → Error Logs

---

## 🔒 Безопасность

1. **Никогда не коммитьте `.env` файлы**
2. **Используйте Environment Variables в Vercel**
3. **Регулярно обновляйте зависимости:** `npm audit fix`
4. **Используйте HTTPS** (автоматически на Vercel)

---

## 📚 Полезные ссылки

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js on Vercel](https://vercel.com/docs/frameworks/nextjs)
- [Prisma with Vercel](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-vercel)
- [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)

---

## ✅ Чеклист перед деплоем

- [ ] Prisma Schema обновлён на PostgreSQL
- [ ] Все переменные окружения добавлены в Vercel
- [ ] `NEXTAUTH_SECRET` сгенерирован
- [ ] `DATABASE_URL` настроен (PostgreSQL)
- [ ] Миграции созданы локально
- [ ] Код закоммичен и запушен на GitHub
- [ ] Python сервис обработан (отключён или деплоится отдельно)
- [ ] `.env` файлы не закоммичены

---

## 🎉 Готово!

После выполнения всех шагов ваш проект будет доступен по адресу:
`https://your-project.vercel.app`

Удачи с деплоем! 🚀
