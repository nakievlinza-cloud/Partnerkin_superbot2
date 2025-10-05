// server.js - HTTP сервер для Web App API
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'webapp')));

// База данных (та же что и в боте)
const db = new sqlite3.Database(config.DATABASE.name);

// Функция для проверки данных Telegram Web App
function verifyTelegramWebApp(initData, botToken) {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    const dataCheckString = Array.from(urlParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    return calculatedHash === hash;
}

// API для получения данных пользователя
app.post('/api/user-data', (req, res) => {
    try {
        const { userId, initData } = req.body;

        // Проверяем подлинность данных (в продакшене обязательно!)
        // if (!verifyTelegramWebApp(initData, config.TELEGRAM_TOKEN)) {
        //     return res.status(401).json({ error: 'Invalid init data' });
        // }

        // Получаем данные пользователя
        db.get(`SELECT p_coins FROM users WHERE telegram_id = ?`, [userId], (err, user) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            res.json({
                pCoins: user ? user.p_coins : 0
            });
        });
    } catch (error) {
        console.error('User data error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Health check endpoint для мониторинга
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'partnerkin-bot'
    });
});

// Keep-alive endpoint (для предотвращения засыпания)
app.get('/ping', (req, res) => {
    res.status(200).json({ pong: Date.now() });
});

// Главная страница - статус бота
app.get('/', (req, res) => {
    res.json({
        bot: "Partnerkin SuperBot",
        status: "running",
        version: "2.0",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        message: "🚀 Бот работает 24/7!"
    });
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🌐 Web App server running on port ${PORT}`);
    console.log(`📱 Access your app at: http://localhost:${PORT}`);
});

module.exports = app;