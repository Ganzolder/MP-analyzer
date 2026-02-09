# 🚀 Быстрый деплой на Vercel

## ✅ Что уже готово:

1. ✅ Код закоммичен и запушен в `main`
2. ✅ `vercel.json` настроен
3. ✅ `package.json` содержит `postinstall` для Prisma
4. ✅ Все необходимые файлы в репозитории

## 📋 Шаги для деплоя:

### Вариант 1: Через Vercel Dashboard (самый простой)

1. Откройте https://vercel.com
2. Войдите в аккаунт
3. Нажмите **"Add New Project"**
4. Выберите ваш репозиторий `MP-analyzer`
5. Настройте переменные окружения (см. ниже)
6. Нажмите **"Deploy"**

### Вариант 2: Через Vercel CLI

```bash
# Установка Vercel CLI
npm i -g vercel

# Логин
vercel login

# Деплой
vercel --prod
```

## 🔐 Обязательные переменные окружения в Vercel:

Перейдите в **Settings → Environment Variables** и добавьте:

### 1. DATABASE_URL (обязательно)
```
postgresql://postgres:[YOUR-PASSWORD]@db.vkazxfjimigdixvphori.supabase.co:5432/postgres
```

### 2. NEXTAUTH_URL (обязательно)
```
https://your-app-name.vercel.app
```
*(Замените `your-app-name` на реальное имя вашего проекта)*

### 3. NEXTAUTH_SECRET (обязательно)
Сгенерируйте секрет:
```bash
openssl rand -base64 32
```
Или используйте любой случайный длинный строковый ключ.

### 4. Опционально (для AI функций):
- `ZAI_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`

## ✅ После деплоя:

1. **Проверьте БД:**
   ```
   https://your-app.vercel.app/api/health/db
   ```
   Должен вернуть `"success": true`

2. **Проверьте главную страницу:**
   ```
   https://your-app.vercel.app
   ```

3. **Проверьте калькулятор:**
   ```
   https://your-app.vercel.app/calculator
   ```

## 🔄 Автоматические деплои:

После первого деплоя, каждый push в `main` будет автоматически деплоиться.

## 📝 Примечания:

- Vercel автоматически выполнит `npm install` и `npm run build`
- Prisma клиент будет сгенерирован через `postinstall` скрипт
- Миграции БД нужно применить вручную в Supabase (если еще не применены)

## 🆘 Если что-то пошло не так:

1. Проверьте логи в Vercel Dashboard → Deployments → [ваш деплой] → Logs
2. Проверьте переменные окружения
3. Проверьте подключение к Supabase через `/api/health/db`
