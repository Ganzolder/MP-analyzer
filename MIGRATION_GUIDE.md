# 📦 Руководство по миграции на PostgreSQL

## ✅ Шаг 1: Обновление Prisma Schema - ВЫПОЛНЕНО

Файл `prisma/schema.prisma` обновлён:
- ✅ Изменён `provider` с `sqlite` на `postgresql`
- ✅ Prisma Client сгенерирован

## 🔧 Шаг 2: Создание миграций

### Вариант A: С реальной базой данных (рекомендуется)

1. **Создайте PostgreSQL базу данных:**
   - Vercel Postgres: https://vercel.com/docs/storage/vercel-postgres
   - Supabase: https://supabase.com
   - Neon: https://neon.tech

2. **Добавьте DATABASE_URL в `.env.local`:**
   ```env
   DATABASE_URL="postgresql://user:password@host:5432/database?schema=public"
   ```

3. **Создайте начальную миграцию:**
   ```bash
   npx prisma migrate dev --name init
   ```

4. **Примените миграции:**
   ```bash
   npx prisma migrate deploy
   ```

### Вариант B: Без локальной базы (для Vercel)

Миграции будут созданы автоматически при первом деплое на Vercel, если:
- В `vercel.json` указан `buildCommand` с `prisma generate`
- В Environment Variables добавлен `DATABASE_URL`

## 🚀 Для Vercel

После настройки базы данных на Vercel:

1. **Добавьте DATABASE_URL в Environment Variables Vercel**
2. **Vercel автоматически выполнит:**
   - `npx prisma generate` (из `vercel.json`)
   - `npm run build`

3. **Примените миграции вручную (один раз):**
   ```bash
   # Через Vercel CLI
   vercel env pull .env.local
   npx prisma migrate deploy
   
   # Или через Vercel Dashboard → Storage → Postgres → Run SQL
   # Скопируйте SQL из prisma/migrations/XXXX_init/migration.sql
   ```

## 📝 Проверка

После применения миграций проверьте:

```bash
# Проверить статус миграций
npx prisma migrate status

# Открыть Prisma Studio
npx prisma studio
```

## ⚠️ Важно

- **Не коммитьте** `.env` файлы с реальными DATABASE_URL
- **Коммитьте** папку `prisma/migrations/` (после создания)
- **Не коммитьте** SQLite базы данных (`*.db`, `*.db-journal`)

## 🔄 Откат на SQLite (если нужно)

Если нужно вернуться на SQLite для локальной разработки:

1. Измените `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

2. В `.env.local`:
   ```env
   DATABASE_URL="file:./prisma/dev.db"
   ```

3. Выполните:
   ```bash
   npx prisma db push
   ```

---

**Следующий шаг:** Настройте базу данных PostgreSQL и создайте миграции.
