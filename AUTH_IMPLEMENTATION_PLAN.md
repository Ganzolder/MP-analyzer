# 🔐 План реализации авторизации

## 📊 Текущее состояние

✅ **Уже готово:**
- NextAuth v5 (Auth.js) установлен (`next-auth@5.0.0-beta.4`)
- Схема БД готова (User, Account, Session, VerificationToken)
- Переменные окружения подготовлены (NEXTAUTH_URL, NEXTAUTH_SECRET)
- Связь Report → User уже есть в схеме

❌ **Нужно сделать:**
- Настроить NextAuth конфигурацию
- Добавить провайдеры авторизации
- Обновить API endpoints для проверки авторизации
- Добавить UI для входа/выхода
- Обновить RLS политики в Supabase

---

## 🎯 Рекомендуемый вариант

### **NextAuth v5 (Auth.js) + OAuth провайдеры**

**Почему этот вариант:**
1. ✅ Уже установлен в проекте
2. ✅ Современный и активно развивается
3. ✅ Отлично работает с Next.js 14 App Router
4. ✅ Безопасный (не нужно хранить пароли)
5. ✅ Удобный для пользователей (быстрый вход)

---

## 🔑 Варианты авторизации

### Вариант 1: Только OAuth (рекомендуется для начала)

**Провайдеры:**
- **Google** — самый популярный, легко настроить
- **GitHub** — для разработчиков/технических пользователей
- **Yandex** — для русскоязычных пользователей (опционально)

**Плюсы:**
- ✅ Не нужно хранить пароли
- ✅ Быстрая настройка
- ✅ Высокая безопасность
- ✅ Меньше кода

**Минусы:**
- ❌ Пользователь должен иметь аккаунт в провайдере
- ❌ Нужно регистрировать приложения в OAuth провайдерах

---

### Вариант 2: OAuth + Email/Password

**Дополнительно:**
- Email/password авторизация (Credentials provider)
- Email верификация
- Восстановление пароля

**Плюсы:**
- ✅ Больше вариантов входа
- ✅ Не требует внешних аккаунтов

**Минусы:**
- ❌ Нужно хранить пароли (хэшированные)
- ❌ Нужна система email отправки (Resend, SendGrid)
- ❌ Больше кода и сложности

---

### Вариант 3: Magic Links (без паролей)

**Как работает:**
- Пользователь вводит email
- Получает ссылку для входа
- Переходит по ссылке → авторизован

**Плюсы:**
- ✅ Не нужно помнить пароль
- ✅ Безопасно

**Минусы:**
- ❌ Нужна система email отправки
- ❌ Менее популярный вариант

---

## 💡 Моя рекомендация

### **Начать с Варианта 1: Google + GitHub OAuth**

**Почему:**
1. Быстро настроить (30-60 минут)
2. Безопасно (не храним пароли)
3. Удобно для пользователей
4. Можно добавить Email/Password позже

**План:**
1. Настроить Google OAuth
2. Настроить GitHub OAuth (опционально)
3. Добавить UI для входа
4. Обновить API endpoints
5. Обновить RLS политики

---

## 📋 Что нужно будет сделать

### Шаг 1: Настройка OAuth провайдеров

#### Google OAuth:
1. Создать проект в [Google Cloud Console](https://console.cloud.google.com/)
2. Включить Google+ API
3. Создать OAuth 2.0 credentials
4. Добавить redirect URI: `https://your-app.vercel.app/api/auth/callback/google`
5. Получить Client ID и Client Secret

#### GitHub OAuth:
1. Создать OAuth App в [GitHub Settings](https://github.com/settings/developers)
2. Добавить redirect URI: `https://your-app.vercel.app/api/auth/callback/github`
3. Получить Client ID и Client Secret

---

### Шаг 2: Переменные окружения

Добавить в Vercel Environment Variables:
```env
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=your-secret-key (сгенерировать)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id (опционально)
GITHUB_CLIENT_SECRET=your-github-client-secret (опционально)
```

---

### Шаг 3: Создать NextAuth конфигурацию

Файл: `app/api/auth/[...nextauth]/route.ts`

```typescript
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import GitHub from "next-auth/providers/github"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/db/prisma"

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
      }
      return session
    },
  },
})
```

---

### Шаг 4: Обновить API endpoints

Добавить проверку авторизации в:
- `/api/reports` — фильтровать по userId
- `/api/analyze` — сохранять userId при создании отчёта
- `/api/analysis/[id]` — проверять доступ к отчёту

---

### Шаг 5: Добавить UI компоненты

- Кнопка "Войти" в Header
- Модальное окно входа
- Отображение имени пользователя
- Кнопка "Выйти"

---

### Шаг 6: Обновить RLS политики

В Supabase создать политики:
- Пользователи видят только свои отчёты
- Пользователи могут создавать свои отчёты

---

## ⚡ Быстрый старт (минимальный вариант)

Если нужно быстро:

1. **Только Google OAuth** (самый простой)
2. **Без email/password** (можно добавить позже)
3. **Минимальный UI** (кнопка входа в Header)

**Время реализации:** 1-2 часа

---

## 🔄 Полный вариант

1. Google + GitHub OAuth
2. Email/password (Credentials)
3. Email верификация
4. Восстановление пароля
5. Полный UI (страница настроек, профиль)

**Время реализации:** 4-6 часов

---

## 📦 Нужные пакеты

Уже установлено:
- ✅ `next-auth@5.0.0-beta.4`

Нужно установить:
- `@auth/prisma-adapter` — адаптер для Prisma

---

## 🎨 UI компоненты

Нужно создать:
- `components/auth/LoginButton.tsx` — кнопка входа
- `components/auth/UserMenu.tsx` — меню пользователя
- `components/auth/AuthModal.tsx` — модальное окно входа (опционально)

---

## 🔒 Безопасность

- ✅ Пароли не хранятся (OAuth)
- ✅ Сессии через httpOnly cookies
- ✅ CSRF защита (встроена в NextAuth)
- ✅ RLS политики в Supabase

---

## 📝 Что выбрать?

**Для быстрого старта:**
→ Вариант 1: Только Google OAuth

**Для полноценного решения:**
→ Вариант 2: Google + GitHub + Email/Password

**Для максимальной гибкости:**
→ Вариант 3: Все провайдеры + Magic Links

---

## ❓ Вопросы для решения

1. **Какие провайдеры нужны?**
   - Только Google? (быстро)
   - Google + GitHub? (популярно)
   - Все варианты? (максимальная гибкость)

2. **Нужен ли Email/Password?**
   - Да → больше работы, но больше вариантов
   - Нет → быстрее, но только OAuth

3. **Нужна ли email верификация?**
   - Да → нужна система отправки email
   - Нет → проще

---

## 🚀 Готов начать?

Скажите, какой вариант вам подходит, и я начну реализацию!

**Моя рекомендация:** Начать с **Google OAuth** (самый простой и быстрый вариант), потом можно добавить остальное.
