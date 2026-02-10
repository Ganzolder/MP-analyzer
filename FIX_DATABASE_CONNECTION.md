# 🔧 Исправление подключения к базе данных

## ❌ Проблема

```
Can't reach database server at `db.vkazxfjimigdixvphori.supabase.co:5432`
```

Это означает, что приложение не может подключиться к Supabase.

---

## ✅ Решение

### Шаг 1: Получите правильный Connection String

1. Откройте **Supabase Dashboard**: https://supabase.com/dashboard
2. Выберите ваш проект
3. Перейдите в **Settings** → **Database**
4. Найдите секцию **"Connection string"**
5. Выберите вкладку **"URI"**
6. Скопируйте строку подключения

**Формат должен быть:**
```
postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

**ИЛИ (прямое подключение):**
```
postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

---

### Шаг 2: Добавьте DATABASE_URL в Vercel

1. Откройте **Vercel Dashboard**: https://vercel.com/dashboard
2. Выберите ваш проект
3. Перейдите в **Settings** → **Environment Variables**
4. Найдите переменную `DATABASE_URL` (если есть) или создайте новую
5. Вставьте скопированный Connection String
6. **ВАЖНО:** Замените `[YOUR-PASSWORD]` на реальный пароль базы данных

**Где взять пароль:**
- Supabase Dashboard → Settings → Database → **Database password**
- Если не помните пароль → **Reset database password**

---

### Шаг 3: Используйте правильный формат

#### Вариант 1: Connection Pooling (рекомендуется для Vercel)

```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Преимущества:**
- Лучше для serverless функций
- Меньше проблем с подключениями
- Рекомендуется Vercel

#### Вариант 2: Прямое подключение

```
postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

**Используйте, если:**
- Pooling не работает
- Нужно прямое подключение

---

### Шаг 4: Проверьте параметры подключения

В Connection String должны быть:
- ✅ Правильный хост (db.xxx.supabase.co или aws-0-xxx.pooler.supabase.com)
- ✅ Правильный порт (5432 для прямого, 6543 для pooling)
- ✅ Правильный пароль (не `[YOUR-PASSWORD]`, а реальный пароль!)
- ✅ Правильный database name (обычно `postgres`)

---

### Шаг 5: Передеплойте проект

После изменения Environment Variables:

1. **Автоматический передеплой:**
   - Vercel автоматически передеплоит при изменении env vars
   - Или сделайте новый commit и push

2. **Ручной передеплой:**
   - Vercel Dashboard → Deployments
   - Нажмите "..." → "Redeploy"

---

### Шаг 6: Проверьте подключение

После деплоя откройте:
```
https://your-app.vercel.app/api/health/db
```

**Ожидаемый результат:**
```json
{
  "success": true,
  "checks": {
    "connection": true,
    "write": true,
    "read": true
  }
}
```

---

## 🔍 Частые ошибки

### Ошибка 1: "Can't reach database server"

**Причины:**
- ❌ Неправильный хост в DATABASE_URL
- ❌ Неправильный порт
- ❌ Пароль не заменён (остался `[YOUR-PASSWORD]`)
- ❌ Supabase проект заблокирован или удалён

**Решение:**
- Проверьте Connection String в Supabase Dashboard
- Убедитесь, что пароль правильный
- Проверьте, что проект активен в Supabase

---

### Ошибка 2: "password authentication failed"

**Причина:**
- Неправильный пароль

**Решение:**
- Сбросьте пароль в Supabase Dashboard
- Обновите DATABASE_URL в Vercel

---

### Ошибка 3: "connection timeout"

**Причина:**
- Проблемы с сетью
- Неправильный хост/порт

**Решение:**
- Используйте Connection Pooling (порт 6543)
- Проверьте, что проект активен

---

## 📋 Чеклист

- [ ] Открыл Supabase Dashboard → Settings → Database
- [ ] Скопировал Connection String (URI)
- [ ] Заменил `[YOUR-PASSWORD]` на реальный пароль
- [ ] Добавил/обновил `DATABASE_URL` в Vercel Environment Variables
- [ ] Передеплоил проект
- [ ] Проверил `/api/health/db` — должно быть `"connection": true`

---

## 💡 Рекомендации

### Используйте Connection Pooling для Vercel

Vercel использует serverless функции, которые создают много подключений. Connection Pooling помогает управлять этим.

**Формат:**
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Где найти:**
- Supabase Dashboard → Settings → Database → Connection string → **"Session mode"** или **"Transaction mode"**

---

## 🆘 Если ничего не помогает

1. **Проверьте статус Supabase проекта:**
   - Убедитесь, что проект не заблокирован
   - Проверьте, что проект активен

2. **Создайте новый проект Supabase:**
   - Если старый не работает, создайте новый
   - Скопируйте Connection String из нового проекта

3. **Используйте прямую строку подключения:**
   - Иногда pooling не работает
   - Попробуйте прямое подключение (порт 5432)

---

## 📞 Дополнительная помощь

Если проблема остаётся:
1. Скопируйте точный Connection String из Supabase (без пароля)
2. Проверьте, что пароль правильный
3. Убедитесь, что проект активен в Supabase Dashboard
