// config.js - Конфигурация бота "Жизнь в Партнеркине"

module.exports = {
    // Токен Telegram бота - получите в @BotFather
    TELEGRAM_TOKEN: process.env.BOT_TOKEN || process.env.TELEGRAM_TOKEN || 'ВАШ_ТОКЕН_ЗДЕСЬ',

    // Настройки базы данных
    DATABASE: {
        name: 'partnerkino.db',
        backup_interval: 24 * 60 * 60 * 1000 // 24 часа в миллисекундах
    },

    // Настройки админа
    ADMIN: {
        password: 'partnerkin1212', // Пароль для входа в админку
        max_admins: 5 // Максимальное количество админов
    },

    // Игровые настройки
    GAME: {
        pvp_energy_cost: 20, // Трата энергии за PVP битву
        pvp_coins_stake: 100, // Ставка П-коинов в PVP
        energy_restore_time: 60, // Минуты для восстановления 1% энергии
        max_gift_per_day: 500, // Максимум коинов для подарка в день
        min_gift_amount: 50 // Минимальная сумма подарка
    },

    // Настройки курсов и тестов
    COURSES: {
        test_rewards: {
            'Знакомство с компанией': 100,
            'Основы работы': 150,
            'Продуктовая линейка': 150
        },
        course_rewards: {
            'Основы аналитики': 300,
            'Менеджмент проектов': 400,
            'Маркетинг и реклама': 350,
            'SEO оптимизация': 250
        }
    },

    // Настройки магазина
    SHOP: {
        items: {
            'Выходной день': 100,
            'Мерч компании': 50,
            'Секретный сюрприз': 200,
            'Кофе в офис': 25
        }
    },

    // URL для курсов и тестов
    URLS: {
        tests: 'https://partnerkino.ru/tests/',
        courses: 'https://partnerkino.ru/courses/'
    },

    // Настройки уведомлений
    NOTIFICATIONS: {
        morning_reminder_time: '09:00', // Время утренних напоминаний
        task_reminder_enabled: true,
        event_reminder_hours: 2 // За сколько часов напоминать о мероприятиях
    }
};
