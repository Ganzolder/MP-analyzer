# Авторизация Git для push в GitHub

GitHub не принимает обычный пароль при `git push`. Нужен **Personal Access Token (PAT)**.

## Шаги

### 1. Создать токен на GitHub

1. Откройте: **https://github.com/settings/tokens/new**
2. Войдите в аккаунт **Ganzolder**, если попросит.
3. Заполните:
   - **Note:** например `MP-Analyzer push`
   - **Expiration:** 90 days или No expiration (по желанию)
   - **Scopes:** отметьте **repo** (полный доступ к репозиториям)
4. Нажмите **Generate token**.
5. **Скопируйте токен** (вид один раз). Он выглядит как `ghp_xxxxxxxxxxxx`.

### 2. Выполнить push

В терминале в папке проекта:

```powershell
cd c:\MP-Analyzer
git push origin main
```

Когда запросит:
- **Username:** ваш логин GitHub (например `Ganzolder`)
- **Password:** вставьте **токен** (не пароль от аккаунта)

Windows сохранит учётные данные в Credential Manager — при следующих push вводить заново не нужно.

### 3. (Опционально) Сохранить токен в remote URL

Чтобы не вводить токен при каждом push (если не сохранился в менеджере):

```powershell
git remote set-url origin https://Ganzolder:ВАШ_ТОКЕН@github.com/Ganzolder/MP-analyzer.git
git push origin main
```

Замените `ВАШ_ТОКЕН` на скопированный токен. **Не коммитьте этот URL в репозиторий.**
