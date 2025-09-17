// app.js - Бот "Жизнь в Партнеркино" - ИСПРАВЛЕННАЯ ВЕРСИЯ 🚀
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();

// ЗАМЕНИТЕ НА ВАШ ТОКЕН ОТ BOTFATHER
const token = '7774658901:AAH2hgG6VZotlEBrts81LUFME8K6v4jGQQc';

const bot = new TelegramBot(token, {
    polling: {
        interval: 300,
        autoStart: true,
        params: {
            timeout: 10
        }
    }
});

// Глобальные переменные для состояний
global.userScreenshots = {};
global.waitingForPoints = {};
global.adminStates = {};

// База данных
const db = new sqlite3.Database('partnerkino.db');

// Создание таблиц
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        telegram_id INTEGER UNIQUE,
        username TEXT,
        full_name TEXT,
        role TEXT DEFAULT 'новичок',
        p_coins INTEGER DEFAULT 0,
        energy INTEGER DEFAULT 100,
        registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        contacts TEXT,
        is_registered INTEGER DEFAULT 0
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS intern_progress (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        test_name TEXT,
        completed INTEGER DEFAULT 0,
        points_earned INTEGER DEFAULT 0,
        completed_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS test_submissions (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        telegram_id INTEGER,
        username TEXT,
        test_name TEXT,
        points_claimed INTEGER,
        photo_file_id TEXT,
        status TEXT DEFAULT 'pending',
        submitted_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        admin_id INTEGER,
        reviewed_date DATETIME,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        telegram_id INTEGER,
        granted_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS battles (
        id INTEGER PRIMARY KEY,
        attacker_id INTEGER,
        defender_id INTEGER,
        winner_id INTEGER,
        points_won INTEGER,
        battle_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(attacker_id) REFERENCES users(id),
        FOREIGN KEY(defender_id) REFERENCES users(id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        item_name TEXT,
        price INTEGER,
        purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
    
    // Тайм-слоты для мероприятий
    db.run(`CREATE TABLE IF NOT EXISTS event_slots (
        id INTEGER PRIMARY KEY,
        event_name TEXT,
        category TEXT,
        date TEXT,
        time TEXT,
        location TEXT,
        max_participants INTEGER DEFAULT 10,
        current_participants INTEGER DEFAULT 0,
        points_reward INTEGER DEFAULT 5,
        status TEXT DEFAULT 'active',
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Записи на мероприятия
    db.run(`CREATE TABLE IF NOT EXISTS event_bookings (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        slot_id INTEGER,
        booking_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(slot_id) REFERENCES event_slots(id)
    )`);
    
    console.log('🚀 База данных готова к работе!');
});

// ========== КЛАВИАТУРЫ ==========

const startKeyboard = {
    reply_markup: {
        keyboard: [['👶 Я стажер', '🧓 Я старичок']],
        resize_keyboard: true,
        one_time_keyboard: true
    }
};

const internMenuKeyboard = {
    reply_markup: {
        keyboard: [
            ['📚 Пройти тестирование'],
            ['💰 Мой баланс', '📊 Мой прогресс'],
            ['🔄 Главное меню']
        ],
        resize_keyboard: true
    }
};

const mainMenuKeyboard = {
    reply_markup: {
        keyboard: [
            ['💰 Мой баланс', '⚔️ PVP Сражения'],
            ['🛒 Магазин', '🎓 Курсы'],
            ['🎯 Мероприятия', '📋 Задачи'],
            ['🎁 Подарить баллы', '📊 Статистика']
        ],
        resize_keyboard: true
    }
};

const testKeyboard = {
    reply_markup: {
        keyboard: [
            ['🌟 Знакомство с компанией', '📈 Основы работы'],
            ['🎯 Продуктовая линейка', '📊 Мой прогресс'],
            ['🔙 Назад в меню']
        ],
        resize_keyboard: true
    }
};

const pvpKeyboard = {
    reply_markup: {
        keyboard: [
            ['🎯 Найти противника', '🏆 Мой рейтинг'],
            ['⚡ Восстановить энергию', '🔙 Назад в меню']
        ],
        resize_keyboard: true
    }
};

const shopKeyboard = {
    reply_markup: {
        keyboard: [
            ['🏖️ Выходной день (100 💰)', '👕 Мерч компании (50 💰)'],
            ['🎁 Секретный сюрприз (200 💰)', '☕ Кофе в офис (25 💰)'],
            ['🔙 Назад в меню']
        ],
        resize_keyboard: true
    }
};

const coursesKeyboard = {
    reply_markup: {
        keyboard: [
            ['📊 Основы аналитики (+30 💰)', '💼 Менеджмент проектов (+40 💰)'],
            ['🎯 Маркетинг и реклама (+35 💰)', '🔍 SEO оптимизация (+25 💰)'],
            ['🔙 Назад в меню']
        ],
        resize_keyboard: true
    }
};

const eventsKeyboard = {
    reply_markup: {
        keyboard: [
            ['🏃‍♂️ Зарядка', '🎰 Покер'],
            ['🎉 Корпоратив', '📚 Тренинги'],
            ['📅 Все мероприятия', '🔙 Назад в меню']
        ],
        resize_keyboard: true
    }
};

const adminKeyboard = {
    reply_markup: {
        keyboard: [
            ['🗓️ Создать мероприятие', '📅 Управление слотами'],
            ['📋 Заявки на проверку', '👥 Пользователи'],
            ['📊 Статистика', '🔙 Выйти из админки']
        ],
        resize_keyboard: true
    }
};

// Клавиатуры для создания мероприятий
const eventCategoryKeyboard = {
    reply_markup: {
        keyboard: [
            ['🏃‍♂️ Зарядка', '🎰 Покер'],
            ['🎉 Корпоратив', '📚 Тренинги'],
            ['⚽ Спорт', '🍕 Обеды'],
            ['❌ Отмена']
        ],
        resize_keyboard: true
    }
};

// ========== ОСНОВНЫЕ КОМАНДЫ ==========

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
        db.get("SELECT * FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (err) {
                console.log('❌ DB Error:', err);
                return;
            }
            
            if (user && user.is_registered === 1) {
                showMainMenu(chatId, user);
            } else {
                bot.sendMessage(chatId, 
                    '🎉 Добро пожаловать в "Жизнь в Партнеркино"! 🚀\n\n' +
                    '💫 Кто ты в нашей команде? 👇', 
                    startKeyboard).catch(console.error);
            }
        });
    } catch (error) {
        console.error('❌ Start command error:', error);
    }
});

// ========== ОБРАБОТКА СООБЩЕНИЙ ==========

bot.on('message', (msg) => {
    try {
        const chatId = msg.chat.id;
        const text = msg.text;
        const telegramId = msg.from.id;
        const username = msg.from.username || 'user';
        
        if (text && text.startsWith('/')) return;
        
        // Обработка скриншотов
        if (msg.photo) {
            handleScreenshot(chatId, telegramId, msg.photo[msg.photo.length - 1].file_id, username);
            return;
        }
        
        if (!text) return;
        
        // РЕГИСТРАЦИЯ
        if (text === '👶 Я стажер') {
            registerUser(chatId, telegramId, username, 'стажер');
        } 
        else if (text === '🧓 Я старичок') {
            registerUser(chatId, telegramId, username, 'старичок');
        }
        
        // ВХОД В АДМИНКУ
        else if (text === 'partnerkin1212') {
            handleAdminLogin(chatId, telegramId);
        }
        
        // ========== АДМИНСКИЕ ФУНКЦИИ ==========
        else if (text === '🗓️ Создать мероприятие') {
            startEventCreation(chatId, telegramId);
        }
        else if (text === '📅 Управление слотами') {
            showSlotManagement(chatId, telegramId);
        }
        else if (text === '📋 Заявки на проверку') {
            showTestSubmissions(chatId, telegramId);
        }
        else if (text === '👥 Пользователи') {
            showUsersList(chatId, telegramId);
        }
        else if (text === '🔙 Выйти из админки') {
            exitAdminMode(chatId, telegramId);
        }
        
        // ========== ОСНОВНОЕ МЕНЮ ==========
        else if (text === '💰 Мой баланс') {
            showBalance(chatId, telegramId);
        }
        else if (text === '📚 Пройти тестирование') {
            showTestMenu(chatId);
        }
        else if (text === '📊 Мой прогресс') {
            showInternProgress(chatId, telegramId);
        }
        else if (text === '🔄 Главное меню' || text === '🔙 Назад в меню') {
            backToMainMenu(chatId, telegramId);
        }
        
        // ========== ТЕСТЫ ДЛЯ СТАЖЕРОВ ==========
        else if (text === '🌟 Знакомство с компанией') {
            selectTest(chatId, telegramId, 'Знакомство с компанией', 10);
        }
        else if (text === '📈 Основы работы') {
            selectTest(chatId, telegramId, 'Основы работы', 15);
        }
        else if (text === '🎯 Продуктовая линейка') {
            selectTest(chatId, telegramId, 'Продуктовая линейка', 15);
        }
        
        // ========== ФУНКЦИИ ДЛЯ СТАРИЧКОВ ==========
        else if (text === '⚔️ PVP Сражения') {
            showPVPMenu(chatId, telegramId);
        }
        else if (text === '🛒 Магазин') {
            showShop(chatId, telegramId);
        }
        else if (text === '🎓 Курсы') {
            showCoursesMenu(chatId);
        }
        else if (text === '🎯 Мероприятия') {
            showEventsMenu(chatId);
        }
        else if (text === '📋 Задачи') {
            showTasksInfo(chatId);
        }
        else if (text === '🎁 Подарить баллы') {
            showGiftPointsInfo(chatId);
        }
        else if (text === '📊 Статистика') {
            showUserStats(chatId, telegramId);
        }
        
        // ========== PVP МЕНЮ ==========
        else if (text === '🎯 Найти противника') {
            findOpponent(chatId, telegramId);
        }
        else if (text === '🏆 Мой рейтинг') {
            showRating(chatId, telegramId);
        }
        else if (text === '⚡ Восстановить энергию') {
            restoreEnergy(chatId, telegramId);
        }
        
        // ========== КУРСЫ ==========
        else if (text.includes('📊 Основы аналитики')) {
            selectCourse(chatId, telegramId, 'Основы аналитики', 30);
        }
        else if (text.includes('💼 Менеджмент проектов')) {
            selectCourse(chatId, telegramId, 'Менеджмент проектов', 40);
        }
        else if (text.includes('🎯 Маркетинг и реклама')) {
            selectCourse(chatId, telegramId, 'Маркетинг и реклама', 35);
        }
        else if (text.includes('🔍 SEO оптимизация')) {
            selectCourse(chatId, telegramId, 'SEO оптимизация', 25);
        }
        
        // ========== МАГАЗИН ==========
        else if (text.includes('🏖️ Выходной день')) {
            buyItem(chatId, telegramId, 'Выходной день', 100);
        }
        else if (text.includes('👕 Мерч компании')) {
            buyItem(chatId, telegramId, 'Мерч компании', 50);
        }
        else if (text.includes('🎁 Секретный сюрприз')) {
            buyItem(chatId, telegramId, 'Секретный сюрприз', 200);
        }
        else if (text.includes('☕ Кофе в офис')) {
            buyItem(chatId, telegramId, 'Кофе в офис', 25);
        }
        
        // ========== МЕРОПРИЯТИЯ ==========
        else if (text === '🏃‍♂️ Зарядка') {
            showEventSlots(chatId, telegramId, 'Зарядка');
        }
        else if (text === '🎰 Покер') {
            showEventSlots(chatId, telegramId, 'Покер');
        }
        else if (text === '🎉 Корпоратив') {
            showEventSlots(chatId, telegramId, 'Корпоратив');
        }
        else if (text === '📚 Тренинги') {
            showEventSlots(chatId, telegramId, 'Тренинги');
        }
        else if (text === '📅 Все мероприятия') {
            showAllEventSlots(chatId);
        }
        
        // Обработка текстового ввода и состояний админа
        else {
            handleTextInput(chatId, telegramId, text, username);
        }
        
    } catch (error) {
        console.error('❌ Message handler error:', error);
        bot.sendMessage(msg.chat.id, '🚨 Произошла ошибка! Попробуйте еще раз 🔄').catch(console.error);
    }
});

// ========== ОСНОВНЫЕ ФУНКЦИИ ==========

function registerUser(chatId, telegramId, username, role) {
    try {
        const initialCoins = role === 'стажер' ? 0 : 50;
        
        db.run(`INSERT OR REPLACE INTO users (telegram_id, username, role, p_coins, energy, is_registered) 
                VALUES (?, ?, ?, ?, 100, 0)`, 
               [telegramId, username, role, initialCoins], () => {
            
            const message = role === 'стажер' ? 
                '🎉 Добро пожаловать в команду, стажер! 👋\n\n' +
                '📝 Расскажи немного о себе:\n' +
                '• Как зовут? 🤔\n' +
                '• Как попал к нам? 🚀\n' +
                '• Что ожидаешь от работы? 💫\n\n' +
                '✏️ Напиши все в одном сообщении:' :
                '🎉 Добро пожаловать в команду! 👋\n\n' +
                '📋 Укажи свои данные:\n' +
                '• ФИО 👤\n' +
                '• Должность 💼\n' +
                '• Телефон 📱\n\n' +
                '✏️ Напиши все в одном сообщении:';
                
            bot.sendMessage(chatId, message).catch(console.error);
        });
    } catch (error) {
        console.error('❌ Register user error:', error);
    }
}

function handleTextInput(chatId, telegramId, text, username) {
    try {
        // Обработка создания мероприятий админом
        if (global.adminStates[telegramId]) {
            handleAdminEventCreation(chatId, telegramId, text);
            return;
        }
        
        // Обработка ожидания баллов за тест
        if (global.waitingForPoints[telegramId]) {
            const testData = global.waitingForPoints[telegramId];
            const points = parseInt(text);
            
            if (isNaN(points) || points < 0 || points > 100) {
                bot.sendMessage(chatId, '🤔 Ммм, что-то не так! Напиши число от 0 до 100 📊').catch(console.error);
                return;
            }
            
            createTestSubmission(chatId, telegramId, testData.testName, points, testData.photoFileId, username);
            delete global.waitingForPoints[telegramId];
            return;
        }
        
        // Обработка записи на мероприятие по номеру слота
        if (global.userScreenshots[telegramId] && global.userScreenshots[telegramId].type === 'event_booking') {
            const slotNumber = parseInt(text);
            const eventData = global.userScreenshots[telegramId];
            
            if (isNaN(slotNumber) || slotNumber < 1 || slotNumber > eventData.slots.length) {
                bot.sendMessage(chatId, '🤷‍♂️ Такого номера слота нет! Попробуй еще раз 🔢').catch(console.error);
                return;
            }
            
            bookEventSlot(chatId, telegramId, eventData.slots[slotNumber - 1]);
            delete global.userScreenshots[telegramId];
            return;
        }
        
        // Регистрация пользователя
        db.get("SELECT * FROM users WHERE telegram_id = ? AND is_registered = 0", [telegramId], (err, user) => {
            if (user) {
                db.run("UPDATE users SET full_name = ?, contacts = ?, is_registered = 1 WHERE telegram_id = ?", 
                       [text, text, telegramId], () => {
                    
                    const message = user.role === 'стажер' ? 
                        '🎊 Регистрация завершена! 🎉\n\n' +
                        '📚 Теперь проходи тесты и зарабатывай баллы! 💪\n' +
                        '🔥 Удачи, стажер!' :
                        '🎊 Регистрация завершена! 🎉\n\n' +
                        '💰 Получено 50 стартовых П-коинов!\n' +
                        '🚀 Добро пожаловать в игру!';
                    
                    const keyboard = user.role === 'стажер' ? internMenuKeyboard : mainMenuKeyboard;
                    bot.sendMessage(chatId, message, keyboard).catch(console.error);
                });
            }
        });
    } catch (error) {
        console.error('❌ Handle text input error:', error);
    }
}

function showMainMenu(chatId, user) {
    try {
        if (user.role === 'стажер') {
            db.get(`SELECT COUNT(*) as completed FROM intern_progress ip 
                    JOIN users u ON u.id = ip.user_id 
                    WHERE u.telegram_id = ? AND ip.completed = 1`, [user.telegram_id], (err, progress) => {
                
                if (progress && progress.completed >= 3) {
                    bot.sendMessage(chatId, 
                        '🎉 Поздравляю! Стажировка завершена! 🏆\n\n' +
                        `💰 Баланс: ${user.p_coins} П-коинов\n` +
                        '🚀 Теперь тебе доступны ВСЕ функции!\n' +
                        '🔥 Время покорять новые вершины!', mainMenuKeyboard).catch(console.error);
                } else {
                    bot.sendMessage(chatId, 
                        '👋 Привет, стажер! 📚\n\n' +
                        `💰 Баланс: ${user.p_coins} П-коинов\n` +
                        '🎯 Продолжай проходить тесты!\n' +
                        '💪 Каждый тест приближает к цели!', internMenuKeyboard).catch(console.error);
                }
            });
        } else {
            bot.sendMessage(chatId, 
                `🎊 Привет, ${user.full_name || user.username}! 🌟\n\n` +
                `💰 Баланс: ${user.p_coins} П-коинов\n` +
                `⚡ Энергия: ${user.energy}%\n\n` +
                '🚀 Что будем делать сегодня?', mainMenuKeyboard).catch(console.error);
        }
    } catch (error) {
        console.error('❌ Show main menu error:', error);
    }
}

// ========== ФУНКЦИИ ТЕСТИРОВАНИЯ ==========

function showTestMenu(chatId) {
    try {
        bot.sendMessage(chatId, 
            '📚 ЦЕНТР ОБУЧЕНИЯ 🎓\n\n' +
            '🌟 Знакомство с компанией - 10 баллов\n' +
            '📈 Основы работы - 15 баллов\n' +
            '🎯 Продуктовая линейка - 15 баллов\n\n' +
            '💡 Каждый тест - это новые знания и баллы!\n' +
            '🎯 Выбери тест для прохождения:', testKeyboard).catch(console.error);
    } catch (error) {
        console.error('❌ Show test menu error:', error);
    }
}

function selectTest(chatId, telegramId, testName, reward) {
    try {
        db.get(`SELECT ip.* FROM intern_progress ip 
                JOIN users u ON u.id = ip.user_id 
                WHERE u.telegram_id = ? AND ip.test_name = ? AND ip.completed = 1`, 
               [telegramId, testName], (err, completed) => {
            
            if (completed) {
                bot.sendMessage(chatId, 
                    `✅ Тест "${testName}" уже пройден! 🎉\n\n` +
                    `💰 Получено: ${completed.points_earned} коинов\n` +
                    '🔥 Попробуй другие тесты!').catch(console.error);
                return;
            }
            
            db.get("SELECT * FROM test_submissions WHERE telegram_id = ? AND test_name = ? AND status = 'pending'", 
                   [telegramId, testName], (err, pending) => {
                
                if (pending) {
                    bot.sendMessage(chatId, 
                        `⏳ Заявка на тест "${testName}" уже на проверке! 📋\n\n` +
                        '🕐 Скоро придет результат, жди!')
                        .catch(console.error);
                    return;
                }
                
                global.userScreenshots[telegramId] = { testName, reward };
                
                bot.sendMessage(chatId, 
                    `🎯 Выбран тест: "${testName}" 📖\n\n` +
                    `🏆 Награда: до ${reward} П-коинов\n` +
                    `⏰ Время: ~15 минут\n` +
                    `🔗 Формат: Онлайн тестирование\n\n` +
                    `🌐 Ссылка на тест:\nhttps://partnerkino.ru/tests/\n\n` +
                    '📸 После прохождения отправь скриншот результата!\n' +
                    '🎯 Удачи в тестировании! 💪').catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Select test error:', error);
    }
}

function handleScreenshot(chatId, telegramId, photoFileId, username) {
    try {
        if (!global.userScreenshots[telegramId]) {
            bot.sendMessage(chatId, 
                '🤔 Хм, сначала выбери тест из меню! 📚\n' +
                '👆 Используй кнопки выше').catch(console.error);
            return;
        }
        
        const testData = global.userScreenshots[telegramId];
        
        global.waitingForPoints[telegramId] = {
            testName: testData.testName,
            reward: testData.reward,
            photoFileId: photoFileId
        };
        
        delete global.userScreenshots[telegramId];
        
        bot.sendMessage(chatId, 
            `📸 Скриншот получен! ✅\n\n` +
            `📝 Тест: ${testData.testName}\n` +
            `🏆 Максимум: ${testData.reward} баллов\n\n` +
            '🎯 Сколько баллов ты набрал?\n' +
            '🔢 Напиши число (например: 85)').catch(console.error);
    } catch (error) {
        console.error('❌ Handle screenshot error:', error);
    }
}

function createTestSubmission(chatId, telegramId, testName, points, photoFileId, username) {
    try {
        db.get("SELECT id FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) return;
            
            db.run(`INSERT INTO test_submissions 
                    (user_id, telegram_id, username, test_name, points_claimed, photo_file_id, status) 
                    VALUES (?, ?, ?, ?, ?, ?, 'pending')`, 
                   [user.id, telegramId, username, testName, points, photoFileId], () => {
                
                bot.sendMessage(chatId, 
                    `🚀 Заявка отправлена! 📋\n\n` +
                    `📝 Тест: ${testName}\n` +
                    `🎯 Баллы: ${points}\n` +
                    `📸 Скриншот прикреплен\n\n` +
                    '⏳ Жди решения администратора!\n' +
                    '📱 Уведомление придет автоматически! 🔔').catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Create test submission error:', error);
    }
}

// ========== ФУНКЦИИ БАЛАНСА И ПРОГРЕССА ==========

function showBalance(chatId, telegramId) {
    try {
        db.get("SELECT * FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (user) {
                bot.sendMessage(chatId, 
                    `💰 ТВОЙ БАЛАНС 📊\n\n` +
                    `💎 П-коинов: ${user.p_coins}\n` +
                    `⚡ Энергия: ${user.energy}%\n` +
                    `👤 Статус: ${user.role}\n\n` +
                    '🔥 Продолжай зарабатывать баллы!').catch(console.error);
            }
        });
    } catch (error) {
        console.error('❌ Show balance error:', error);
    }
}

function showInternProgress(chatId, telegramId) {
    try {
        db.get("SELECT id FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) return;
            
            db.all(`SELECT * FROM intern_progress WHERE user_id = ? ORDER BY completed_date DESC`, 
                   [user.id], (err, tests) => {
                
                const allTests = [
                    { name: 'Знакомство с компанией', reward: 10, emoji: '🌟' },
                    { name: 'Основы работы', reward: 15, emoji: '📈' },
                    { name: 'Продуктовая линейка', reward: 15, emoji: '🎯' }
                ];
                
                let progressText = '📊 ПРОГРЕСС ОБУЧЕНИЯ 🎓\n\n';
                let completed = 0;
                let totalEarned = 0;
                
                allTests.forEach(testInfo => {
                    const test = tests.find(t => t.test_name === testInfo.name && t.completed === 1);
                    if (test) {
                        progressText += `✅ ${testInfo.emoji} ${testInfo.name} - ${test.points_earned} баллов\n`;
                        completed++;
                        totalEarned += test.points_earned;
                    } else {
                        progressText += `⏳ ${testInfo.emoji} ${testInfo.name} - ${testInfo.reward} баллов\n`;
                    }
                });
                
                progressText += `\n📈 Завершено: ${completed}/3\n`;
                progressText += `💰 Заработано: ${totalEarned} П-коинов\n`;
                
                if (completed >= 3) {
                    progressText += '\n🎉 ОБУЧЕНИЕ ЗАВЕРШЕНО! 🏆\n🚀 Ты молодец!';
                } else {
                    progressText += '\n💪 Продолжай! Ты на верном пути!';
                }
                
                bot.sendMessage(chatId, progressText).catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Show intern progress error:', error);
    }
}

function backToMainMenu(chatId, telegramId) {
    try {
        db.get("SELECT * FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (user) showMainMenu(chatId, user);
        });
    } catch (error) {
        console.error('❌ Back to main menu error:', error);
    }
}

// ========== ФУНКЦИИ КУРСОВ ==========

function showCoursesMenu(chatId) {
    try {
        bot.sendMessage(chatId, 
            '🎓 ПРОФЕССИОНАЛЬНЫЕ КУРСЫ 📚\n\n' +
            '📊 Основы аналитики - 30 П-коинов 💎\n' +
            '💼 Менеджмент проектов - 40 П-коинов 💎\n' +
            '🎯 Маркетинг и реклама - 35 П-коинов 💎\n' +
            '🔍 SEO оптимизация - 25 П-коинов 💎\n\n' +
            '🚀 Прокачивай навыки и получай награды!\n' +
            '💡 Выбери курс для изучения:', coursesKeyboard).catch(console.error);
    } catch (error) {
        console.error('❌ Show courses menu error:', error);
    }
}

function selectCourse(chatId, telegramId, courseName, reward) {
    try {
        bot.sendMessage(chatId, 
            `🎓 Курс: "${courseName}" 📖\n\n` +
            `🏆 Награда за прохождение: ${reward} П-коинов\n` +
            `⏰ Длительность: ~2-3 часа\n` +
            `🖥️ Формат: Онлайн обучение\n` +
            `🎯 Сложность: Средний уровень\n\n` +
            `🌐 Ссылка на курс:\nhttps://partnerkino.ru/courses/\n\n` +
            '📸 После завершения курса отправь скриншот сертификата!\n' +
            '🎯 Укажи итоговые баллы за курс.\n' +
            '💪 Удачи в обучении!').catch(console.error);
            
        // Сохраняем состояние для обработки скриншота курса
        global.userScreenshots[telegramId] = { 
            testName: courseName, 
            reward: reward, 
            type: 'course' 
        };
    } catch (error) {
        console.error('❌ Select course error:', error);
    }
}

// ========== ФУНКЦИИ PVP ==========

function showPVPMenu(chatId, telegramId) {
    try {
        db.get("SELECT * FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) return;
            
            bot.sendMessage(chatId, 
                `⚔️ PVP АРЕНА 🏟️\n\n` +
                `⚡ Твоя энергия: ${user.energy}%\n` +
                `💰 П-коинов: ${user.p_coins}\n\n` +
                '🎮 За сражение тратится 20% энергии\n' +
                '🎯 Можно выиграть или проиграть 10 П-коинов\n' +
                '🏆 Побеждает сильнейший!\n\n' +
                '🔥 Готов к бою?', pvpKeyboard).catch(console.error);
        });
    } catch (error) {
        console.error('❌ Show PVP menu error:', error);
    }
}

function findOpponent(chatId, telegramId) {
    try {
        db.get("SELECT * FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) return;
            
            if (user.energy < 20) {
                bot.sendMessage(chatId, 
                    `😴 Недостаточно энергии! ⚡\n\n` +
                    `🔋 У тебя: ${user.energy}%\n` +
                    '⚡ Нужно: 20%\n\n' +
                    '💤 Восстанови силы и возвращайся! 🔄').catch(console.error);
                return;
            }
            
            if (user.p_coins < 10) {
                bot.sendMessage(chatId, 
                    '💸 Недостаточно П-коинов! 😢\n\n' +
                    '💰 Нужно минимум 10 коинов для сражения\n' +
                    '📚 Пройди тесты или курсы!').catch(console.error);
                return;
            }
            
            db.get(`SELECT * FROM users 
                    WHERE telegram_id != ? 
                    AND p_coins >= 10 
                    AND is_registered = 1 
                    ORDER BY RANDOM() LIMIT 1`, [telegramId], (err, opponent) => {
                
                if (!opponent) {
                    bot.sendMessage(chatId, 
                        '👻 Нет доступных противников 😔\n\n' +
                        '⏰ Попробуй чуть позже!').catch(console.error);
                    return;
                }
                
                const playerWins = Math.random() > 0.5;
                const pointsWon = 10;
                
                // Обновляем энергию игрока
                db.run("UPDATE users SET energy = energy - 20 WHERE telegram_id = ?", [telegramId]);
                
                if (playerWins) {
                    // Игрок победил
                    db.run("UPDATE users SET p_coins = p_coins + ? WHERE telegram_id = ?", [pointsWon, telegramId]);
                    db.run("UPDATE users SET p_coins = p_coins - ? WHERE telegram_id = ?", [pointsWon, opponent.telegram_id]);
                    
                    // Записываем битву в историю
                    db.run("INSERT INTO battles (attacker_id, defender_id, winner_id, points_won) VALUES (?, ?, ?, ?)",
                           [user.id, opponent.id, user.id, pointsWon]);
                    
                    bot.sendMessage(chatId, 
                        `🏆 ПОБЕДА! 🎉\n\n` +
                        `⚔️ Противник: @${opponent.username}\n` +
                        `💰 Получено: +${pointsWon} П-коинов\n` +
                        `⚡ Энергия: ${user.energy - 20}%\n\n` +
                        '🔥 Отлично сражался! 💪').catch(console.error);
                    
                    // Уведомляем побежденного
                    bot.sendMessage(opponent.telegram_id, 
                        `⚔️ НА ТЕБЯ НАПАЛИ! 😱\n\n` +
                        `🥊 Противник: @${user.username}\n` +
                        `💸 Проиграл ${pointsWon} П-коинов\n\n` +
                        '😤 В следующий раз отыграешься!').catch(console.error);
                } else {
                    // Игрок проиграл
                    db.run("UPDATE users SET p_coins = p_coins - ? WHERE telegram_id = ?", [pointsWon, telegramId]);
                    db.run("UPDATE users SET p_coins = p_coins + ? WHERE telegram_id = ?", [pointsWon, opponent.telegram_id]);
                    
                    // Записываем битву в историю
                    db.run("INSERT INTO battles (attacker_id, defender_id, winner_id, points_won) VALUES (?, ?, ?, ?)",
                           [user.id, opponent.id, opponent.id, pointsWon]);
                    
                    bot.sendMessage(chatId, 
                        `💀 ПОРАЖЕНИЕ 😔\n\n` +
                        `⚔️ Противник: @${opponent.username}\n` +
                        `💸 Потеряно: -${pointsWon} П-коинов\n` +
                        `⚡ Энергия: ${user.energy - 20}%\n\n` +
                        '💪 В следующий раз повезет больше!').catch(console.error);
                    
                    // Уведомляем победителя
                    bot.sendMessage(opponent.telegram_id, 
                        `⚔️ НА ТЕБЯ НАПАЛИ! 🥊\n\n` +
                        `🏆 Противник: @${user.username}\n` +
                        `💰 Победил! +${pointsWon} П-коинов!\n\n` +
                        '🎉 Отличная защита!').catch(console.error);
                }
            });
        });
    } catch (error) {
        console.error('❌ Find opponent error:', error);
    }
}

function showRating(chatId, telegramId) {
    try {
        db.all(`SELECT username, full_name, p_coins, role 
                FROM users 
                WHERE is_registered = 1 
                ORDER BY p_coins DESC 
                LIMIT 10`, (err, users) => {
            
            if (!users || users.length === 0) {
                bot.sendMessage(chatId, 
                    '📊 Нет данных для рейтинга 🤷‍♂️\n' +
                    '⏰ Попробуй позже!').catch(console.error);
                return;
            }
            
            let ratingText = '🏆 ТОП-10 ПО П-КОИНАМ 💰\n\n';
            
            users.forEach((user, index) => {
                const name = user.full_name || user.username || 'Неизвестный';
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}. 🏅`;
                ratingText += `${medal} ${name} - ${user.p_coins} коинов\n`;
            });
            
            ratingText += '\n🔥 Кто следующий в топе?';
            
            bot.sendMessage(chatId, ratingText).catch(console.error);
        });
    } catch (error) {
        console.error('❌ Show rating error:', error);
    }
}

function restoreEnergy(chatId, telegramId) {
    try {
        db.run("UPDATE users SET energy = 100 WHERE telegram_id = ?", [telegramId], () => {
            bot.sendMessage(chatId, 
                '⚡ ЭНЕРГИЯ ВОССТАНОВЛЕНА! 🔋\n\n' +
                '💪 Энергия: 100%\n' +
                '🎯 Готов к 5 сражениям подряд!\n\n' +
                '🔥 Время показать всем кто тут босс! 👑').catch(console.error);
        });
    } catch (error) {
        console.error('❌ Restore energy error:', error);
    }
}

// ========== ФУНКЦИИ МАГАЗИНА ==========

function showShop(chatId, telegramId) {
    try {
        db.get("SELECT p_coins FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) return;
            
            bot.sendMessage(chatId, 
                `🛒 МАГАЗИН НАГРАД 🎁\n\n` +
                `💰 Твой баланс: ${user.p_coins} П-коинов\n\n` +
                '🏖️ Выходной день - 100 коинов 🌴\n' +
                '👕 Мерч компании - 50 коинов 🎽\n' +
                '🎁 Секретный сюрприз - 200 коинов 🎊\n' +
                '☕ Кофе в офис - 25 коинов ☕\n\n' +
                '🛍️ Что выберешь?', shopKeyboard).catch(console.error);
        });
    } catch (error) {
        console.error('❌ Show shop error:', error);
    }
}

function buyItem(chatId, telegramId, itemName, price) {
    try {
        db.get("SELECT * FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) return;
            
            if (user.p_coins < price) {
                bot.sendMessage(chatId, 
                    `💸 Недостаточно П-коинов! 😢\n\n` +
                    `💰 У тебя: ${user.p_coins} коинов\n` +
                    `🎯 Нужно: ${price} коинов\n` +
                    `📊 Не хватает: ${price - user.p_coins} коинов\n\n` +
                    '💪 Пройди тесты или курсы!').catch(console.error);
                return;
            }
            
            db.run("UPDATE users SET p_coins = p_coins - ? WHERE telegram_id = ?", [price, telegramId], () => {
                db.run("INSERT INTO purchases (user_id, item_name, price) VALUES (?, ?, ?)",
                       [user.id, itemName, price]);
                
                bot.sendMessage(chatId, 
                    `🎉 ПОКУПКА УСПЕШНА! 🛍️\n\n` +
                    `🎁 Товар: ${itemName}\n` +
                    `💸 Потрачено: ${price} П-коинов\n` +
                    `💰 Остаток: ${user.p_coins - price} коинов\n\n` +
                    '👤 Обратись к HR для получения товара!\n' +
                    '🎊 Наслаждайся покупкой!').catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Buy item error:', error);
    }
}

// ========== ФУНКЦИИ МЕРОПРИЯТИЙ ==========

function showEventsMenu(chatId) {
    try {
        bot.sendMessage(chatId, 
            '🎯 КОРПОРАТИВНЫЕ МЕРОПРИЯТИЯ 🎉\n\n' +
            '🏃‍♂️ Зарядка - 5 П-коинов ⚡\n' +
            '🎰 Турнир по покеру - 10 П-коинов 🃏\n' +
            '🎉 Корпоративная вечеринка - 15 П-коинов 🥳\n' +
            '📚 Обучающие тренинги - 20 П-коинов 🎓\n\n' +
            '📅 Выбери мероприятие для записи!\n' +
            '⏰ Доступны тайм-слоты на выбор!', eventsKeyboard).catch(console.error);
    } catch (error) {
        console.error('❌ Show events menu error:', error);
    }
}

function showEventSlots(chatId, telegramId, eventName) {
    try {
        db.all("SELECT * FROM event_slots WHERE event_name = ? AND status = 'active' AND current_participants < max_participants ORDER BY date, time", 
               [eventName], (err, slots) => {
            
            if (!slots || slots.length === 0) {
                bot.sendMessage(chatId, 
                    `📅 ${eventName} 🎯\n\n` +
                    '⏰ Расписание скоро будет, ожидайте! 🔄\n' +
                    '👨‍💼 Мы уже его обновляем!\n\n' +
                    '🔔 Включи уведомления, чтобы не пропустить!\n' +
                    '💫 Скоро будет много интересного!').catch(console.error);
                return;
            }
            
            let slotsText = `📅 ${eventName} - доступные слоты! 🎯\n\n`;
            
            slots.forEach((slot, index) => {
                const availableSpots = slot.max_participants - slot.current_participants;
                slotsText += `${index + 1}. 📍 ${slot.date} в ${slot.time}\n`;
                slotsText += `   🏢 Место: ${slot.location}\n`;
                slotsText += `   👥 Свободно мест: ${availableSpots}\n`;
                slotsText += `   💰 Награда: ${slot.points_reward} П-коинов\n\n`;
            });
            
            slotsText += '🎯 Для записи напиши номер слота!\n' +
                        '✏️ Например: 1';
            
            bot.sendMessage(chatId, slotsText).catch(console.error);
            
            // Сохраняем информацию для записи на мероприятие
            global.userScreenshots[telegramId] = { 
                type: 'event_booking', 
                eventName: eventName, 
                slots: slots 
            };
        });
    } catch (error) {
        console.error('❌ Show event slots error:', error);
    }
}

function bookEventSlot(chatId, telegramId, slot) {
    try {
        db.get("SELECT * FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) return;
            
            // Проверяем, не записан ли уже пользователь
            db.get("SELECT * FROM event_bookings WHERE user_id = ? AND slot_id = ?", 
                   [user.id, slot.id], (err, existing) => {
                
                if (existing) {
                    bot.sendMessage(chatId, 
                        '😅 Ты уже записан на это мероприятие! 📅\n' +
                        '🎯 Выбери другой слот!').catch(console.error);
                    return;
                }
                
                // Проверяем есть ли еще места
                if (slot.current_participants >= slot.max_participants) {
                    bot.sendMessage(chatId, 
                        '😔 Места закончились! 📵\n' +
                        '⏰ Выбери другое время!').catch(console.error);
                    return;
                }
                
                // Записываем пользователя
                db.run("INSERT INTO event_bookings (user_id, slot_id) VALUES (?, ?)", 
                       [user.id, slot.id], () => {
                    
                    // Увеличиваем счетчик участников
                    db.run("UPDATE event_slots SET current_participants = current_participants + 1 WHERE id = ?", 
                           [slot.id]);
                    
                    bot.sendMessage(chatId, 
                        `🎉 УСПЕШНАЯ ЗАПИСЬ! ✅\n\n` +
                        `🎯 Мероприятие: ${slot.event_name}\n` +
                        `📅 Дата: ${slot.date}\n` +
                        `⏰ Время: ${slot.time}\n` +
                        `🏢 Место: ${slot.location}\n` +
                        `💰 Награда: ${slot.points_reward} П-коинов\n\n` +
                        '🔔 Не забудь прийти вовремя!\n' +
                        '💫 Увидимся на мероприятии!').catch(console.error);
                });
            });
        });
    } catch (error) {
        console.error('❌ Book event slot error:', error);
    }
}

function showAllEventSlots(chatId) {
    try {
        db.all("SELECT * FROM event_slots WHERE status = 'active' ORDER BY date, time", (err, slots) => {
            if (!slots || slots.length === 0) {
                bot.sendMessage(chatId, 
                    '📅 РАСПИСАНИЕ ВСЕХ МЕРОПРИЯТИЙ 🗓️\n\n' +
                    '⏰ Пока что занятий нет, но уже в процессе их размещения! 🔄\n\n' +
                    '👨‍💼 Администраторы работают над расписанием!\n' +
                    '🔔 Следи за обновлениями!\n' +
                    '💫 Скоро будет много интересного!').catch(console.error);
                return;
            }
            
            let scheduleText = '📅 РАСПИСАНИЕ ВСЕХ МЕРОПРИЯТИЙ 🗓️\n\n';
            
            slots.forEach((slot, index) => {
                const availableSpots = slot.max_participants - slot.current_participants;
                scheduleText += `${index + 1}. 🎯 ${slot.event_name}\n`;
                scheduleText += `📅 ${slot.date} в ${slot.time}\n`;
                scheduleText += `🏢 ${slot.location}\n`;
                scheduleText += `👥 Свободно: ${availableSpots}/${slot.max_participants}\n`;
                scheduleText += `💰 ${slot.points_reward} П-коинов\n\n`;
            });
            
            scheduleText += '🎯 Для записи выбери конкретное мероприятие!';
            
            bot.sendMessage(chatId, scheduleText).catch(console.error);
        });
    } catch (error) {
        console.error('❌ Show all event slots error:', error);
    }
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

function showTasksInfo(chatId) {
    try {
        bot.sendMessage(chatId, 
            '📋 СИСТЕМА ЗАДАЧ 🎯\n\n' +
            '🚧 Функция в разработке! 🔧\n\n' +
            '📝 Скоро ты сможешь:\n' +
            '• Ставить задачи коллегам 👥\n' +
            '• Получать задания от руководства 📊\n' +
            '• Зарабатывать баллы за выполнение 💰\n' +
            '• Отслеживать прогресс 📈\n\n' +
            '⏰ Следи за обновлениями!').catch(console.error);
    } catch (error) {
        console.error('❌ Show tasks info error:', error);
    }
}

function showGiftPointsInfo(chatId) {
    try {
        bot.sendMessage(chatId, 
            '🎁 ПОДАРИТЬ БАЛЛЫ 💝\n\n' +
            '🚧 Функция в разработке! 🔧\n\n' +
            '💫 Скоро ты сможешь дарить П-коины коллегам за помощь или хорошую работу!\n\n' +
            '📋 Планируемые возможности:\n' +
            '• Перевод до 50 коинов в день 💰\n' +
            '• Минимум 5 коинов за раз 📊\n' +
            '• История переводов 📈\n' +
            '• Благодарности с сообщениями 💌\n\n' +
            '⏰ Следи за обновлениями!').catch(console.error);
    } catch (error) {
        console.error('❌ Show gift points info error:', error);
    }
}

function showUserStats(chatId, telegramId) {
    try {
        db.get(`SELECT u.*, 
                (SELECT COUNT(*) FROM battles WHERE winner_id = u.id) as wins,
                (SELECT COUNT(*) FROM battles WHERE (attacker_id = u.id OR defender_id = u.id) AND winner_id != u.id) as losses,
                (SELECT COUNT(*) FROM purchases WHERE user_id = u.id) as purchases_count,
                (SELECT COUNT(*) FROM event_bookings WHERE user_id = u.id) as events_count
                FROM users u WHERE u.telegram_id = ?`, [telegramId], (err, stats) => {
            
            if (!stats) return;
            
            const winRate = stats.wins + stats.losses > 0 ? 
                Math.round((stats.wins / (stats.wins + stats.losses)) * 100) : 0;
            
            const statsText = 
                '📊 ТВОЯ СТАТИСТИКА 🎯\n\n' +
                `👤 Имя: ${stats.full_name || stats.username}\n` +
                `💰 П-коинов: ${stats.p_coins}\n` +
                `⚡ Энергия: ${stats.energy}%\n` +
                `🎭 Роль: ${stats.role}\n\n` +
                '⚔️ PVP Статистика:\n' +
                `🏆 Побед: ${stats.wins || 0}\n` +
                `💀 Поражений: ${stats.losses || 0}\n` +
                `📊 Винрейт: ${winRate}%\n\n` +
                '🎯 Активность:\n' +
                `🛍️ Покупок: ${stats.purchases_count || 0}\n` +
                `🎉 Мероприятий: ${stats.events_count || 0}\n\n` +
                `📅 Зарегистрирован: ${new Date(stats.registration_date).toLocaleDateString('ru-RU')}\n\n` +
                '🔥 Продолжай в том же духе!';
            
            bot.sendMessage(chatId, statsText).catch(console.error);
        });
    } catch (error) {
        console.error('❌ Show user stats error:', error);
    }
}

// ========== АДМИНСКИЕ ФУНКЦИИ ==========

function handleAdminLogin(chatId, telegramId) {
    try {
        db.get("SELECT * FROM users WHERE telegram_id = ? AND role = 'старичок'", [telegramId], (err, user) => {
            if (!user) {
                bot.sendMessage(chatId, 
                    '❌ Доступ запрещен! 🚫\n\n' +
                    '👤 Только старички могут войти в админку!').catch(console.error);
                return;
            }
            
            db.run("INSERT OR REPLACE INTO admins (user_id, telegram_id) VALUES (?, ?)", 
                   [user.id, telegramId], () => {
                bot.sendMessage(chatId, 
                    '🔑 ДОБРО ПОЖАЛОВАТЬ В АДМИНКУ! 👨‍💼\n\n' +
                    '🎯 Теперь у тебя есть суперсилы!\n' +
                    '📊 Управляй ботом как хочешь!\n\n' +
                    '🚀 Что будем делать?', adminKeyboard).catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Admin login error:', error);
    }
}

function exitAdminMode(chatId, telegramId) {
    try {
        db.run("DELETE FROM admins WHERE telegram_id = ?", [telegramId], () => {
            bot.sendMessage(chatId, 
                '👋 Выход из админки! 🚪\n\n' +
                '🎯 Возвращаемся в обычный режим!').catch(console.error);
            backToMainMenu(chatId, telegramId);
        });
    } catch (error) {
        console.error('❌ Exit admin mode error:', error);
    }
}

// ========== СОЗДАНИЕ МЕРОПРИЯТИЙ АДМИНОМ ==========

function startEventCreation(chatId, telegramId) {
    try {
        db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
            if (!admin) {
                bot.sendMessage(chatId, '❌ Нет прав администратора!').catch(console.error);
                return;
            }
            
            global.adminStates[telegramId] = {
                step: 'category',
                eventData: {}
            };
            
            bot.sendMessage(chatId, 
                '🗓️ СОЗДАНИЕ НОВОГО МЕРОПРИЯТИЯ! ✨\n\n' +
                '🎯 Шаг 1: Выбери категорию мероприятия\n\n' +
                '👇 Нажми на кнопку с нужной категорией:', 
                eventCategoryKeyboard).catch(console.error);
        });
    } catch (error) {
        console.error('❌ Start event creation error:', error);
    }
}

function handleAdminEventCreation(chatId, telegramId, text) {
    try {
        if (!global.adminStates[telegramId]) return;
        
        const state = global.adminStates[telegramId];
        
        if (text === '❌ Отмена') {
            delete global.adminStates[telegramId];
            bot.sendMessage(chatId, '❌ Создание мероприятия отменено!', adminKeyboard).catch(console.error);
            return;
        }
        
        switch (state.step) {
            case 'category':
                if (['🏃‍♂️ Зарядка', '🎰 Покер', '🎉 Корпоратив', '📚 Тренинги', '⚽ Спорт', '🍕 Обеды'].includes(text)) {
                    state.eventData.category = text.replace(/^[\w\s]+\s/, '').trim();
                    state.eventData.name = text.replace(/[\w\s]+\s/, '').trim();
                    state.step = 'custom_name';
                    
                    bot.sendMessage(chatId, 
                        `✅ Выбрана категория: ${text}\n\n` +
                        '📝 Шаг 2: Напиши НАЗВАНИЕ мероприятия\n' +
                        `💡 Например: "Утренняя зарядка с тренером"\n\n` +
                        '✏️ Или просто напиши "далее" чтобы использовать стандартное название').catch(console.error);
                }
                break;
                
            case 'custom_name':
                if (text.toLowerCase() !== 'далее') {
                    state.eventData.name = text;
                }
                state.step = 'date';
                
                bot.sendMessage(chatId, 
                    `✅ Название: ${state.eventData.name}\n\n` +
                    '📅 Шаг 3: Укажи ДАТУ мероприятия\n\n' +
                    '📝 Формат: ДД.ММ.ГГГГ\n' +
                    '💡 Например: 25.12.2024').catch(console.error);
                break;
                
            case 'date':
                if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
                    state.eventData.date = text;
                    state.step = 'time';
                    
                    bot.sendMessage(chatId, 
                        `✅ Дата: ${text}\n\n` +
                        '⏰ Шаг 4: Укажи ВРЕМЯ начала\n\n' +
                        '📝 Формат: ЧЧ:ММ\n' +
                        '💡 Например: 09:30 или 18:00').catch(console.error);
                } else {
                    bot.sendMessage(chatId, 
                        '❌ Неверный формат даты!\n' +
                        '📝 Используй: ДД.ММ.ГГГГ\n' +
                        '💡 Например: 25.12.2024').catch(console.error);
                }
                break;
                
            case 'time':
                if (/^\d{2}:\d{2}$/.test(text)) {
                    state.eventData.time = text;
                    state.step = 'location';
                    
                    bot.sendMessage(chatId, 
                        `✅ Время: ${text}\n\n` +
                        '📍 Шаг 5: Укажи МЕСТО проведения\n\n' +
                        '💡 Например: "Конференц-зал 1", "Офис, 2 этаж"').catch(console.error);
                } else {
                    bot.sendMessage(chatId, 
                        '❌ Неверный формат времени!\n' +
                        '📝 Используй: ЧЧ:ММ\n' +
                        '💡 Например: 09:30 или 18:00').catch(console.error);
                }
                break;
                
            case 'location':
                state.eventData.location = text;
                state.step = 'participants';
                
                bot.sendMessage(chatId, 
                    `✅ Место: ${text}\n\n` +
                    '👥 Шаг 6: Максимальное количество участников\n\n' +
                    '🔢 Напиши число от 1 до 100\n' +
                    '💡 Например: 10').catch(console.error);
                break;
                
            case 'participants':
                const maxParticipants = parseInt(text);
                if (isNaN(maxParticipants) || maxParticipants < 1 || maxParticipants > 100) {
                    bot.sendMessage(chatId, 
                        '❌ Неверное количество!\n' +
                        '🔢 Введи число от 1 до 100').catch(console.error);
                    return;
                }
                
                state.eventData.maxParticipants = maxParticipants;
                state.step = 'reward';
                
                bot.sendMessage(chatId, 
                    `✅ Участников: ${maxParticipants}\n\n` +
                    '🏆 Шаг 7: Награда в П-коинах\n\n' +
                    '💰 Напиши количество коинов за участие\n' +
                    '💡 Например: 5, 10, 15').catch(console.error);
                break;
                
            case 'reward':
                const reward = parseInt(text);
                if (isNaN(reward) || reward < 1 || reward > 100) {
                    bot.sendMessage(chatId, 
                        '❌ Неверная награда!\n' +
                        '💰 Введи число от 1 до 100').catch(console.error);
                    return;
                }
                
                state.eventData.reward = reward;
                createEventSlot(chatId, telegramId, state.eventData);
                break;
        }
    } catch (error) {
        console.error('❌ Handle admin event creation error:', error);
    }
}

function createEventSlot(chatId, telegramId, eventData) {
    try {
        db.run(`INSERT INTO event_slots 
                (event_name, category, date, time, location, max_participants, points_reward, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
               [eventData.name, eventData.category, eventData.date, eventData.time, 
                eventData.location, eventData.maxParticipants, eventData.reward], () => {
            
            delete global.adminStates[telegramId];
            
            bot.sendMessage(chatId, 
                '🎉 МЕРОПРИЯТИЕ СОЗДАНО! ✅\n\n' +
                `🎯 Название: ${eventData.name}\n` +
                `📅 Дата: ${eventData.date}\n` +
                `⏰ Время: ${eventData.time}\n` +
                `📍 Место: ${eventData.location}\n` +
                `👥 Участников: ${eventData.maxParticipants}\n` +
                `💰 Награда: ${eventData.reward} П-коинов\n\n` +
                '🚀 Пользователи уже могут записываться!', adminKeyboard).catch(console.error);
        });
    } catch (error) {
        console.error('❌ Create event slot error:', error);
    }
}

function showSlotManagement(chatId, telegramId) {
    try {
        db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
            if (!admin) {
                bot.sendMessage(chatId, '❌ Нет прав администратора!').catch(console.error);
                return;
            }
            
            db.all("SELECT * FROM event_slots ORDER BY date, time", (err, slots) => {
                if (!slots || slots.length === 0) {
                    bot.sendMessage(chatId, 
                        '📅 УПРАВЛЕНИЕ СЛОТАМИ 🗓️\n\n' +
                        '📋 Слотов пока нет!\n\n' +
                        '🎯 Создай первое мероприятие через\n' +
                        '"🗓️ Создать мероприятие"').catch(console.error);
                    return;
                }
                
                let slotsText = '📅 ВСЕ СЛОТЫ МЕРОПРИЯТИЙ 🗓️\n\n';
                
                slots.forEach((slot, index) => {
                    const status = slot.status === 'active' ? '🟢' : '🔴';
                    slotsText += `${index + 1}. ${status} ${slot.event_name}\n`;
                    slotsText += `   📅 ${slot.date} в ${slot.time}\n`;
                    slotsText += `   📍 ${slot.location}\n`;
                    slotsText += `   👥 ${slot.current_participants}/${slot.max_participants}\n`;
                    slotsText += `   💰 ${slot.points_reward} коинов\n\n`;
                });
                
                slotsText += '🎯 Управление слотами в разработке!';
                
                bot.sendMessage(chatId, slotsText).catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Show slot management error:', error);
    }
}

function showTestSubmissions(chatId, telegramId) {
    try {
        db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
            if (!admin) {
                bot.sendMessage(chatId, '❌ Нет прав администратора!').catch(console.error);
                return;
            }
            
            db.all("SELECT * FROM test_submissions WHERE status = 'pending' ORDER BY submitted_date DESC", 
                   (err, submissions) => {
                
                if (!submissions || submissions.length === 0) {
                    bot.sendMessage(chatId, 
                        '📋 ЗАЯВКИ НА ПРОВЕРКУ 📝\n\n' +
                        '✅ Все заявки обработаны!\n\n' +
                        '🎉 Отличная работа, админ!').catch(console.error);
                    return;
                }
                
                submissions.forEach(submission => {
                    bot.sendPhoto(chatId, submission.photo_file_id, {
                        caption: `📋 ЗАЯВКА #${submission.id}\n\n` +
                                `👤 Пользователь: @${submission.username}\n` +
                                `📚 Тест: ${submission.test_name}\n` +
                                `🎯 Заявленные баллы: ${submission.points_claimed}\n` +
                                `📅 Дата: ${new Date(submission.submitted_date).toLocaleString('ru-RU')}\n\n` +
                                '🤔 Твое решение?',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '✅ Одобрить', callback_data: `approve_${submission.id}` },
                                { text: '❌ Отклонить', callback_data: `reject_${submission.id}` }
                            ]]
                        }
                    }).catch(console.error);
                });
            });
        });
    } catch (error) {
        console.error('❌ Show test submissions error:', error);
    }
}

function showUsersList(chatId, telegramId) {
    try {
        db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
            if (!admin) {
                bot.sendMessage(chatId, '❌ Нет прав администратора!').catch(console.error);
                return;
            }
            
            db.all("SELECT * FROM users WHERE is_registered = 1 ORDER BY registration_date DESC", 
                   (err, users) => {
                
                if (!users || users.length === 0) {
                    bot.sendMessage(chatId, '👥 Пользователей пока нет!').catch(console.error);
                    return;
                }
                
                let usersText = '👥 СПИСОК ПОЛЬЗОВАТЕЛЕЙ 📋\n\n';
                
                users.forEach((user, index) => {
                    const roleEmoji = user.role === 'стажер' ? '👶' : '🧓';
                    usersText += `${index + 1}. ${roleEmoji} ${user.full_name || user.username}\n`;
                    usersText += `   💰 ${user.p_coins} П-коинов\n`;
                    usersText += `   📅 ${new Date(user.registration_date).toLocaleDateString('ru-RU')}\n\n`;
                });
                
                bot.sendMessage(chatId, usersText).catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Show users list error:', error);
    }
}

// ========== CALLBACK ОБРАБОТЧИКИ ==========

bot.on('callback_query', (callbackQuery) => {
    try {
        const data = callbackQuery.data;
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;
        const adminTelegramId = callbackQuery.from.id;
        
        if (data.startsWith('approve_')) {
            const submissionId = data.split('_')[1];
            approveSubmission(chatId, messageId, adminTelegramId, submissionId, callbackQuery.id);
        } else if (data.startsWith('reject_')) {
            const submissionId = data.split('_')[1];
            rejectSubmission(chatId, messageId, adminTelegramId, submissionId, callbackQuery.id);
        }
    } catch (error) {
        console.error('❌ Callback query error:', error);
    }
});

function approveSubmission(chatId, messageId, adminTelegramId, submissionId, callbackQueryId) {
    try {
        db.get("SELECT * FROM admins WHERE telegram_id = ?", [adminTelegramId], (err, admin) => {
            if (!admin) {
                bot.answerCallbackQuery(callbackQueryId, { text: '❌ Нет прав!' }).catch(console.error);
                return;
            }
            
            db.get("SELECT * FROM test_submissions WHERE id = ? AND status = 'pending'", 
                   [submissionId], (err, submission) => {
                if (!submission) {
                    bot.answerCallbackQuery(callbackQueryId, { text: '❌ Заявка не найдена!' }).catch(console.error);
                    return;
                }
                
                // Обновляем статус заявки
                db.run("UPDATE test_submissions SET status = 'approved', admin_id = ?, reviewed_date = CURRENT_TIMESTAMP WHERE id = ?", 
                       [admin.user_id, submissionId], () => {
                    
                    // Начисляем П-коины пользователю
                    db.run("UPDATE users SET p_coins = p_coins + ? WHERE telegram_id = ?", 
                           [submission.points_claimed, submission.telegram_id], () => {
                        
                        // Записываем прогресс стажера
                        db.run(`INSERT OR REPLACE INTO intern_progress 
                                (user_id, test_name, completed, points_earned, completed_date) 
                                VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)`, 
                               [submission.user_id, submission.test_name, submission.points_claimed]);
                        
                        // Уведомляем пользователя
                        bot.sendMessage(submission.telegram_id, 
                            `🎉 ТЕСТ ОДОБРЕН! ✅\n\n` +
                            `📚 Тест: ${submission.test_name}\n` +
                            `💰 Получено: +${submission.points_claimed} П-коинов\n\n` +
                            '🏆 Отличная работа! Так держать! 💪\n' +
                            '🚀 Продолжай развиваться!').catch(console.error);
                        
                        // Обновляем сообщение админа
                        bot.editMessageCaption(
                            `✅ ЗАЯВКА #${submission.id} - ОДОБРЕНА!\n\n` +
                            `👤 Пользователь: @${submission.username}\n` +
                            `📚 Тест: ${submission.test_name}\n` +
                            `💰 Начислено: ${submission.points_claimed} баллов\n\n` +
                            '🎉 Решение принято!', 
                            { 
                                chat_id: chatId, 
                                message_id: messageId, 
                                reply_markup: { inline_keyboard: [] } 
                            }
                        ).catch(console.error);
                        
                        bot.answerCallbackQuery(callbackQueryId, { 
                            text: '✅ Одобрено! Баллы начислены!', 
                            show_alert: false 
                        }).catch(console.error);
                    });
                });
            });
        });
    } catch (error) {
        console.error('❌ Approve submission error:', error);
    }
}

function rejectSubmission(chatId, messageId, adminTelegramId, submissionId, callbackQueryId) {
    try {
        db.get("SELECT * FROM admins WHERE telegram_id = ?", [adminTelegramId], (err, admin) => {
            if (!admin) {
                bot.answerCallbackQuery(callbackQueryId, { text: '❌ Нет прав!' }).catch(console.error);
                return;
            }
            
            db.get("SELECT * FROM test_submissions WHERE id = ? AND status = 'pending'", 
                   [submissionId], (err, submission) => {
                if (!submission) {
                    bot.answerCallbackQuery(callbackQueryId, { text: '❌ Заявка не найдена!' }).catch(console.error);
                    return;
                }
                
                // Обновляем статус заявки
                db.run("UPDATE test_submissions SET status = 'rejected', admin_id = ?, reviewed_date = CURRENT_TIMESTAMP WHERE id = ?", 
                       [admin.user_id, submissionId], () => {
                    
                    // Уведомляем пользователя
                    bot.sendMessage(submission.telegram_id, 
                        `❌ Тест отклонен 😔\n\n` +
                        `📚 Тест: ${submission.test_name}\n\n` +
                        '🤔 Возможные причины:\n' +
                        '• Неправильный или нечеткий скриншот 📸\n' +
                        '• Неверно указаны баллы 🎯\n' +
                        '• Тест не завершен полностью ⏳\n' +
                        '• Подозрение в мошенничестве 🚫\n\n' +
                        '💪 Не расстраивайся! Попробуй еще раз!\n' +
                        '🎯 Будь внимательнее при прохождении!').catch(console.error);
                    
                    // Обновляем сообщение админа
                    bot.editMessageCaption(
                        `❌ ЗАЯВКА #${submission.id} - ОТКЛОНЕНА!\n\n` +
                        `👤 Пользователь: @${submission.username}\n` +
                        `📚 Тест: ${submission.test_name}\n` +
                        `🎯 Заявленные баллы: ${submission.points_claimed}\n\n` +
                        '🚫 Решение принято!', 
                        { 
                            chat_id: chatId, 
                            message_id: messageId, 
                            reply_markup: { inline_keyboard: [] } 
                        }
                    ).catch(console.error);
                    
                    bot.answerCallbackQuery(callbackQueryId, { 
                        text: '❌ Отклонено!', 
                        show_alert: false 
                    }).catch(console.error);
                });
            });
        });
    } catch (error) {
        console.error('❌ Reject submission error:', error);
    }
}

// ========== ОБРАБОТКА ОШИБОК И ЗАПУСК ==========

console.log('🚀 Бот "Жизнь в Партнеркино" запускается...');
console.log('🎯 Версия: Кнопочная 2.0');
console.log('📋 Ctrl+C для остановки');

bot.on('error', (error) => {
    console.error('❌ Bot error:', error);
});

bot.on('polling_error', (error) => {
    console.error('❌ Polling error:', error);
    
    // Перезапуск при ошибке polling
    setTimeout(() => {
        console.log('🔄 Attempting to restart polling...');
        bot.stopPolling();
        setTimeout(() => {
            bot.startPolling();
        }, 2000);
    }, 3000);
});

process.on('SIGINT', () => {
    console.log('\n⏹️ Останавливаю бот...');
    console.log('💾 Закрываю базу данных...');
    db.close((err) => {
        if (err) {
            console.error('❌ Ошибка закрытия БД:', err.message);
        } else {
            console.log('✅ База данных закрыта успешно');
        }
        console.log('👋 Бот остановлен! До встречи!');
        process.exit(0);
    });
});