# 🔧 Исправление подключения: IPv4 проблема

## ❌ Проблема

Vercel использует **IPv4-only сеть**, а Supabase **Direct connection** (порт 5432) не поддерживает IPv4.

**Ошибка:**
```
Can't reach database server at `db.vkazxfjimigdixvphori.supabase.co:5432`
```

**Решение:** Использовать **Session Pooler** (порт 6543) вместо Direct connection.

---

## ✅ Решение: Использовать Session Pooler

### Шаг 1: Получите Connection String с Pooler

1. Откройте **Supabase Dashboard** → ваш проект
2. Перейдите в **Settings** → **Database**
3. Найдите секцию **"Connection string"**
4. **ВАЖНО:** Выберите:
   - **Type:** `URI` (уже выбрано)
   - **Source:** `Primary Database` (уже выбрано)
   - **Method:** **`Session mode`** или **`Transaction mode`** ← ИЗМЕНИТЕ НА ЭТО!

5. Скопируйте Connection String — он будет с портом **6543** и хостом **pooler.supabase.com**

**Формат будет:**
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
```

**ИЛИ:**
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@[REGION].pooler.supabase.com:6543/postgres
```

---

### Шаг 2: Обновите DATABASE_URL в Vercel

1. Откройте **Vercel Dashboard** → ваш проект → **Settings** → **Environment Variables**
2. Найдите переменную `DATABASE_URL`
3. Нажмите на неё для редактирования
4. Замените значение на Connection String с **Pooler** (порт 6543)
5. **ВАЖНО:** Замените `[YOUR-PASSWORD]` на реальный пароль
6. Сохраните

**Пример правильного значения:**
```
postgresql://postgres.vkazxfjimigdixvphori:ZhP1nX87L0Yh6nyQ@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Обратите внимание:**
- ✅ Порт: **6543** (не 5432!)
- ✅ Хост: **pooler.supabase.com** (не db.xxx.supabase.co!)
- ✅ Параметр: `?pgbouncer=true` (если есть в Supabase)

---

### Шаг 3: Передеплойте проект

После изменения `DATABASE_URL`:

1. Vercel автоматически передеплоит
2. Или вручную: **Deployments** → "..." → **"Redeploy"**

---

### Шаг 4: Проверьте подключение

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

## 🔍 Как найти Pooler Connection String в Supabase

### Вариант 1: Через Connection String

1. Supabase Dashboard → Settings → Database
2. Connection string
3. Измените **Method** на **"Session mode"** или **"Transaction mode"**
4. Скопируйте строку

### Вариант 2: Вручную собрать

Если не можете найти Pooler connection:

1. Найдите ваш **Project Reference** (например, `vkazxfjimigdixvphori`)
2. Найдите ваш **Region** (например, `us-east-1` или другой)
3. Соберите строку:

```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Пример:**
```
postgresql://postgres.vkazxfjimigdixvphori:ZhP1nX87L0Yh6nyQ@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

---

## 📋 Чеклист

- [ ] Открыл Supabase Dashboard → Settings → Database
- [ ] Изменил Method на "Session mode" или "Transaction mode"
- [ ] Скопировал Connection String с портом 6543
- [ ] Заменил `[YOUR-PASSWORD]` на реальный пароль
- [ ] Обновил `DATABASE_URL` в Vercel
- [ ] Передеплоил проект
- [ ] Проверил `/api/health/db` — должно быть `"connection": true`

---

## ⚠️ Важно

- **НЕ используйте Direct connection** (порт 5432) для Vercel
- **Используйте Session Pooler** (порт 6543)
- Pooler специально создан для serverless функций (Vercel, AWS Lambda и т.д.)

---

## 🆘 Если Pooler тоже не работает

1. Проверьте, что пароль правильный
2. Убедитесь, что проект активен в Supabase
3. Попробуйте другой режим Pooler (Session mode вместо Transaction mode или наоборот)
4. Проверьте, что в Connection String нет лишних пробелов

---

## 💡 Разница между режимами

- **Session mode** — одно подключение на сессию (рекомендуется для большинства случаев)
- **Transaction mode** — одно подключение на транзакцию (для коротких запросов)

Для Vercel обычно лучше **Session mode**.
