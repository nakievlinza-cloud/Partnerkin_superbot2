# ⚡ Быстрый деплой за 5 минут

## 🎯 Что нужно:
1. **Токен бота** от @BotFather в Telegram
2. **Аккаунт GitHub** (если нет)
3. **5 минут времени**

## 🚀 Пошаговая инструкция:

### 1️⃣ Создай GitHub репозиторий (если нет)
```bash
# В терминале, в папке проекта:
git remote -v
# Если нет origin - создай репозиторий на github.com
```

### 2️⃣ Загрузи код на GitHub
```bash
git push origin main
```

### 3️⃣ Деплой на Railway
1. **Открой** → [railway.app](https://railway.app)
2. **Login** через GitHub
3. **New Project** → **Deploy from GitHub repo**
4. **Выбери** свой репозиторий `partnerkin-bot`
5. **Дождись** завершения деплоя (3-5 мин)

### 4️⃣ Настрой переменные
В Railway Dashboard → **Variables**:
- `BOT_TOKEN` = `твой_токен_от_BotFather`
- `NODE_ENV` = `production`

### 5️⃣ Проверь работу
1. **Открой** ссылку вида `your-app.railway.app`
2. **Добавь** `/health` - должен показать JSON со статусом
3. **Проверь** бота в Telegram

## ✅ Готово!

**Твой бот работает 24/7!** 🎉

### 📊 Мониторинг (опционально):
1. **Перейди** → [uptimerobot.com](https://uptimerobot.com)
2. **Add Monitor**: `https://your-app.railway.app/ping`
3. **Interval**: 5 minutes

---

### 🆘 Если не работает:
1. **Проверь логи** в Railway → Deployments → View Logs
2. **Убедись BOT_TOKEN** правильный
3. **Напиши мне** - помогу разобраться!

**Время деплоя: ~5 минут** ⏱️