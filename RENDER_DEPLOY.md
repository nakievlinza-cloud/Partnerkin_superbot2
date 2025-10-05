# 🌟 Деплой на Render.com

## ✨ Преимущества Render:
- 🆓 750 часов/месяц бесплатно
- 🚀 Простой деплой из GitHub
- 🔄 Автоперезапуск
- 📊 Хорошие логи

## 📋 Пошаговая инструкция:

### 1️⃣ Создай GitHub репозиторий
1. **Перейди:** https://github.com/new
2. **Название:** `partnerkin-bot`
3. **Public** ✅
4. **Create repository**

### 2️⃣ Залей код
```bash
# Скопируй URL и выполни:
git remote add origin https://github.com/your_username/partnerkin-bot.git
git push -u origin main
```

### 3️⃣ Деплой на Render
1. **Открой:** https://render.com
2. **Sign Up** через GitHub
3. **New** → **Web Service**
4. **Connect** твой репозиторий
5. **Settings:**
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

### 4️⃣ Environment Variables
Добавь в Render:
- `BOT_TOKEN` = твой_токен_бота
- `NODE_ENV` = production

### 5️⃣ Keep-Alive (важно!)
1. **Перейди:** https://uptimerobot.com
2. **Add Monitor:**
   - URL: `https://your-app.onrender.com/ping`
   - Interval: 5 minutes
3. Это предотвратит засыпание!

## ✅ Результат:
**Бот работает 24/7 бесплатно!** 🎉

---

**Время деплоя: 5-10 минут** ⏱️