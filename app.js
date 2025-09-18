// app.js - Бот "Жизнь в Партнеркино" - УЛУЧШЕННАЯ ВЕРСИЯ 🚀
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const config = require('./config');
const fs = require('fs');
const PDFDocument = require('pdfkit');

// Получаем токен из конфигурации
const token = config.TELEGRAM_TOKEN;

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
global.userMenuContext = {};

// База данных
const db = new sqlite3.Database(config.DATABASE.name);

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

    // Подарки П-коинов
    db.run(`CREATE TABLE IF NOT EXISTS gifts (
        id INTEGER PRIMARY KEY,
        sender_id INTEGER,
        receiver_id INTEGER,
        amount INTEGER,
        message TEXT,
        gift_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(sender_id) REFERENCES users(id),
        FOREIGN KEY(receiver_id) REFERENCES users(id)
    )`);

    // Система задач
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY,
        creator_id INTEGER,
        assignee_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        priority TEXT DEFAULT 'medium',
        reward_coins INTEGER DEFAULT 0,
        due_date DATETIME,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_date DATETIME,
        cancelled_reason TEXT,
        postponed_until DATETIME,
        last_action_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(creator_id) REFERENCES users(id),
        FOREIGN KEY(assignee_id) REFERENCES users(id)
    )`);

    // Инвойсы для продажников
    db.run(`CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY,
        creator_id INTEGER,
        company_name TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        quantity INTEGER DEFAULT 1,
        description TEXT,
        file_path TEXT,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(creator_id) REFERENCES users(id)
    )`);

    // Helper function to check if column exists
    function columnExists(table, column, callback) {
        db.all(`PRAGMA table_info(${table})`, (err, rows) => {
            if (err) {
                callback(false);
                return;
            }
            const exists = rows.some(row => row.name === column);
            callback(exists);
        });
    }

    // Safe ALTERs for new fields
    columnExists('invoices', 'work_type', (exists) => {
        if (!exists) {
            db.run("ALTER TABLE invoices ADD COLUMN work_type TEXT", (err) => {
                if (err) console.log("ALTER work_type error:", err.message);
            });
        }
    });
    columnExists('invoices', 'org_address', (exists) => {
        if (!exists) {
            db.run("ALTER TABLE invoices ADD COLUMN org_address TEXT", (err) => {
                if (err) console.log("ALTER org_address error:", err.message);
            });
        }
    });
    columnExists('invoices', 'invoice_number', (exists) => {
        if (!exists) {
            db.run("ALTER TABLE invoices ADD COLUMN invoice_number INTEGER", (err) => {
                if (err) console.log("ALTER invoice_number error:", err.message);
            });
        }
    });
    columnExists('invoices', 'invoice_date', (exists) => {
        if (!exists) {
            db.run("ALTER TABLE invoices ADD COLUMN invoice_date DATE DEFAULT CURRENT_DATE", (err) => {
                if (err) console.log("ALTER invoice_date error:", err.message);
            });
        }
    });

    // Комментарии к задачам
    db.run(`CREATE TABLE IF NOT EXISTS task_comments (
        id INTEGER PRIMARY KEY,
        task_id INTEGER,
        user_id INTEGER,
        comment TEXT NOT NULL,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(task_id) REFERENCES tasks(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Система "Похвастаться"
    db.run(`CREATE TABLE IF NOT EXISTS achievements (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        photo_file_id TEXT,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Лайки к достижениям
    db.run(`CREATE TABLE IF NOT EXISTS achievement_likes (
        id INTEGER PRIMARY KEY,
        achievement_id INTEGER,
        user_id INTEGER,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(achievement_id) REFERENCES achievements(id),
        FOREIGN KEY(user_id) REFERENCES users(id),
        UNIQUE(achievement_id, user_id)
    )`);

    // Комментарии к достижениям
    db.run(`CREATE TABLE IF NOT EXISTS achievement_comments (
        id INTEGER PRIMARY KEY,
        achievement_id INTEGER,
        user_id INTEGER,
        comment TEXT NOT NULL,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(achievement_id) REFERENCES achievements(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
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
            ['💰 Личное', '🎓 Обучение'],
            ['📋 Работа', '🎮 Развлечения'],
            ['👤 Мой профиль']
        ],
        resize_keyboard: true
    }
};

// Sub-menus for main menu categories
const personalKeyboard = {
    reply_markup: {
        keyboard: [
            ['💰 Мой баланс', '🏆 Рейтинг'],
            ['🔙 В главное меню']
        ],
        resize_keyboard: true
    }
};

const learningKeyboard = {
    reply_markup: {
        keyboard: [
            ['🎓 Курсы', '📊 Мой прогресс'],
            ['🔙 В главное меню']
        ],
        resize_keyboard: true
    }
};

const workKeyboard = {
    reply_markup: {
        keyboard: [
            ['📋 Мои задачи', '🎯 Мероприятия'],
            ['📄 Создать инвойс'],
            ['🔙 В главное меню']
        ],
        resize_keyboard: true
    }
};

const funKeyboard = {
    reply_markup: {
        keyboard: [
            ['⚔️ PVP Сражения', '🛒 Магазин'],
            ['🎁 Подарить баллы', '🎉 Похвастаться'],
            ['🔙 В главное меню']
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
            ['🗓️ Мероприятия', '📢 Рассылка'],
            ['👥 Пользователи', '📊 Статистика'],
            ['💰 Управление балансом', '🎉 Достижения'],
            ['🔙 Выйти из админки']
        ],
        resize_keyboard: true
    }
};

// Sub-menus for admin
const adminEventsKeyboard = {
    reply_markup: {
        keyboard: [
            ['🗓️ Создать мероприятие', '📅 Все мероприятия'],
            ['✏️ Редактировать слот', '🗑️ Удалить слот'],
            ['🔙 В админку']
        ],
        resize_keyboard: true
    }
};

const adminUsersKeyboard = {
    reply_markup: {
        keyboard: [
            ['👥 Пользователи', '📋 Заявки на проверку'],
            ['🔙 В админку']
        ],
        resize_keyboard: true
    }
};

const tasksKeyboard = {
    reply_markup: {
        keyboard: [
            ['📝 Мои задачи', '✅ Завершенные'],
            ['🎯 Создать задачу', '👥 Задачи команды'],
            ['📦 Отложенные', '❌ Отмененные'],
            ['🔙 Назад в меню']
        ],
        resize_keyboard: true
    }
};

const broadcastKeyboard = {
    reply_markup: {
        keyboard: [
            ['👥 Всем пользователям', '🧓 Только старичкам'],
            ['👶 Только стажерам', '📊 Выборочно'],
            ['🔙 Назад в админку']
        ],
        resize_keyboard: true
    }
};

const balanceKeyboard = {
    reply_markup: {
        keyboard: [
            ['➕ Начислить баллы', '➖ Списать баллы'],
            ['👥 Список пользователей', '📊 Балансы'],
            ['🔙 Назад в админку']
        ],
        resize_keyboard: true
    }
};

const taskPriorityKeyboard = {
    reply_markup: {
        keyboard: [
            ['🔴 Высокий', '🟡 Средний', '🟢 Низкий'],
            ['❌ Отмена']
        ],
        resize_keyboard: true
    }
};

const taskRewardKeyboard = {
    reply_markup: {
        keyboard: [
            ['0 коинов', '5 коинов', '10 коинов'],
            ['15 коинов', '20 коинов', '25 коинов'],
            ['❌ Отмена']
        ],
        resize_keyboard: true
    }
};

// Клавиатура для действий с задачей (исполнитель)
const taskActionKeyboard = {
    reply_markup: {
        keyboard: [
            ['✅ Принять', '💬 Комментировать'],
            ['📦 Отложить', '❌ Отменить'],
            ['🔙 Назад к задачам']
        ],
        resize_keyboard: true
    }
};

// Клавиатура для действий создателя задачи после комментария
const taskCreatorActionKeyboard = {
    reply_markup: {
        keyboard: [
            ['🔄 Отправить дальше', '📦 Оставить как есть'],
            ['❌ Отменить задачу', '🔙 Назад']
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
            ['❌ Отмена']
        ],
        resize_keyboard: true
    }
};

// ========== ОСНОВНЫЕ КОМАНДЫ ==========

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    // [DEBUG LOG] Clear any active state on /start
    if (global.userScreenshots[telegramId]) {
        console.log(`[START DEBUG] Clearing state for user ${telegramId}: ${JSON.stringify({type: global.userScreenshots[telegramId].type, step: global.userScreenshots[telegramId].step})}`);
        delete global.userScreenshots[telegramId];
    }
    
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

        // [DEBUG LOG] Log incoming message and current state
        const currentState = global.userScreenshots[telegramId];
        console.log(`[MESSAGE DEBUG] User ${telegramId} sent: "${text}" | Current state: ${currentState ? JSON.stringify({type: currentState.type, step: currentState.step}) : 'none'}`);
        
        // Обработка команд достижений
        if (text && text.startsWith('/like_')) {
            const achievementId = parseInt(text.replace('/like_', ''));
            handleLikeAchievement(chatId, telegramId, achievementId);
            return;
        }

        if (text && text.startsWith('/comment_')) {
            const achievementId = parseInt(text.replace('/comment_', ''));
            startCommentAchievement(chatId, telegramId, achievementId);
            return;
        }

        if (text && text.startsWith('/')) return;
        
        // Обработка фото для рассылки (если админ в режиме broadcast и ожидает медиа)
        if (msg.photo && global.userScreenshots[telegramId] && global.userScreenshots[telegramId].type === 'broadcast' && global.userScreenshots[telegramId].step === 'media') {
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            global.userScreenshots[telegramId].media.push({ type: 'photo', media: fileId });
            console.log(`[BROADCAST LOG] Admin ${telegramId} added photo to broadcast media. Total media: ${global.userScreenshots[telegramId].media.length}`);
            bot.sendMessage(chatId, `📸 Фото добавлено! (${global.userScreenshots[telegramId].media.length} шт.)\nОтправь еще или напиши "готово".`).catch(console.error);
            return;
        }

        // Обработка скриншотов
        if (msg.photo) {
            handleScreenshot(chatId, telegramId, msg.photo[msg.photo.length - 1].file_id, username);
            return;
        }
        
        if (!text) return;

        // DEBUG LOG FOR MAIN MENU BUTTON
        if (text && text.includes('Главное меню')) {
            console.log(`[BUTTON DEBUG] Main menu button pressed by user ${telegramId}: exact text="${text}"`);
        }
        
        // РЕГИСТРАЦИЯ
        if (text === '👶 Я стажер') {
            registerUser(chatId, telegramId, username, 'стажер');
        } 
        if (text === '🧓 Я старичок') {
            registerUser(chatId, telegramId, username, 'старичок');
        }
        
        // ВХОД В АДМИНКУ
        if (text === 'partnerkin1212') {
            handleAdminLogin(chatId, telegramId);
        }
        
// ========== ФУНКЦИИ МЕРОПРИЯТИЙ ==========

function showAvailableEvents(chatId, telegramId) {
    try {
        db.all("SELECT * FROM event_slots WHERE status = 'active' ORDER BY date, time", (err, slots) => {
            if (!slots || slots.length === 0) {
                bot.sendMessage(chatId,
                    '📅 МЕРОПРИЯТИЯ 📋\n\n' +
                    '📋 Мероприятий пока нет!\n\n' +
                    '🎯 Следи за обновлениями!').catch(console.error);
                return;
            }

            let eventsText = '📅 ДОСТУПНЫЕ МЕРОПРИЯТИЯ 📋\n\n';

            slots.forEach((slot, index) => {
                eventsText += `${index + 1}. ${slot.event_name}\n`;
                eventsText += `   📅 ${slot.date} в ${slot.time}\n`;
                eventsText += `   📍 ${slot.location}\n`;
                eventsText += `   👥 ${slot.current_participants}/${slot.max_participants}\n`;
                eventsText += `   💰 ${slot.points_reward} коинов\n\n`;
            });

            eventsText += '👇 Выбери мероприятие по номеру или используй кнопки категорий:';

            global.userScreenshots[telegramId] = {
                type: 'event_selection',
                events: slots
            };

            const categoryKeyboard = {
                keyboard: [
                    ['Зарядка', 'Покер'],
                    ['Корпоратив', 'Тренинги'],
                    ['🔙 Назад в меню']
                ],
                resize_keyboard: true
            };

            bot.sendMessage(chatId, eventsText, categoryKeyboard).catch(console.error);
        });
    } catch (error) {
        console.error('❌ Show available events error:', error);
    }
}

function handleEventSelection(chatId, telegramId, text) {
    try {
        const eventData = global.userScreenshots[telegramId];
        const eventIndex = parseInt(text) - 1;

        if (isNaN(eventIndex) || eventIndex < 0 || eventIndex >= eventData.events.length) {
            bot.sendMessage(chatId, '❌ Неверный номер мероприятия!').catch(console.error);
            return;
        }

        const selectedEvent = eventData.events[eventIndex];
        showEventDetails(chatId, telegramId, selectedEvent);
        delete global.userScreenshots[telegramId];
    } catch (error) {
        console.error('❌ Handle event selection error:', error);
    }
}

function showEventDetails(chatId, telegramId, event) {
    try {
        const signupKeyboard = {
            keyboard: [
                ['📅 Записаться на ' + event.event_name],
                ['🔙 Назад к мероприятиям']
            ],
            resize_keyboard: true
        };

        bot.sendMessage(chatId,
            `🎯 МЕРОПРИЯТИЕ: ${event.event_name}\n\n` +
            `📅 Дата: ${event.date}\n` +
            `⏰ Время: ${event.time}\n` +
            `📍 Место: ${event.location}\n` +
            `👥 Участников: ${event.current_participants}/${event.max_participants}\n` +
            `💰 Награда: ${event.points_reward} П-коинов\n\n` +
            '👇 Хочешь записаться?', signupKeyboard).catch(console.error);
    } catch (error) {
        console.error('❌ Show event details error:', error);
    }
         }

         if (text === '📅 Мероприятия') {
             showAvailableEvents(chatId, telegramId);
         }
         if (text === '🔙 Назад к мероприятиям') {
             showAvailableEvents(chatId, telegramId);
         }
         if (text.startsWith('📅 Записаться на ')) {
             const eventName = text.replace('📅 Записаться на ', '');
             handleEventSignup(chatId, telegramId, eventName);
             delete global.userScreenshots[telegramId];
         }

         // ========== МЕРОПРИЯТИЯ (CONSOLIDATED HANDLER) ==========
         if (text === '📅 Все мероприятия') {
             console.log(`[DEBUG FIRST HANDLER] All events triggered for user ${telegramId}, admin check starting`);
             // Clear event booking state if active
             if (global.userScreenshots[telegramId] && global.userScreenshots[telegramId].type === 'event_booking') {
                 delete global.userScreenshots[telegramId];
             }
             // Branch based on admin status
             db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
                 console.log(`[DEBUG FIRST HANDLER] Admin check result for ${telegramId}: ${admin ? 'Admin' : 'Non-admin'}`);
                 if (admin) {
                     console.log(`[DEBUG FIRST HANDLER] Calling showAllEventSlotsAdmin for ${telegramId}`);
                     showAllEventSlotsAdmin(chatId, telegramId);
                 } else {
                     console.log(`[DEBUG FIRST HANDLER] Calling showAllEventSlots for ${telegramId}`);
                     showAllEventSlots(chatId);
                 }
             });
         }

         // ========== АДМИНСКИЕ ФУНКЦИИ ==========
         if (text === '🗓️ Создать мероприятие') {
             startEventCreation(chatId, telegramId);
         }
         if (text === '✏️ Редактировать слот') {
             startSlotEdit(chatId, telegramId);
         }
         if (text === '🗑️ Удалить слот') {
             startSlotDelete(chatId, telegramId);
         }
         if (text === '📢 Рассылка') {
             startBroadcast(chatId, telegramId);
         }
         if (text === '📋 Заявки на проверку') {
             showTestSubmissions(chatId, telegramId);
         }
         if (text === '👥 Пользователи') {
             showUsersList(chatId, telegramId);
         }
         if (text === '📊 Статистика') {
             showAdminStats(chatId, telegramId);
         }
         if (text === '💰 Управление балансом') {
             showBalanceManagement(chatId, telegramId);
         }
         if (text === '🎉 Достижения') {
             showAchievementsAdmin(chatId, telegramId);
         }
         if (text === '🔙 Назад в админку') {
             backToAdminMenu(chatId, telegramId);
         }

         // ========== УПРАВЛЕНИЕ БАЛАНСОМ ==========
         else if (text === '➕ Начислить баллы') {
             startAddCoins(chatId, telegramId);
         }
         else if (text === '➖ Списать баллы') {
             startDeductCoins(chatId, telegramId);
         }
         else if (text === '👥 Список пользователей') {
             showUsersList(chatId, telegramId);
         }
         else if (text === '📊 Балансы') {
             showBalances(chatId, telegramId);
         }
        else if (text === '🔙 Выйти из админки') {
            exitAdminMode(chatId, telegramId);
        }

        // ========== NEW CATEGORY HANDLERS ==========
        // Main menu categories
        if (text === '💰 Личное') {
            showPersonalMenu(chatId);
        } else if (text === '🎓 Обучение') {
            showLearningMenu(chatId);
        } else if (text === '📋 Работа') {
            showWorkMenu(chatId, telegramId);
        } else if (text === '📄 Создать инвойс') {
            db.get("SELECT * FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
                if (err || !user) {
                    bot.sendMessage(chatId, '❌ Ошибка!').catch(console.error);
                    return;
                }
                // Assume for all users, or check role if needed
                global.userScreenshots[telegramId] = {
                    type: 'invoice_creation',
                    step: 'org_name',
                    data: {}
                };
                bot.sendMessage(chatId, "📄 Создание инвойса. Шаг 1: Название организации? (Введите на английском для PDF)").catch(console.error);
            });
        } else if (text === '🎮 Развлечения') {
            showFunMenu(chatId);
        }

        // Admin categories
        if (text === '🗓️ Мероприятия') {
            showAdminEventsMenu(chatId);
        } else if (text === '📢 Рассылка') {
            startBroadcast(chatId, telegramId);
        } else if (text === '👥 Пользователи') {
            showAdminUsersMenu(chatId);
        } else if (text === '📊 Статистика') {
            showAdminStats(chatId, telegramId);
        } else if (text === '🔙 В админку') {
            backToAdminMenu(chatId, telegramId);
        }
        
        // ========== ОСНОВНОЕ МЕНЮ ==========
        if (text === '💰 Мой баланс') {
            showBalance(chatId, telegramId);
        }
        if (text === '📚 Пройти тестирование') {
            showTestMenu(chatId);
        }
        if (text === '📊 Мой прогресс') {
            showInternProgress(chatId, telegramId);
        }
        if (text === '🔄 Главное меню' || text === '🔙 В главное меню' || text === '🔙 Главное меню' || text === '👤 Мой профиль') {
            console.log(`[NAV DEBUG] Direct main menu trigger for user ${telegramId} (text: "${text}")`);
            backToMainMenu(chatId, telegramId);
            return;
        } else if (text === '🔙 Назад в меню') {
            console.log(`[NAV DEBUG] Back to menu button pressed for user ${telegramId}, context: ${JSON.stringify(global.userMenuContext[chatId] || 'none')}`);
            handleBackNavigation(chatId, telegramId);
            return;
        }
        
        // ========== ТЕСТЫ ДЛЯ СТАЖЕРОВ ==========
        if (text === '🌟 Знакомство с компанией') {
            selectTest(chatId, telegramId, 'Знакомство с компанией', 10);
        }
        if (text === '📈 Основы работы') {
            selectTest(chatId, telegramId, 'Основы работы', 15);
        }
        if (text === '🎯 Продуктовая линейка') {
            selectTest(chatId, telegramId, 'Продуктовая линейка', 15);
        }

        // ========== ФУНКЦИИ ДЛЯ СТАРИЧКОВ ==========
        if (text === '⚔️ PVP Сражения') {
            showPVPMenu(chatId, telegramId);
        }
        if (text === '🛒 Магазин') {
            showShop(chatId, telegramId);
        }
        if (text === '🎓 Курсы') {
            showCoursesMenu(chatId);
        }
        if (text === '🎯 Мероприятия') {
            showEventsMenu(chatId);
        }
        if (text === '📋 Мои задачи') {
            showTasksMenu(chatId, telegramId);
        }
        if (text === '🎁 Подарить баллы') {
            startGiftProcess(chatId, telegramId);
        }
        if (text === '🏆 Рейтинг') {
            showRating(chatId, telegramId);
        }
        if (text === '🎉 Похвастаться') {
            startAchievementCreation(chatId, telegramId);
        }

        // ========== PVP МЕНЮ ==========
        if (text === '🎯 Найти противника') {
            findOpponent(chatId, telegramId);
        }
        if (text === '🏆 Мой рейтинг') {
            showRating(chatId, telegramId);
        }
        if (text === '⚡ Восстановить энергию') {
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
        else if (text === '🏃‍♂️ Зарядка' || text === 'Зарядка') {
            // Проверяем, не в админке ли пользователь
            db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
                if (admin && global.adminStates[telegramId]) {
                    // Админ в процессе создания мероприятия
                    handleAdminEventCreation(chatId, telegramId, text);
                } else {
                    // Обычный пользователь смотрит мероприятия
                    showEventSlots(chatId, telegramId, 'Зарядка');
                }
            });
        }
        else if (text === '🎰 Покер' || text === 'Покер') {
            db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
                if (admin && global.adminStates[telegramId]) {
                    handleAdminEventCreation(chatId, telegramId, text);
                } else {
                    showEventSlots(chatId, telegramId, 'Покер');
                }
            });
        }
        else if (text === '🎉 Корпоратив' || text === 'Корпоратив') {
            db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
                if (admin && global.adminStates[telegramId]) {
                    handleAdminEventCreation(chatId, telegramId, text);
                } else {
                    showEventSlots(chatId, telegramId, 'Корпоратив');
                }
            });
        }
        else if (text === '📚 Тренинги' || text === 'Тренинги') {
            db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
                if (admin && global.adminStates[telegramId]) {
                    handleAdminEventCreation(chatId, telegramId, text);
                } else {
                    showEventSlots(chatId, telegramId, 'Тренинги');
                }
            });
        }
        // REMOVED DUPLICATE HANDLER FOR '📅 Все мероприятия' - handled in first block to prevent duplicates

        // ========== РАССЫЛКИ (АДМИН) ==========
        if (text === '👥 Всем пользователям') {
            setBroadcastTarget(chatId, telegramId, 'all');
        }
        if (text === '🧓 Только старичкам') {
            setBroadcastTarget(chatId, telegramId, 'seniors');
        }
        if (text === '👶 Только стажерам') {
            setBroadcastTarget(chatId, telegramId, 'interns');
        }
        if (text === '📊 Выборочно') {
            setBroadcastTarget(chatId, telegramId, 'selective');
        }

        // ========== МЕНЮ ЗАДАЧ ==========
        if (text === '📝 Мои задачи') {
            showMyTasks(chatId, telegramId);
        }
        if (text === '✅ Завершенные') {
            showCompletedTasks(chatId, telegramId);
        }
        if (text === '🎯 Создать задачу') {
            startTaskCreation(chatId, telegramId);
        }
        if (text === '👥 Задачи команды') {
            showTeamTasks(chatId, telegramId);
        }
        if (text === '📦 Отложенные') {
            showPostponedTasks(chatId, telegramId);
        }
        if (text === '❌ Отмененные') {
            showCancelledTasks(chatId, telegramId);
        }

        // ========== ДЕЙСТВИЯ С ЗАДАЧАМИ ==========
        if (text === '✅ Принять') {
            acceptTask(chatId, telegramId);
        }
        if (text === '💬 Комментировать') {
            startTaskComment(chatId, telegramId);
        }
        if (text === '📦 Отложить') {
            postponeTask(chatId, telegramId);
        }
        if (text === '❌ Отменить') {
            cancelTask(chatId, telegramId);
        }
        else if (text === '🔄 Отправить дальше') {
            redirectTask(chatId, telegramId);
        }
        else if (text === '📦 Оставить как есть') {
            keepTaskAsIs(chatId, telegramId);
        }

        // ========== ДЕЙСТВИЯ С ДОСТИЖЕНИЯМИ ==========
        else if (text === '✅ Опубликовать') {
            publishAchievement(chatId, telegramId);
        }

        // ========== СОЗДАНИЕ ЗАДАЧ (КНОПКИ) ==========
        else if (text === '🔴 Высокий' || text === '🟡 Средний' || text === '🟢 Низкий') {
            setTaskPriority(chatId, telegramId, text);
        }
        else if (text.includes('коинов') && text !== '🔙 Назад в меню') {
            setTaskReward(chatId, telegramId, text);
        }

        // /cancel handler
        if (text === '/cancel') {
            if (global.userScreenshots[telegramId] && global.userScreenshots[telegramId].type === 'invoice_creation') {
                delete global.userScreenshots[telegramId];
                bot.sendMessage(chatId, "❌ Создание инвойса отменено. Возврат в меню.").catch(console.error);
                backToMainMenu(chatId, telegramId);
                return;
            }
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
    // [DEBUG LOG] Entry to handleTextInput
    const currentState = global.userScreenshots[telegramId];
    console.log(`[TEXTINPUT DEBUG] User ${telegramId} text "${text}" | State on entry: ${currentState ? JSON.stringify({type: currentState.type, step: currentState.step}) : 'none'}`);
    
    // Escape mechanism: Check for keywords to reset state
    const lowerText = text.toLowerCase();
    const escapeKeywords = ['exit', 'menu', 'back', '/menu'];
    if (lowerText.includes('exit') || lowerText.includes('menu') || lowerText.includes('back') || text === '/menu') {
        console.log(`[ESCAPE DEBUG] Escape keyword detected: "${text}" for user ${telegramId}`);
        if (currentState) {
            delete global.userScreenshots[telegramId];
            console.log(`[ESCAPE DEBUG] Cleared state for user ${telegramId}`);
        }
        backToMainMenu(chatId, telegramId);
        return;
    }
    
    try {
        // Invoice creation state
        if (currentState && currentState.type === 'invoice_creation') {
            const state = currentState;
            const data = state.data;
            let valid = true;
            let nextStep = '';
            let prompt = '';

            switch (state.step) {
                case 'org_name':
                    if (text.trim() === '') {
                        valid = false;
                        prompt = "❌ Введите корректное название!";
                    } else {
                        data.org_name = text.trim();
                        nextStep = 'org_address';
                        prompt = `✅ Организация: ${data.org_name}. Шаг 2: Адрес организации? (Введите на английском для PDF)`;
                    }
                    break;
                case 'org_address':
                    if (text.trim() === '') {
                        valid = false;
                        prompt = "❌ Введите корректный адрес!";
                    } else {
                        data.org_address = text.trim();
                        nextStep = 'work_type';
                        prompt = `✅ Адрес: ${data.org_address}. Шаг 3: Тип работы (e.g., 'website branding')? (Введите на английском для PDF)`;
                    }
                    break;
                case 'work_type':
                    if (text.trim() === '') {
                        valid = false;
                        prompt = "❌ Введите корректный тип работы!";
                    } else {
                        data.work_type = text.trim();
                        nextStep = 'quantity';
                        prompt = `✅ Тип: ${data.work_type}. Шаг 4: Количество?`;
                    }
                    break;
                case 'quantity':
                    const qty = parseInt(text);
                    if (isNaN(qty) || qty <= 0) {
                        valid = false;
                        prompt = "❌ Введите положительное число!";
                    } else {
                        data.quantity = qty;
                        nextStep = 'amount';
                        prompt = `✅ Кол-во: ${data.quantity}. Шаг 5: Сумма за единицу (USDT)?`;
                    }
                    break;
                case 'amount':
                    const amt = parseFloat(text);
                    if (isNaN(amt) || amt <= 0) {
                        valid = false;
                        prompt = "❌ Введите положительное число!";
                    } else {
                        data.amount = amt;
                        data.total = data.quantity * data.amount;
                        data.start_date = new Date().toLocaleDateString('ru-RU');
                        data.end_date = data.start_date;
                        data.description = null;
                        db.get("SELECT COALESCE(MAX(invoice_number), 0) + 1 AS next FROM invoices", (err, row) => {
                            if (err) {
                                console.error('Error getting next invoice number:', err);
                                bot.sendMessage(chatId, "Error preparing preview.").catch(console.error);
                                return;
                            }
                            const next_seq = row.next;
                            state.step = 'preview';
                            global.userScreenshots[telegramId] = state;
                            const previewText = `📋 Предпросмотр: Организация: ${data.org_name}, Адрес: ${data.org_address}, Тип: ${data.work_type}, Кол-во: ${data.quantity}, Сумма/ед: ${data.amount}, Итого: ${data.total} USDT. Invoice #: ${next_seq}. Подтвердить?`;
                            bot.sendMessage(chatId, previewText, {
                                reply_markup: {
                                    inline_keyboard: [
                                        [{text: '✅ Да', callback_data: 'confirm_invoice'}],
                                        [{text: '❌ Нет', callback_data: 'cancel_invoice'}]
                                    ]
                                }
                            }).catch(console.error);
                        });
                        return;
                    }
                    break;
                default:
                    valid = false;
            }

            if (valid && nextStep !== 'preview') {
                state.step = nextStep;
                global.userScreenshots[telegramId] = state;
                bot.sendMessage(chatId, prompt).catch(console.error);
            } else if (!valid) {
                bot.sendMessage(chatId, prompt).catch(console.error);
            }
            return;
        }

        // Обработка создания мероприятий админом
        if (global.adminStates[telegramId]) {
            handleAdminEventCreation(chatId, telegramId, text);
            return;
        }

        // Обработка создания задач
        if (global.userScreenshots[telegramId] && global.userScreenshots[telegramId].type === 'task_creation') {
            handleTaskCreation(chatId, telegramId, text);
            return;
        }

        // Обработка создания достижений
        if (global.userScreenshots[telegramId] && global.userScreenshots[telegramId].type === 'achievement_creation') {
            handleAchievementCreation(chatId, telegramId, text);
            return;
        }

        // Обработка комментариев к достижениям
        if (global.userScreenshots[telegramId] && global.userScreenshots[telegramId].type === 'achievement_comment') {
            handleAchievementComment(chatId, telegramId, text);
            return;
        }

        // Обработка выбора мероприятия
        if (global.userScreenshots[telegramId] && global.userScreenshots[telegramId].type === 'event_selection') {
            handleEventSelection(chatId, telegramId, text);
            return;
        }

        // Обработка начисления баллов админом
        if (global.userScreenshots[telegramId] && global.userScreenshots[telegramId].type === 'balance_add') {
            handleBalanceAdd(chatId, telegramId, text);
            return;
        }

        // Обработка списания баллов админом
        if (global.userScreenshots[telegramId] && global.userScreenshots[telegramId].type === 'balance_deduct') {
            handleBalanceDeduct(chatId, telegramId, text);
            return;
        }

        // Обработка рассылок админом
        if (global.userScreenshots[telegramId] && global.userScreenshots[telegramId].type === 'broadcast') {
            handleBroadcastMessage(chatId, telegramId, text);
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
            console.log(`[DEBUG TEXT INPUT] User ${telegramId} text "${text}", state: event_booking, slots count: ${global.userScreenshots[telegramId].slots.length}`);
            const slotNumber = parseInt(text);
            const eventData = global.userScreenshots[telegramId];
 
            if (isNaN(slotNumber)) {
                // Add counter for event booking if needed, but since it clears silently, keep as is
                console.log(`[DEBUG SLOT ERROR] Non-numeric text "${text}", clearing state silently for user ${telegramId}`);
                delete global.userScreenshots[telegramId];
                // Allow fall-through to other handlers if needed, but since end, just clear
            } else if (slotNumber < 1 || slotNumber > eventData.slots.length) {
                console.log(`[DEBUG SLOT ERROR] Invalid slot number ${slotNumber} for user ${telegramId}`);
                bot.sendMessage(chatId, '🤷‍♂️ Такого номера слота нет! Попробуй еще раз 🔢').catch(console.error);
                return;
            } else {
                bookEventSlot(chatId, telegramId, eventData.slots[slotNumber - 1]);
                delete global.userScreenshots[telegramId];
                console.log(`[DEBUG EVENT BOOKING] Cleared state for user ${telegramId} after booking slot ${slotNumber}`);
                return;
            }
        }

        // Обработка процесса подарков
        if (global.userScreenshots[telegramId] && global.userScreenshots[telegramId].type === 'gift') {
            handleGiftProcess(chatId, telegramId, text);
            return;
        }

        // Обработка завершения задач
        if (text.startsWith('выполнил ')) {
            const taskNumber = parseInt(text.replace('выполнил ', ''));
            completeTask(chatId, telegramId, taskNumber);
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
    console.log(`[MENU DEBUG] showMainMenu called for user ${user.id} (role: ${user.role}), chatId: ${chatId}`);
    try {
        if (user.role === 'стажер') {
            console.log(`[MENU DEBUG] Processing intern path for user ${user.id}`);
            db.get(`SELECT COUNT(*) as completed FROM intern_progress ip
                    JOIN users u ON u.id = ip.user_id
                    WHERE u.telegram_id = ? AND ip.completed = 1`, [user.telegram_id], (err, progress) => {
                if (err) {
                    console.error('[MENU DEBUG] Intern progress query error:', err);
                    return;
                }
                console.log(`[MENU DEBUG] Intern progress fetched: ${progress ? progress.completed : 0} completed tests`);

                if (progress && progress.completed >= 3) {
                    console.log(`[MENU DEBUG] Sending completed intern menu message`);
                    bot.sendMessage(chatId,
                        '🎉 Поздравляю! Стажировка завершена! 🏆\n\n' +
                        `💰 Баланс: ${user.p_coins} П-коинов\n` +
                        '🚀 Теперь тебе доступны ВСЕ функции!\n' +
                        '🔥 Время покорять новые вершины!', mainMenuKeyboard).catch((sendErr) => {
                            console.error('[MENU DEBUG] Failed to send completed intern message:', sendErr);
                        });
                } else {
                    console.log(`[MENU DEBUG] Sending active intern menu message`);
                    bot.sendMessage(chatId,
                        '👋 Привет, стажер! 📚\n\n' +
                        `💰 Баланс: ${user.p_coins} П-коинов\n` +
                        '🎯 Продолжай проходить тесты!\n' +
                        '💪 Каждый тест приближает к цели!', internMenuKeyboard).catch((sendErr) => {
                            console.error('[MENU DEBUG] Failed to send active intern message:', sendErr);
                        });
                }
            });
        } else {
            console.log(`[MENU DEBUG] Processing non-intern path for user ${user.id}`);
            // Получаем активные задачи пользователя
            db.all(`SELECT COUNT(*) as active_tasks FROM tasks
                    WHERE assignee_id = ? AND status = 'pending'`, [user.id], (err, taskCount) => {

                const activeTasksCount = taskCount && taskCount[0] ? taskCount[0].active_tasks : 0;

                // Определяем должность пользователя (можно расширить логику)
                const position = user.role === 'старичок' ? 'Опытный сотрудник' : 'Сотрудник';

                let menuText = `👤 ${user.full_name || user.username}\n`;
                menuText += `🏢 ${position}\n\n`;
                menuText += `💰 Баланс: ${user.p_coins} П-коинов\n`;
                menuText += `⚡ Энергия: ${user.energy}%\n`;

                if (activeTasksCount > 0) {
                    menuText += `📋 Активные задачи: ${activeTasksCount}\n`;
                } else {
                    menuText += `✅ Нет активных задач\n`;
                }

                // Добавляем курсы которые нужно пройти (можно расширить)
                menuText += `🎓 Рекомендуемые курсы: Доступны в разделе "Курсы"\n\n`;

                // Пожелание хорошего дня
                const greetings = [
                    '🌟 Желаю продуктивного дня!',
                    '🚀 Пусть день будет полон успехов!',
                    '💪 Удачи в новых свершениях!',
                    '🔥 Покоряй новые вершины!',
                    '⭐ Пусть день принесет радость!'
                ];

                const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
                menuText += randomGreeting;

                console.log(`[MENU DEBUG] Sending non-intern main menu message for user ${user.id}`);
                bot.sendMessage(chatId, menuText, mainMenuKeyboard).catch((sendErr) => {
                    console.error('[MENU DEBUG] Failed to send non-intern main menu message:', sendErr);
                });
            });
        }
    } catch (error) {
        console.error('❌ Show main menu error:', error);
    }
}

// New category menu functions
function showPersonalMenu(chatId) {
    bot.sendMessage(chatId,
        '💰 ЛИЧНЫЙ КАБИНЕТ 👤\n\n' +
        'Здесь ты можешь проверить свой баланс и позицию в рейтинге.\n\n' +
        '👇 Выбери действие:', personalKeyboard).catch(console.error);
}

function showLearningMenu(chatId) {
    let context = global.userMenuContext[chatId];
    if (!context) {
        context = { path: ['main'], menuFn: 'main' };
    }
    if (context.path[context.path.length - 1] === 'main') {
        context.path.push('learning');
        context.menuFn = 'learning';
    } else {
        context.path = ['main', 'learning'];
        context.menuFn = 'learning';
    }
    global.userMenuContext[chatId] = context;
    console.log(`[NAV LOG] Entering learning menu for user ${chatId}, context: ${JSON.stringify(context)}`);
    bot.sendMessage(chatId,
        '🎓 ОБУЧЕНИЕ И РАЗВИТИЕ 📚\n\n' +
        'Прокачивай навыки через курсы и отслеживай прогресс.\n\n' +
        '👇 Выбери раздел:', learningKeyboard).catch(console.error);
}

function showWorkMenu(chatId, telegramId) {
    // Get active tasks count for message
    db.get("SELECT id FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
        if (!user) return;
        db.get(`SELECT COUNT(*) as active_tasks FROM tasks WHERE assignee_id = ? AND status = 'pending'`, [user.id], (err, taskCount) => {
            const activeTasksCount = taskCount ? taskCount.active_tasks : 0;
            bot.sendMessage(chatId,
                '📋 РАБОТА И ЗАДАЧИ 💼\n\n' +
                `📝 Активных задач: ${activeTasksCount}\n` +
                'Управляй задачами и записывайся на мероприятия.\n\n' +
                '👇 Выбери раздел:', workKeyboard).catch(console.error);
        });
    });
}

function showFunMenu(chatId) {
    bot.sendMessage(chatId,
        '🎮 РАЗВЛЕЧЕНИЯ И НАГРАДЫ 🎁\n\n' +
        'Сражайся в PVP, покупай в магазине, дари баллы и хвастайся достижениями!\n\n' +
        '👇 Выбери развлечение:', funKeyboard).catch(console.error);
}

// Admin sub-menus
function showAdminEventsMenu(chatId) {
    bot.sendMessage(chatId,
        '🗓️ УПРАВЛЕНИЕ МЕРОПРИЯТИЯМИ 📅\n\n' +
        'Создавай, редактируй и удаляй слоты мероприятий.\n\n' +
        '👇 Выбери действие:', adminEventsKeyboard).catch(console.error);
}

function showAdminUsersMenu(chatId) {
    bot.sendMessage(chatId,
        '👥 УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ 📊\n\n' +
        'Просматривай пользователей и проверяй заявки на тесты.\n\n' +
        '👇 Выбери раздел:', adminUsersKeyboard).catch(console.error);
}

// ========== ФУНКЦИИ ТЕСТИРОВАНИЯ ==========

function showTestMenu(chatId) {
    global.userMenuContext[chatId] = { path: ['main', 'learning', 'tests'], menuFn: 'tests' };
    console.log(`[NAV LOG] Entering test menu for user ${chatId}, context: ${JSON.stringify(global.userMenuContext[chatId])}`);
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

        const userData = global.userScreenshots[telegramId];

        // Проверяем тип обработки
        if (userData.type === 'achievement_creation') {
            // Обработка фото для достижения
            userData.photoFileId = photoFileId;
            userData.step = 'confirm_achievement';

            bot.sendMessage(chatId,
                '📸 Фото получено! ✅\n\n' +
                `🏆 Название: ${userData.title}\n` +
                `📝 Описание: ${userData.description || 'Без описания'}\n\n` +
                '✅ Все готово! Опубликовать достижение?\n' +
                '📢 Оно будет отправлено всем пользователям!', {
                    reply_markup: {
                        keyboard: [
                            ['✅ Опубликовать', '❌ Отменить'],
                            ['🔙 Назад в меню']
                        ],
                        resize_keyboard: true
                    }
                }).catch(console.error);
        } else {
            // Обработка фото для теста (старая логика)
            global.waitingForPoints[telegramId] = {
                testName: userData.testName,
                reward: userData.reward,
                photoFileId: photoFileId
            };

            delete global.userScreenshots[telegramId];

            bot.sendMessage(chatId,
                `📸 Скриншот получен! ✅\n\n` +
                `📝 Тест: ${userData.testName}\n` +
                `🏆 Максимум: ${userData.reward} баллов\n\n` +
                '🎯 Сколько баллов ты набрал?\n' +
                '🔢 Напиши число (например: 85)').catch(console.error);
        }
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
    // [DEBUG LOG] Clear states on navigation to main menu
    if (global.userScreenshots[telegramId]) {
        console.log(`[NAV DEBUG] Clearing userScreenshots state for user ${telegramId}: ${JSON.stringify({type: global.userScreenshots[telegramId].type, step: global.userScreenshots[telegramId].step})}`);
        delete global.userScreenshots[telegramId];
    }
    delete global.userMenuContext[chatId];
    console.log(`[NAV DEBUG] backToMainMenu invoked for user ${telegramId}, context cleared`);
    try {
        db.get("SELECT * FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (err) {
                console.error('[NAV DEBUG] DB error in backToMainMenu:', err);
                return;
            }
            if (user) {
                console.log(`[NAV DEBUG] Fetching user ${user.id} for main menu display`);
                showMainMenu(chatId, user);
            } else {
                console.log(`[NAV DEBUG] No user found for ${telegramId} in backToMainMenu`);
            }
        });
    } catch (error) {
        console.error('❌ Back to main menu error:', error);
    }
}

function handleBackNavigation(chatId, telegramId) {
    // Clear event booking state if active
    if (global.userScreenshots[telegramId] && global.userScreenshots[telegramId].type === 'event_booking') {
        delete global.userScreenshots[telegramId];
    }
    let context = global.userMenuContext[chatId];
    if (!context || context.path.length <= 1) {
        console.log(`[NAV LOG] No context or root level, going to main for user ${telegramId}`);
        backToMainMenu(chatId, telegramId);
        return;
    }

    // Pop the last menu level
    context.path.pop();
    const newPath = context.path;
    console.log(`[NAV LOG] Back navigation for user ${telegramId}, popped to path: ${newPath.join(' -> ')}`);

    // Show previous menu based on new path
    const lastMenu = newPath[newPath.length - 1];
    switch (lastMenu) {
        case 'learning':
            showLearningMenu(chatId);
            break;
        case 'tests':
            showTestMenu(chatId);
            break;
        case 'personal':
            showPersonalMenu(chatId);
            break;
        case 'work':
            showWorkMenu(chatId, telegramId);
            break;
        case 'fun':
            showFunMenu(chatId);
            break;
        default:
            // Fallback to main
            console.log(`[NAV LOG] Unknown previous menu ${lastMenu}, fallback to main for ${telegramId}`);
            backToMainMenu(chatId, telegramId);
    }
}

// Helper function if needed (since chatId == telegramId in 1:1 bot chats)
function getTelegramIdFromChat(chatId) {
    return chatId; // Assuming direct chat
}

// ========== ФУНКЦИИ КУРСОВ ==========

function showCoursesMenu(chatId) {
    let context = global.userMenuContext[chatId] || { path: ['main'], menuFn: 'main' };
    if (context.path[context.path.length - 1] === 'learning') {
        context.path.push('courses');
        context.menuFn = 'courses';
    } else {
        context.path = ['main', 'learning', 'courses'];
        context.menuFn = 'courses';
    }
    global.userMenuContext[chatId] = context;
    console.log(`[NAV LOG] Entering courses menu for user ${chatId}, context: ${JSON.stringify(context)}`);
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
        db.all("SELECT * FROM event_slots WHERE category = ? AND status = 'active' AND current_participants < max_participants ORDER BY date, time", 
               [eventName], (err, slots) => {
            
            if (!slots || slots.length === 0) {
                bot.sendMessage(chatId, 
                    `📅 ${eventName} 🎯\n\n` + 
                    'В этой категории пока нет доступных мероприятий. 😕').catch(console.error);
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
    console.log(`[DEBUG USER VIEW] showAllEventSlots called for chatId ${chatId}`);
    try {
        db.all("SELECT * FROM event_slots WHERE status = 'active' ORDER BY date, time", (err, slots) => {
            console.log(`[DEBUG USER VIEW] DB query completed, slots count: ${slots ? slots.length : 0}, error: ${err ? 'Yes' : 'No'}`);
            if (!slots || slots.length === 0) {
                bot.sendMessage(chatId,
                    '📅 РАСПИСАНИЕ ВСЕХ МЕРОПРИЯТИЙ 🗓️\n\n' +
                    '⏰ Пока что занятий нет, но уже в процессе их размещения! 🔄\n\n' +
                    '👨‍💼 Администраторы работают над расписанием!\n' +
                    '🔔 Следи за обновлениями!\n' +
                    '💫 Скоро будет много интересного!').catch((sendErr) => console.error('Send empty message error:', sendErr));
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
            
            console.log(`[DEBUG USER VIEW] Sending message with ${slots.length} slots`);
            bot.sendMessage(chatId, scheduleText).catch((sendErr) => {
                console.error('❌ User view send error:', sendErr);
            });
            console.log(`[DEBUG USER VIEW] Message sent successfully`);
        });
    } catch (error) {
        console.error('❌ Show all event slots error:', error);
    }
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

function showTasksMenu(chatId, telegramId) {
    try {
        bot.sendMessage(chatId,
            '📋 СИСТЕМА ЗАДАЧ 🎯\n\n' +
            '📝 Управляй задачами и зарабатывай баллы!\n' +
            '🎯 Создавай задачи для коллег\n' +
            '📊 Отслеживай прогресс\n\n' +
            '👇 Выбери действие:', tasksKeyboard).catch(console.error);
    } catch (error) {
        console.error('❌ Show tasks menu error:', error);
    }
}

function startGiftProcess(chatId, telegramId) {
    try {
        db.get("SELECT * FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) return;

            if (user.p_coins < config.GAME.min_gift_amount) {
                bot.sendMessage(chatId,
                    `💸 Недостаточно П-коинов! 😢\n\n` +
                    `💰 У тебя: ${user.p_coins} коинов\n` +
                    `🎯 Минимум для подарка: ${config.GAME.min_gift_amount} коинов\n\n` +
                    '💪 Пройди тесты или курсы!').catch(console.error);
                return;
            }

            // Проверяем лимит подарков за день
            db.get(`SELECT SUM(amount) as total_gifted
                    FROM gifts
                    WHERE sender_id = ?
                    AND date(gift_date) = date('now')`, [user.id], (err, giftStats) => {

                const todayGifted = giftStats?.total_gifted || 0;
                const remaining = config.GAME.max_gift_per_day - todayGifted;

                if (remaining <= 0) {
                    bot.sendMessage(chatId,
                        `🚫 Лимит подарков на сегодня исчерпан! 📅\n\n` +
                        `💰 Подарено сегодня: ${todayGifted} коинов\n` +
                        `🎯 Дневной лимит: ${config.GAME.max_gift_per_day} коинов\n\n` +
                        '⏰ Попробуй завтра!').catch(console.error);
                    return;
                }

                global.userScreenshots[telegramId] = {
                    type: 'gift',
                    step: 'select_user',
                    remaining: remaining,
                    failed_attempts: 0
                };

                // Показываем список пользователей для подарка
                db.all(`SELECT username, full_name, telegram_id
                        FROM users
                        WHERE telegram_id != ?
                        AND is_registered = 1
                        ORDER BY full_name`, [telegramId], (err, users) => {

                    if (!users || users.length === 0) {
                        bot.sendMessage(chatId, '👻 Нет пользователей для подарка!').catch(console.error);
                        return;
                    }

                    let usersList = '🎁 ПОДАРИТЬ П-КОИНЫ 💝\n\n';
                    usersList += `💰 Доступно к подарку: ${remaining} коинов\n`;
                    usersList += `📊 Минимум: ${config.GAME.min_gift_amount} коинов\n\n`;
                    usersList += '👥 Выбери получателя:\n\n';

                    users.forEach((u, index) => {
                        const name = u.full_name || u.username || 'Неизвестный';
                        usersList += `${index + 1}. ${name} (@${u.username})\n`;
                    });

                    usersList += '\n✏️ Напиши номер пользователя:';

                    global.userScreenshots[telegramId].users = users;
                    bot.sendMessage(chatId, usersList).catch(console.error);
                });
            });
        });
    } catch (error) {
        console.error('❌ Start gift process error:', error);
    }
}

function handleGiftProcess(chatId, telegramId, text) {
    // [DEBUG LOG] Gift process entry
    const giftState = global.userScreenshots[telegramId];
    console.log(`[GIFT DEBUG] User ${telegramId} text "${text}" | Step: ${giftState ? giftState.step : 'none'}`);
    
    try {
        const giftData = global.userScreenshots[telegramId];

        if (giftData.step === 'select_user') {
            const userIndex = parseInt(text) - 1;

            if (isNaN(userIndex) || userIndex < 0 || userIndex >= giftData.users.length) {
                // [DEBUG LOG] Invalid user number in gift selection
                console.log(`[GIFT DEBUG] Invalid user index "${text}" for user ${telegramId}, users length: ${giftData.users.length}`);
                bot.sendMessage(chatId, '❌ Неверный номер пользователя! Попробуй еще раз 🔢').catch(console.error);
                return;
            }

            giftData.selectedUser = giftData.users[userIndex];
            giftData.step = 'enter_amount';

            bot.sendMessage(chatId,
                `🎁 Получатель: ${giftData.selectedUser.full_name || giftData.selectedUser.username}\n\n` +
                `💰 Доступно: ${giftData.remaining} коинов\n` +
                `📊 Минимум: ${config.GAME.min_gift_amount} коинов\n\n` +
                '💎 Сколько коинов подарить?\n' +
                '✏️ Напиши число:').catch(console.error);

        } else if (giftData.step === 'enter_amount') {
            const amount = parseInt(text);

            if (isNaN(amount) || amount < config.GAME.min_gift_amount || amount > giftData.remaining) {
                bot.sendMessage(chatId,
                    `❌ Неверная сумма! 💸\n\n` +
                    `📊 Минимум: ${config.GAME.min_gift_amount} коинов\n` +
                    `💰 Максимум: ${giftData.remaining} коинов\n\n` +
                    '🔢 Попробуй еще раз:').catch(console.error);
                return;
            }

            giftData.amount = amount;
            giftData.step = 'enter_message';

            bot.sendMessage(chatId,
                `🎁 Подарок готов! 💝\n\n` +
                `👤 Получатель: ${giftData.selectedUser.full_name || giftData.selectedUser.username}\n` +
                `💰 Сумма: ${amount} П-коинов\n\n` +
                '💌 Добавь сообщение к подарку:\n' +
                '✏️ (или напиши "без сообщения")').catch(console.error);

        } else if (giftData.step === 'enter_message') {
            const message = text === 'без сообщения' ? null : text;
            processGift(chatId, telegramId, giftData, message);
        }
    } catch (error) {
        console.error('❌ Handle gift process error:', error);
    }
}

function processGift(chatId, telegramId, giftData, message) {
    try {
        db.get("SELECT id FROM users WHERE telegram_id = ?", [telegramId], (err, sender) => {
            if (!sender) return;

            db.get("SELECT id FROM users WHERE telegram_id = ?", [giftData.selectedUser.telegram_id], (err, receiver) => {
                if (!receiver) return;

                // Проверяем еще раз баланс отправителя
                db.get("SELECT p_coins FROM users WHERE id = ?", [sender.id], (err, senderData) => {
                    if (!senderData || senderData.p_coins < giftData.amount) {
                        bot.sendMessage(chatId, '❌ Недостаточно средств!').catch(console.error);
                        delete global.userScreenshots[telegramId];
                        return;
                    }

                    // Переводим коины
                    db.run("UPDATE users SET p_coins = p_coins - ? WHERE id = ?", [giftData.amount, sender.id]);
                    db.run("UPDATE users SET p_coins = p_coins + ? WHERE id = ?", [giftData.amount, receiver.id]);

                    // Записываем подарок в историю
                    db.run("INSERT INTO gifts (sender_id, receiver_id, amount, message) VALUES (?, ?, ?, ?)",
                           [sender.id, receiver.id, giftData.amount, message], () => {

                        // Уведомляем отправителя
                        bot.sendMessage(chatId,
                            `🎉 ПОДАРОК ОТПРАВЛЕН! 💝\n\n` +
                            `👤 Получатель: ${giftData.selectedUser.full_name || giftData.selectedUser.username}\n` +
                            `💰 Сумма: ${giftData.amount} П-коинов\n` +
                            `💌 Сообщение: ${message || 'без сообщения'}\n\n` +
                            '🎊 Спасибо за щедрость!').catch(console.error);

                        // Уведомляем получателя
                        const senderName = global.userScreenshots[telegramId]?.senderName || 'Коллега';
                        bot.sendMessage(giftData.selectedUser.telegram_id,
                            `🎁 ТЕБЕ ПОДАРОК! 💝\n\n` +
                            `👤 От: ${senderName}\n` +
                            `💰 Сумма: +${giftData.amount} П-коинов\n` +
                            `💌 Сообщение: ${message || 'без сообщения'}\n\n` +
                            '🥳 Поздравляем с подарком!').catch(console.error);

                        delete global.userScreenshots[telegramId];
                    });
                });
            });
        });
    } catch (error) {
        console.error('❌ Process gift error:', error);
    }
}

// ========== ФУНКЦИИ ЗАДАЧ ==========

function showMyTasks(chatId, telegramId) {
    try {
        db.get("SELECT id FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) return;

            db.all(`SELECT t.*,
                    u_creator.full_name as creator_name, u_creator.username as creator_username
                    FROM tasks t
                    LEFT JOIN users u_creator ON t.creator_id = u_creator.id
                    WHERE t.assignee_id = ? AND t.status = 'pending'
                    ORDER BY t.due_date ASC, t.priority DESC`, [user.id], (err, tasks) => {

                if (!tasks || tasks.length === 0) {
                    bot.sendMessage(chatId,
                        '📝 МОИ ЗАДАЧИ 🎯\n\n' +
                        '✅ Все задачи выполнены! 🎉\n\n' +
                        '🚀 Отличная работа! Можешь отдохнуть или взять новые задачи!').catch(console.error);
                    return;
                }

                let tasksText = '📝 МОИ АКТИВНЫЕ ЗАДАЧИ 🎯\n\n';

                tasks.forEach((task, index) => {
                    const priority = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
                    const creatorName = task.creator_name || task.creator_username || 'Система';
                    const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('ru-RU') : 'без срока';

                    tasksText += `${index + 1}. ${priority} ${task.title}\n`;
                    tasksText += `   📝 ${task.description || 'Описание отсутствует'}\n`;
                    tasksText += `   👤 От: ${creatorName}\n`;
                    tasksText += `   📅 Срок: ${dueDate}\n`;
                    if (task.reward_coins > 0) {
                        tasksText += `   💰 Награда: ${task.reward_coins} П-коинов\n`;
                    }
                    tasksText += '\n';
                });

                tasksText += '✅ Для завершения задачи напиши:\n';
                tasksText += '"выполнил [номер]"\n';
                tasksText += '💡 Например: "выполнил 1"';

                bot.sendMessage(chatId, tasksText).catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Show my tasks error:', error);
    }
}

function showCompletedTasks(chatId, telegramId) {
    try {
        db.get("SELECT id FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) return;

            db.all(`SELECT t.*,
                    u_creator.full_name as creator_name, u_creator.username as creator_username
                    FROM tasks t
                    LEFT JOIN users u_creator ON t.creator_id = u_creator.id
                    WHERE t.assignee_id = ? AND t.status = 'completed'
                    ORDER BY t.completed_date DESC
                    LIMIT 10`, [user.id], (err, tasks) => {

                if (!tasks || tasks.length === 0) {
                    bot.sendMessage(chatId,
                        '✅ ЗАВЕРШЕННЫЕ ЗАДАЧИ 🏆\n\n' +
                        '📋 Пока нет завершенных задач\n\n' +
                        '💪 Начни выполнять активные задачи!').catch(console.error);
                    return;
                }

                let tasksText = '✅ ПОСЛЕДНИЕ ЗАВЕРШЕННЫЕ ЗАДАЧИ 🏆\n\n';

                tasks.forEach((task, index) => {
                    const creatorName = task.creator_name || task.creator_username || 'Система';
                    const completedDate = new Date(task.completed_date).toLocaleDateString('ru-RU');

                    tasksText += `${index + 1}. ✅ ${task.title}\n`;
                    tasksText += `   👤 От: ${creatorName}\n`;
                    tasksText += `   📅 Выполнено: ${completedDate}\n`;
                    if (task.reward_coins > 0) {
                        tasksText += `   💰 Получено: ${task.reward_coins} П-коинов\n`;
                    }
                    tasksText += '\n';
                });

                bot.sendMessage(chatId, tasksText).catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Show completed tasks error:', error);
    }
}

function startTaskCreation(chatId, telegramId) {
    try {
        db.get("SELECT * FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) return;

            global.userScreenshots[telegramId] = {
                type: 'task_creation',
                step: 'select_assignee',
                taskData: {
                    creator_id: user.id,
                    priority: 'medium',
                    reward_coins: 0
                },
                failed_attempts: 0
            };

            // Показываем список пользователей для назначения задачи
            db.all(`SELECT username, full_name, telegram_id, id
                    FROM users
                    WHERE telegram_id != ?
                    AND is_registered = 1
                    ORDER BY full_name`, [telegramId], (err, users) => {

                if (!users || users.length === 0) {
                    bot.sendMessage(chatId, '👻 Нет пользователей для назначения задач!').catch(console.error);
                    return;
                }

                let usersList = '🎯 СОЗДАТЬ ЗАДАЧУ 📝\n\n';
                usersList += '👥 Выбери исполнителя:\n\n';

                users.forEach((u, index) => {
                    const name = u.full_name || u.username || 'Неизвестный';
                    usersList += `${index + 1}. ${name} (@${u.username})\n`;
                });

                usersList += '\n✏️ Напиши номер пользователя:';

                global.userScreenshots[telegramId].users = users;
                bot.sendMessage(chatId, usersList).catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Start task creation error:', error);
    }
}

function showTeamTasks(chatId, telegramId) {
    try {
        db.get("SELECT id FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) return;

            db.all(`SELECT t.*,
                    u_creator.full_name as creator_name, u_creator.username as creator_username,
                    u_assignee.full_name as assignee_name, u_assignee.username as assignee_username
                    FROM tasks t
                    LEFT JOIN users u_creator ON t.creator_id = u_creator.id
                    LEFT JOIN users u_assignee ON t.assignee_id = u_assignee.id
                    WHERE t.creator_id = ? OR t.assignee_id = ?
                    ORDER BY t.created_date DESC
                    LIMIT 15`, [user.id, user.id], (err, tasks) => {

                if (!tasks || tasks.length === 0) {
                    bot.sendMessage(chatId,
                        '👥 ЗАДАЧИ КОМАНДЫ 🎯\n\n' +
                        '📋 Пока нет задач в команде\n\n' +
                        '🎯 Создай первую задачу!').catch(console.error);
                    return;
                }

                let tasksText = '👥 ЗАДАЧИ КОМАНДЫ 🎯\n\n';

                tasks.forEach((task, index) => {
                    const creatorName = task.creator_name || task.creator_username || 'Система';
                    const assigneeName = task.assignee_name || task.assignee_username || 'Неизвестный';
                    const status = task.status === 'completed' ? '✅' : '⏳';
                    const priority = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';

                    tasksText += `${index + 1}. ${status} ${priority} ${task.title}\n`;
                    tasksText += `   👤 ${creatorName} → ${assigneeName}\n`;
                    tasksText += `   📅 ${new Date(task.created_date).toLocaleDateString('ru-RU')}\n\n`;
                });

                bot.sendMessage(chatId, tasksText).catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Show team tasks error:', error);
    }
}

function completeTask(chatId, telegramId, taskNumber) {
    try {
        db.get("SELECT id FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) return;

            db.all(`SELECT t.*,
                    u_creator.full_name as creator_name, u_creator.username as creator_username
                    FROM tasks t
                    LEFT JOIN users u_creator ON t.creator_id = u_creator.id
                    WHERE t.assignee_id = ? AND t.status = 'pending'
                    ORDER BY t.due_date ASC, t.priority DESC`, [user.id], (err, tasks) => {

                if (!tasks || tasks.length === 0) {
                    bot.sendMessage(chatId, '📋 У тебя нет активных задач!').catch(console.error);
                    return;
                }

                if (taskNumber < 1 || taskNumber > tasks.length) {
                    bot.sendMessage(chatId,
                        `❌ Неверный номер задачи!\n\n` +
                        `🔢 Доступно задач: 1-${tasks.length}\n` +
                        '💡 Например: "выполнил 1"').catch(console.error);
                    return;
                }

                const task = tasks[taskNumber - 1];

                // Отмечаем задачу как выполненную
                db.run("UPDATE tasks SET status = 'completed', completed_date = CURRENT_TIMESTAMP WHERE id = ?",
                       [task.id], () => {

                    // Начисляем награду если есть
                    if (task.reward_coins > 0) {
                        db.run("UPDATE users SET p_coins = p_coins + ? WHERE id = ?",
                               [task.reward_coins, user.id]);
                    }

                    // Уведомляем исполнителя
                    bot.sendMessage(chatId,
                        `✅ ЗАДАЧА ВЫПОЛНЕНА! 🎉\n\n` +
                        `📝 "${task.title}"\n` +
                        `👤 От: ${task.creator_name || task.creator_username || 'Система'}\n` +
                        (task.reward_coins > 0 ? `💰 Получено: +${task.reward_coins} П-коинов\n` : '') +
                        '\n🏆 Отличная работа!').catch(console.error);

                    // Уведомляем создателя задачи
                    if (task.creator_id && task.creator_id !== user.id) {
                        db.get("SELECT telegram_id, full_name, username FROM users WHERE id = ?",
                               [task.creator_id], (err, creator) => {
                            if (creator) {
                                const executorName = user.full_name || user.username || 'Сотрудник';
                                bot.sendMessage(creator.telegram_id,
                                    `✅ ЗАДАЧА ВЫПОЛНЕНА! 🎉\n\n` +
                                    `📝 "${task.title}"\n` +
                                    `👤 Исполнитель: ${executorName}\n` +
                                    `📅 Выполнено: ${new Date().toLocaleDateString('ru-RU')}\n\n` +
                                    '🎯 Задача завершена успешно!').catch(console.error);
                            }
                        });
                    }
                });
            });
        });
    } catch (error) {
        console.error('❌ Complete task error:', error);
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
            bot.sendMessage(chatId, '❌ Действие отменено!', adminKeyboard).catch(console.error);
            return;
        }

        // Обработка редактирования слота
        if (state.step === 'select_slot_edit') {
            const slotId = parseInt(text);
            const slot = state.slots.find(s => s.id === slotId);

            if (!slot) {
                bot.sendMessage(chatId, '❌ Мероприятие с таким ID не найдено!').catch(console.error);
                return;
            }

            state.selectedSlot = slot;
            state.step = 'edit_field';

            bot.sendMessage(chatId,
                `✏️ РЕДАКТИРОВАНИЕ: ${slot.event_name}\n\n` +
                `📅 Дата: ${slot.date}\n` +
                `⏰ Время: ${slot.time}\n` +
                `📍 Место: ${slot.location}\n` +
                `👥 Участников: ${slot.max_participants}\n` +
                `💰 Награда: ${slot.points_reward}\n` +
                `📊 Статус: ${slot.status}\n\n` +
                'Что изменить?\n' +
                '1. Дату\n' +
                '2. Время\n' +
                '3. Место\n' +
                '4. Количество участников\n' +
                '5. Награду\n' +
                '6. Статус (активен/неактивен)\n\n' +
                '🔢 Напиши номер:').catch(console.error);
            return;
        }

        // Обработка удаления слота
        if (state.step === 'select_slot_delete') {
            const slotId = parseInt(text);
            const slot = state.slots.find(s => s.id === slotId);

            if (!slot) {
                bot.sendMessage(chatId, '❌ Мероприятие с таким ID не найдено!').catch(console.error);
                return;
            }

            db.run("DELETE FROM event_slots WHERE id = ?", [slotId], () => {
                bot.sendMessage(chatId,
                    `🗑️ МЕРОПРИЯТИЕ УДАЛЕНО!\n\n` +
                    `❌ "${slot.event_name}" удалено\n` +
                    `📅 ${slot.date} в ${slot.time}\n\n` +
                    '✅ Операция завершена!', adminKeyboard).catch(console.error);

                delete global.adminStates[telegramId];
            });
            return;
        }

        // Обработка изменения полей
        if (state.step === 'edit_field') {
            const fieldNumber = parseInt(text);
            const slot = state.selectedSlot;

            switch (fieldNumber) {
                case 1:
                    state.editField = 'date';
                    state.step = 'edit_value';
                    bot.sendMessage(chatId,
                        '📅 ИЗМЕНИТЬ ДАТУ\n\n' +
                        `Текущая: ${slot.date}\n\n` +
                        'Формат: ДД.ММ.ГГГГ\n' +
                        'Напиши новую дату:').catch(console.error);
                    break;
                case 2:
                    state.editField = 'time';
                    state.step = 'edit_value';
                    bot.sendMessage(chatId,
                        '⏰ ИЗМЕНИТЬ ВРЕМЯ\n\n' +
                        `Текущее: ${slot.time}\n\n` +
                        'Формат: ЧЧ:ММ\n' +
                        'Напиши новое время:').catch(console.error);
                    break;
                case 3:
                    state.editField = 'location';
                    state.step = 'edit_value';
                    bot.sendMessage(chatId,
                        '📍 ИЗМЕНИТЬ МЕСТО\n\n' +
                        `Текущее: ${slot.location}\n\n` +
                        'Напиши новое место:').catch(console.error);
                    break;
                case 4:
                    state.editField = 'max_participants';
                    state.step = 'edit_value';
                    bot.sendMessage(chatId,
                        '👥 ИЗМЕНИТЬ КОЛИЧЕСТВО УЧАСТНИКОВ\n\n' +
                        `Текущее: ${slot.max_participants}\n\n` +
                        'Напиши новое количество:').catch(console.error);
                    break;
                case 5:
                    state.editField = 'points_reward';
                    state.step = 'edit_value';
                    bot.sendMessage(chatId,
                        '💰 ИЗМЕНИТЬ НАГРАДУ\n\n' +
                        `Текущая: ${slot.points_reward} коинов\n\n` +
                        'Напиши новую награду:').catch(console.error);
                    break;
                case 6:
                    const newStatus = slot.status === 'active' ? 'inactive' : 'active';
                    db.run("UPDATE event_slots SET status = ? WHERE id = ?", [newStatus, slot.id], () => {
                        bot.sendMessage(chatId,
                            `📊 СТАТУС ИЗМЕНЕН!\n\n` +
                            `🎯 Мероприятие: ${slot.event_name}\n` +
                            `📊 Новый статус: ${newStatus === 'active' ? 'Активен 🟢' : 'Неактивен 🔴'}\n\n` +
                            '✅ Операция завершена!', adminKeyboard).catch(console.error);

                        delete global.adminStates[telegramId];
                    });
                    break;
                default:
                    bot.sendMessage(chatId, '❌ Неверный номер! Выбери от 1 до 6.').catch(console.error);
            }
            return;
        }

        // Обработка ввода нового значения
        if (state.step === 'edit_value') {
            const slot = state.selectedSlot;
            const field = state.editField;
            let newValue = text;
            let isValid = true;

            // Валидация
            if (field === 'date' && !/^\d{2}\.\d{2}\.\d{4}$/.test(newValue)) {
                bot.sendMessage(chatId, '❌ Неверный формат даты! Используй ДД.ММ.ГГГГ').catch(console.error);
                return;
            }
            if (field === 'time' && !/^\d{2}:\d{2}$/.test(newValue)) {
                bot.sendMessage(chatId, '❌ Неверный формат времени! Используй ЧЧ:ММ').catch(console.error);
                return;
            }
            if ((field === 'max_participants' || field === 'points_reward') && (isNaN(parseInt(newValue)) || parseInt(newValue) < 1)) {
                bot.sendMessage(chatId, '❌ Число должно быть больше 0!').catch(console.error);
                return;
            }

            if (field === 'max_participants' || field === 'points_reward') {
                newValue = parseInt(newValue);
            }

            // Обновляем в базе данных
            db.run(`UPDATE event_slots SET ${field} = ? WHERE id = ?`, [newValue, slot.id], () => {
                const fieldNames = {
                    'date': 'Дата',
                    'time': 'Время',
                    'location': 'Место',
                    'max_participants': 'Количество участников',
                    'points_reward': 'Награда'
                };

                bot.sendMessage(chatId,
                    `✅ ИЗМЕНЕНО!\n\n` +
                    `🎯 Мероприятие: ${slot.event_name}\n` +
                    `📝 ${fieldNames[field]}: ${newValue}\n\n` +
                    '✅ Операция завершена!', adminKeyboard).catch(console.error);

                delete global.adminStates[telegramId];
            });
            return;
        }
        
        switch (state.step) {
            case 'category':
            if (['🏃‍♂️ Зарядка', '🎰 Покер', '🎉 Корпоратив', '📚 Тренинги'].includes(text)) {
                state.eventData.category = text.substring(text.indexOf(' ') + 1).trim();
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

function showAllEventSlotsAdmin(chatId, telegramId) {
    console.log(`[DEBUG ADMIN VIEW] showAllEventSlotsAdmin called for chatId ${chatId}, user ${telegramId}`);
    db.all("SELECT * FROM event_slots ORDER BY date, time", (err, slots) => {
        console.log(`[DEBUG ADMIN VIEW] DB query completed, slots count: ${slots ? slots.length : 0}, error: ${err ? 'Yes' : 'No'}`);
        if (err) {
            console.error('❌ Show all event slots admin DB error:', err);
            bot.sendMessage(chatId, '❌ Ошибка загрузки мероприятий!').catch((sendErr) => console.error('Send error:', sendErr));
            return;
        }
        if (!slots || slots.length === 0) {
            console.log(`[DEBUG ADMIN VIEW] No slots, sending empty message`);
            bot.sendMessage(chatId,
                '📅 ВСЕ МЕРОПРИЯТИЯ 🗓️\n\n' +
                '📋 Мероприятий пока нет!\n\n' +
                '🎯 Создай первое мероприятие через\n' +
                '"🗓️ Создать мероприятие"', adminKeyboard).catch((sendErr) => console.error('Send empty message error:', sendErr));
            return;
        }

        let slotsText = '📅 ВСЕ МЕРОПРИЯТИЯ 🗓️\n\n';

        slots.forEach((slot, index) => {
            const status = slot.status === 'active' ? '🟢' : '🔴';
            slotsText += `${index + 1}. ${status} ${slot.event_name}\n`;
            slotsText += `   📅 ${slot.date} в ${slot.time}\n`;
            slotsText += `   📍 ${slot.location}\n`;
            slotsText += `   👥 ${slot.current_participants}/${slot.max_participants}\n`;
            slotsText += `   💰 ${slot.points_reward} коинов\n`;
            slotsText += `   🆔 ID: ${slot.id}\n\n`;
        });

        slotsText += '✏️ Для редактирования используй "Редактировать слот"\n';
        slotsText += '🗑️ Для удаления используй "Удалить слот"';

        console.log(`[DEBUG ADMIN VIEW] Sending message with ${slots.length} slots`);
        bot.sendMessage(chatId, slotsText, adminKeyboard).catch((sendErr) => {
            console.error('❌ Admin view send error:', sendErr);
            bot.sendMessage(chatId, '❌ Ошибка отправки расписания!').catch(console.error);
        });
        console.log(`[DEBUG ADMIN VIEW] Message sent successfully`);
    });
}

function startSlotEdit(chatId, telegramId) {
    try {
        db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
            if (!admin) {
                bot.sendMessage(chatId, '❌ Нет прав администратора!').catch(console.error);
                return;
            }

            global.adminStates[telegramId] = {
                step: 'select_slot_edit',
                eventData: {}
            };

            db.all("SELECT * FROM event_slots ORDER BY date, time", (err, slots) => {
                if (!slots || slots.length === 0) {
                    bot.sendMessage(chatId, '📋 Нет мероприятий для редактирования!').catch(console.error);
                    return;
                }

                let slotsText = '✏️ РЕДАКТИРОВАТЬ МЕРОПРИЯТИЕ\n\n';
                slotsText += 'Выбери мероприятие для редактирования:\n\n';

                slots.forEach((slot, index) => {
                    const status = slot.status === 'active' ? '🟢' : '🔴';
                    slotsText += `${slot.id}. ${status} ${slot.event_name}\n`;
                    slotsText += `   📅 ${slot.date} в ${slot.time}\n\n`;
                });

                slotsText += '🔢 Напиши ID мероприятия:';

                global.adminStates[telegramId].slots = slots;
                bot.sendMessage(chatId, slotsText).catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Start slot edit error:', error);
    }
}

function startSlotDelete(chatId, telegramId) {
    try {
        db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
            if (!admin) {
                bot.sendMessage(chatId, '❌ Нет прав администратора!').catch(console.error);
                return;
            }

            global.adminStates[telegramId] = {
                step: 'select_slot_delete',
                eventData: {}
            };

            db.all("SELECT * FROM event_slots ORDER BY date, time", (err, slots) => {
                if (!slots || slots.length === 0) {
                    bot.sendMessage(chatId, '📋 Нет мероприятий для удаления!').catch(console.error);
                    return;
                }

                let slotsText = '🗑️ УДАЛИТЬ МЕРОПРИЯТИЕ\n\n';
                slotsText += '⚠️ ВНИМАНИЕ: Это действие нельзя отменить!\n\n';
                slotsText += 'Выбери мероприятие для удаления:\n\n';

                slots.forEach((slot, index) => {
                    const status = slot.status === 'active' ? '🟢' : '🔴';
                    slotsText += `${slot.id}. ${status} ${slot.event_name}\n`;
                    slotsText += `   📅 ${slot.date} в ${slot.time}\n`;
                    slotsText += `   👥 ${slot.current_participants} участников\n\n`;
                });

                slotsText += '🔢 Напиши ID мероприятия для удаления:';

                global.adminStates[telegramId].slots = slots;
                bot.sendMessage(chatId, slotsText).catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Start slot delete error:', error);
    }
}

// ========== ФУНКЦИИ РАССЫЛОК ==========

function startBroadcast(chatId, telegramId) {
    try {
        db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
            if (!admin) {
                bot.sendMessage(chatId, '❌ Нет прав администратора!').catch(console.error);
                return;
            }

            bot.sendMessage(chatId,
                '📢 СОЗДАТЬ РАССЫЛКУ 📨\n\n' +
                '👥 Выбери категорию получателей:\n\n' +
                '• Всем пользователям - все зарегистрированные\n' +
                '• Только старичкам - опытные сотрудники\n' +
                '• Только стажерам - новички в команде\n' +
                '• Выборочно - выбрать конкретных людей\n\n' +
                '👇 Выбери категорию:', broadcastKeyboard).catch(console.error);
        });
    } catch (error) {
        console.error('❌ Start broadcast error:', error);
    }
}

function setBroadcastTarget(chatId, telegramId, target) {
    try {
        db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
            if (!admin) {
                bot.sendMessage(chatId, '❌ Нет прав администратора!').catch(console.error);
                return;
            }

            global.userScreenshots[telegramId] = {
                type: 'broadcast',
                target: target,
                step: 'message'
            };

            let targetText = '';
            switch (target) {
                case 'all':
                    targetText = '👥 Всем пользователям';
                    break;
                case 'seniors':
                    targetText = '🧓 Только старичкам';
                    break;
                case 'interns':
                    targetText = '👶 Только стажерам';
                    break;
                case 'selective':
                    targetText = '📊 Выборочно';
                    break;
            }

            if (target === 'selective') {
                // Показываем список пользователей для выбора
                db.all("SELECT username, full_name, telegram_id, role FROM users WHERE is_registered = 1 ORDER BY full_name", (err, users) => {
                    if (!users || users.length === 0) {
                        bot.sendMessage(chatId, '👻 Нет пользователей!').catch(console.error);
                        return;
                    }

                    let usersList = '📊 ВЫБОРОЧНАЯ РАССЫЛКА\n\n';
                    usersList += 'Выбери получателей (через запятую):\n\n';

                    users.forEach((user, index) => {
                        const name = user.full_name || user.username || 'Неизвестный';
                        const role = user.role === 'стажер' ? '👶' : '🧓';
                        usersList += `${index + 1}. ${role} ${name}\n`;
                    });

                    usersList += '\n💡 Например: 1,3,5 или напиши "всем"';

                    global.userScreenshots[telegramId].users = users;
                    global.userScreenshots[telegramId].step = 'select_users';
                    bot.sendMessage(chatId, usersList).catch(console.error);
                });
            } else {
                bot.sendMessage(chatId,
                    `📢 РАССЫЛКА: ${targetText}\n\n` +
                    '📝 Напиши текст сообщения для рассылки:\n\n' +
                    '💡 Можешь использовать эмодзи и форматирование\n' +
                    '⚠️ Сообщение будет отправлено ВСЕМ выбранным пользователям!').catch(console.error);
            }
        });
    } catch (error) {
        console.error('❌ Set broadcast target error:', error);
    }
}

function handleBroadcastMessage(chatId, telegramId, text) {
    try {
        const broadcastData = global.userScreenshots[telegramId];

        if (broadcastData.step === 'select_users') {
            let selectedUsers = [];

            if (text.toLowerCase() === 'всем') {
                selectedUsers = broadcastData.users;
            } else {
                const indices = text.split(',').map(n => parseInt(n.trim()) - 1);
                selectedUsers = indices.filter(i => i >= 0 && i < broadcastData.users.length)
                                      .map(i => broadcastData.users[i]);
            }

            if (selectedUsers.length === 0) {
                bot.sendMessage(chatId, '❌ Неверный выбор пользователей! Попробуй еще раз.').catch(console.error);
                return;
            }

            broadcastData.selectedUsers = selectedUsers;
            broadcastData.step = 'message';

            bot.sendMessage(chatId,
                `📊 ВЫБРАНО ПОЛУЧАТЕЛЕЙ: ${selectedUsers.length}\n\n` +
                selectedUsers.map(u => `• ${u.full_name || u.username}`).join('\n') + '\n\n' +
                '📝 Напиши текст сообщения для рассылки:').catch(console.error);

        } else if (broadcastData.step === 'message') {
            broadcastData.message = text;
            broadcastData.media = []; // Initialize media array
            broadcastData.step = 'media';

            bot.sendMessage(chatId,
                `📝 Текст сообщения сохранен!\n\n` +
                `💬 "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"\n\n` +
                '📸 Теперь отправь фото (одно или несколько) для рассылки.\n' +
                '⚡ Или напиши "готово" чтобы отправить только текст.\n' +
                '💡 Фото будут отправлены как медиа-группа с текстом как подписью к первому фото.').catch(console.error);

        } else if (broadcastData.step === 'media') {
            if (text.toLowerCase() === 'готово' || text === '/done') {
                console.log(`[BROADCAST LOG] Admin ${telegramId} finished media input. Media count: ${broadcastData.media.length}, sending broadcast.`);
                sendBroadcast(chatId, telegramId, broadcastData, broadcastData.message);
            } else {
                bot.sendMessage(chatId, '📸 Ожидаю фото или "готово" для завершения.').catch(console.error);
            }
        }
    } catch (error) {
        console.error('❌ Handle broadcast message error:', error);
    }
}

function sendBroadcast(chatId, telegramId, broadcastData, message) {
    try {
        let query = '';
        let params = [];

        if (broadcastData.target === 'selective') {
            const userIds = broadcastData.selectedUsers.map(u => u.telegram_id);
            query = `SELECT telegram_id, full_name, username FROM users WHERE telegram_id IN (${userIds.map(() => '?').join(',')}) AND is_registered = 1`;
            params = userIds;
        } else {
            switch (broadcastData.target) {
                case 'all':
                    query = 'SELECT telegram_id, full_name, username FROM users WHERE is_registered = 1';
                    break;
                case 'seniors':
                    query = "SELECT telegram_id, full_name, username FROM users WHERE role = 'старичок' AND is_registered = 1";
                    break;
                case 'interns':
                    query = "SELECT telegram_id, full_name, username FROM users WHERE role = 'стажер' AND is_registered = 1";
                    break;
            }
        }

        db.all(query, params, (err, users) => {
            if (!users || users.length === 0) {
                bot.sendMessage(chatId, '👻 Нет получателей для рассылки!').catch(console.error);
                return;
            }

            const media = broadcastData.media || [];
            console.log(`[BROADCAST LOG] Starting broadcast to ${users.length} users. Media count: ${media.length}, text: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);

            let successCount = 0;
            let errorCount = 0;

            users.forEach(user => {
                if (media.length > 0) {
                    // Prepare media group
                    const mediaGroup = media.map((item, index) => ({
                        type: 'photo',
                        media: item.media,
                        caption: index === 0 ? `📢 СООБЩЕНИЕ ОТ АДМИНИСТРАЦИИ\n\n${message}` : undefined
                    }));

                    bot.sendMediaGroup(user.telegram_id, mediaGroup)
                        .then(() => {
                            successCount++;
                            console.log(`[BROADCAST LOG] Media group sent successfully to ${user.telegram_id}`);
                        })
                        .catch((err) => {
                            errorCount++;
                            console.error(`[BROADCAST LOG] Failed to send media group to ${user.telegram_id}:`, err);
                        });
                } else {
                    // Send text only
                    const broadcastMessage = `📢 СООБЩЕНИЕ ОТ АДМИНИСТРАЦИИ\n\n${message}`;
                    bot.sendMessage(user.telegram_id, broadcastMessage)
                        .then(() => {
                            successCount++;
                            console.log(`[BROADCAST LOG] Text message sent successfully to ${user.telegram_id}`);
                        })
                        .catch((err) => {
                            errorCount++;
                            console.error(`[BROADCAST LOG] Failed to send text to ${user.telegram_id}:`, err);
                        });
                }
            });

            // Отчет админу
            setTimeout(() => {
                const mediaInfo = media.length > 0 ? ` + ${media.length} фото` : '';
                bot.sendMessage(chatId,
                    `📢 РАССЫЛКА ЗАВЕРШЕНА! ✅\n\n` +
                    `👥 Всего получателей: ${users.length}\n` +
                    `✅ Доставлено: ${successCount}\n` +
                    `❌ Ошибок: ${errorCount}\n\n` +
                    `📝 Текст: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"${mediaInfo}\n\n` +
                    '🎯 Рассылка выполнена успешно!', adminKeyboard).catch(console.error);

                delete global.userScreenshots[telegramId];
                console.log(`[BROADCAST LOG] Broadcast completed. Success: ${successCount}, Errors: ${errorCount}`);
            }, 3000); // Slightly longer delay for media sends
        });
    } catch (error) {
        console.error('❌ Send broadcast error:', error);
    }
}

function backToAdminMenu(chatId, telegramId) {
    try {
        // Очищаем состояния
        delete global.adminStates[telegramId];
        delete global.userScreenshots[telegramId];

        bot.sendMessage(chatId,
            '🔙 ВОЗВРАТ В АДМИНКУ 👨‍💼\n\n' +
            '🎯 Выбери действие:', adminKeyboard).catch(console.error);
    } catch (error) {
        console.error('❌ Back to admin menu error:', error);
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

function showAdminStats(chatId, telegramId) {
    try {
        db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
            if (!admin) {
                bot.sendMessage(chatId, '❌ Нет прав администратора!').catch(console.error);
                return;
            }

            // Собираем общую статистику
            db.all(`
                SELECT
                    (SELECT COUNT(*) FROM users WHERE is_registered = 1) as total_users,
                    (SELECT COUNT(*) FROM users WHERE role = 'стажер' AND is_registered = 1) as interns,
                    (SELECT COUNT(*) FROM users WHERE role = 'старичок' AND is_registered = 1) as seniors,
                    (SELECT SUM(p_coins) FROM users WHERE is_registered = 1) as total_coins,
                    (SELECT COUNT(*) FROM event_slots) as total_events,
                    (SELECT COUNT(*) FROM event_slots WHERE status = 'active') as active_events,
                    (SELECT COUNT(*) FROM event_bookings) as total_bookings,
                    (SELECT COUNT(*) FROM battles) as total_battles,
                    (SELECT COUNT(*) FROM gifts) as total_gifts,
                    (SELECT SUM(amount) FROM gifts) as total_gifted,
                    (SELECT COUNT(*) FROM tasks) as total_tasks,
                    (SELECT COUNT(*) FROM tasks WHERE status = 'completed') as completed_tasks,
                    (SELECT COUNT(*) FROM test_submissions WHERE status = 'pending') as pending_tests
            `, (err, stats) => {
                if (err) {
                    console.error('Stats error:', err);
                    return;
                }

                const statsText =
                    '📊 АДМИНСКАЯ СТАТИСТИКА 🎯\n\n' +
                    '👥 ПОЛЬЗОВАТЕЛИ:\n' +
                    `   Всего: ${stats[0].total_users}\n` +
                    `   Стажеры: ${stats[0].interns}\n` +
                    `   Старички: ${stats[0].seniors}\n\n` +
                    '💰 ЭКОНОМИКА:\n' +
                    `   Всего П-коинов: ${stats[0].total_coins}\n` +
                    `   Подарков: ${stats[0].total_gifts}\n` +
                    `   Подарено коинов: ${stats[0].total_gifted}\n\n` +
                    '🎯 МЕРОПРИЯТИЯ:\n' +
                    `   Всего слотов: ${stats[0].total_events}\n` +
                    `   Активных: ${stats[0].active_events}\n` +
                    `   Записей: ${stats[0].total_bookings}\n\n` +
                    '⚔️ АКТИВНОСТЬ:\n' +
                    `   PVP битв: ${stats[0].total_battles}\n` +
                    `   Задач создано: ${stats[0].total_tasks}\n` +
                    `   Задач выполнено: ${stats[0].completed_tasks}\n\n` +
                    '📋 ЗАЯВКИ:\n' +
                    `   На проверке: ${stats[0].pending_tests} тестов\n\n` +
                    '📈 Общая активность отличная!';

                bot.sendMessage(chatId, statsText, adminKeyboard).catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Show admin stats error:', error);
    }
}

// ========== CALLBACK ОБРАБОТЧИКИ ==========

bot.on('callback_query', (callbackQuery) => {
    try {
        const data = callbackQuery.data;
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;
        const telegramId = callbackQuery.from.id;
        
        if (data === 'confirm_invoice') {
            console.log(`[INVOICE DEBUG] Confirm invoice callback for user ${telegramId}, state: ${JSON.stringify(global.userScreenshots[telegramId])}`);
            const state = global.userScreenshots[telegramId];
            if (!state || state.type !== 'invoice_creation' || state.step !== 'preview') {
                bot.answerCallbackQuery(callbackQuery.id, {text: '❌ Сессия истекла! Начните заново.'});
                return;
            }
            const data = state.data;
            db.get("SELECT id FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
                if (err || !user) {
                    bot.answerCallbackQuery(callbackQuery.id, {text: '❌ Ошибка!'});
                    return;
                }
                // Get next invoice_number
                db.get("SELECT COALESCE(MAX(invoice_number), 0) + 1 AS next FROM invoices", (err, row) => {
                    if (err) {
                        bot.answerCallbackQuery(callbackQuery.id, {text: '❌ Ошибка БД!'});
                        return;
                    }
                    const invoice_number = row.next;
                    const invoice_date = new Date().toLocaleDateString('ru-RU');
                    const fileName = `INV-${invoice_number}_${new Date().toISOString().split('T')[0]}.pdf`;
                    const filePath = `./invoices/${fileName}`;
                    data.creator_id = user.id;
                    data.invoice_number = invoice_number;
                    data.invoice_date = invoice_date;
                    data.file_path = filePath;
                    // Generate PDF
                    generateInvoicePDF(data, filePath);
                    // Insert to DB
                    db.run(`INSERT INTO invoices (creator_id, company_name, org_address, work_type, start_date, end_date, quantity, amount, description, file_path, invoice_number, invoice_date)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [data.creator_id, data.org_name, data.org_address, data.work_type, data.start_date, data.end_date, data.quantity, data.amount, data.description, data.file_path, data.invoice_number, data.invoice_date], (err) => {
                        if (err) {
                            bot.answerCallbackQuery(callbackQuery.id, {text: '❌ Ошибка сохранения!'});
                            return;
                        }
                        // Send document
                        bot.sendDocument(chatId, filePath, {caption: "✅ Инвойс создан и отправлен! Сохранен в БД."}).catch(console.error);
                        bot.answerCallbackQuery(callbackQuery.id, {text: '✅ Инвойс создан!'});
                        delete global.userScreenshots[telegramId];
                        // Delete preview message
                        bot.deleteMessage(chatId, messageId).catch(console.error);
                    });
                });
            });
        } else if (data === 'cancel_invoice') {
            if (global.userScreenshots[telegramId] && global.userScreenshots[telegramId].type === 'invoice_creation') {
                delete global.userScreenshots[telegramId];
                bot.answerCallbackQuery(callbackQuery.id, {text: '❌ Отменено.'});
                bot.editMessageText("❌ Создание инвойса отменено. Возврат в меню.", {chat_id: chatId, message_id: messageId}).catch(console.error);
                backToMainMenu(chatId, telegramId);
            }
        } else if (data.startsWith('approve_')) {
            const submissionId = data.split('_')[1];
            approveSubmission(chatId, messageId, telegramId, submissionId, callbackQuery.id);
        } else if (data.startsWith('reject_')) {
            const submissionId = data.split('_')[1];
            rejectSubmission(chatId, messageId, telegramId, submissionId, callbackQuery.id);
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

// ========== УЛУЧШЕННЫЕ ФУНКЦИИ ТАСК-ТРЕКЕРА ==========

function handleTaskCreation(chatId, telegramId, text) {
    // [DEBUG LOG] Task creation entry
    const taskState = global.userScreenshots[telegramId];
    console.log(`[TASK DEBUG] User ${telegramId} text "${text}" | Step: ${taskState ? taskState.step : 'none'}`);
    
    try {
        const taskData = global.userScreenshots[telegramId];

        if (taskData.step === 'select_assignee') {
            const userIndex = parseInt(text) - 1;

            if (isNaN(userIndex) || userIndex < 0 || userIndex >= taskData.users.length) {
                // [DEBUG LOG] Invalid assignee in task creation
                console.log(`[TASK DEBUG] Invalid assignee index "${text}" for user ${telegramId}, users length: ${taskData.users.length}`);
                bot.sendMessage(chatId, '❌ Неверный номер пользователя! Попробуй еще раз 🔢').catch(console.error);
                return;
            }

            taskData.taskData.assignee_id = taskData.users[userIndex].id;
            taskData.taskData.assignee_name = taskData.users[userIndex].full_name || taskData.users[userIndex].username;
            taskData.step = 'enter_title';

            bot.sendMessage(chatId,
                `👤 Исполнитель: ${taskData.taskData.assignee_name}\n\n` +
                '📝 Напиши НАЗВАНИЕ задачи:\n' +
                '💡 Например: "Подготовить отчет по продажам"').catch(console.error);

        } else if (taskData.step === 'enter_title') {
            taskData.taskData.title = text;
            taskData.step = 'enter_description';

            bot.sendMessage(chatId,
                `📝 Название: "${text}"\n\n` +
                '📋 Напиши ОПИСАНИЕ задачи:\n' +
                '💡 Детально опиши что нужно сделать\n' +
                '⚡ Или напиши "без описания"').catch(console.error);

        } else if (taskData.step === 'enter_description') {
            taskData.taskData.description = text === 'без описания' ? null : text;
            taskData.step = 'select_priority';

            bot.sendMessage(chatId,
                `📋 Описание: ${taskData.taskData.description || 'Без описания'}\n\n` +
                '🎯 Выбери ПРИОРИТЕТ задачи:', taskPriorityKeyboard).catch(console.error);

        } else if (taskData.step === 'select_reward') {
            taskData.step = 'enter_due_date';

            bot.sendMessage(chatId,
                `💰 Награда: ${taskData.taskData.reward_coins} П-коинов\n\n` +
                '📅 Укажи СРОК выполнения:\n' +
                '💡 Формат: ДД.ММ.ГГГГ (например: 25.12.2024)\n' +
                '⚡ Или напиши "без срока"').catch(console.error);

        } else if (taskData.step === 'enter_due_date') {
            let dueDate = null;
            if (text !== 'без срока') {
                const dateMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
                if (!dateMatch) {
                    bot.sendMessage(chatId, '❌ Неверный формат даты! Используй ДД.ММ.ГГГГ или "без срока"').catch(console.error);
                    return;
                }
                dueDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
            }

            taskData.taskData.due_date = dueDate;

            // Создаем задачу в базе данных
            db.run(`INSERT INTO tasks (creator_id, assignee_id, title, description, priority, reward_coins, due_date)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                   [taskData.taskData.creator_id, taskData.taskData.assignee_id, taskData.taskData.title,
                    taskData.taskData.description, taskData.taskData.priority, taskData.taskData.reward_coins, dueDate], () => {

                // Уведомляем создателя
                bot.sendMessage(chatId,
                    '✅ ЗАДАЧА СОЗДАНА! 🎉\n\n' +
                    `👤 Исполнитель: ${taskData.taskData.assignee_name}\n` +
                    `📝 Название: ${taskData.taskData.title}\n` +
                    `📋 Описание: ${taskData.taskData.description || 'Без описания'}\n` +
                    `🎯 Приоритет: ${taskData.taskData.priority === 'high' ? '🔴 Высокий' : taskData.taskData.priority === 'medium' ? '🟡 Средний' : '🟢 Низкий'}\n` +
                    `💰 Награда: ${taskData.taskData.reward_coins} П-коинов\n` +
                    `📅 Срок: ${text === 'без срока' ? 'Без срока' : text}\n\n` +
                    '🚀 Исполнитель получит уведомление!', mainMenuKeyboard).catch(console.error);

                // Уведомляем исполнителя
                db.get("SELECT telegram_id FROM users WHERE id = ?", [taskData.taskData.assignee_id], (err, assignee) => {
                    if (assignee) {
                        bot.sendMessage(assignee.telegram_id,
                            '🎯 НОВАЯ ЗАДАЧА! 📝\n\n' +
                            `📝 Название: ${taskData.taskData.title}\n` +
                            `📋 Описание: ${taskData.taskData.description || 'Без описания'}\n` +
                            `🎯 Приоритет: ${taskData.taskData.priority === 'high' ? '🔴 Высокий' : taskData.taskData.priority === 'medium' ? '🟡 Средний' : '🟢 Низкий'}\n` +
                            (taskData.taskData.reward_coins > 0 ? `💰 Награда: ${taskData.taskData.reward_coins} П-коинов\n` : '') +
                            `📅 Срок: ${text === 'без срока' ? 'Без срока' : text}\n\n` +
                            '📋 Проверь "Мои задачи" в меню!').catch(console.error);
                    }
                });

                delete global.userScreenshots[telegramId];
            });
        }
    } catch (error) {
        console.error('❌ Handle task creation error:', error);
    }
}

function setTaskPriority(chatId, telegramId, priority) {
    try {
        if (!global.userScreenshots[telegramId] || global.userScreenshots[telegramId].type !== 'task_creation') {
            return;
        }

        const taskData = global.userScreenshots[telegramId];

        switch (priority) {
            case '🔴 Высокий':
                taskData.taskData.priority = 'high';
                break;
            case '🟡 Средний':
                taskData.taskData.priority = 'medium';
                break;
            case '🟢 Низкий':
                taskData.taskData.priority = 'low';
                break;
        }

        taskData.step = 'select_reward';

        bot.sendMessage(chatId,
            `🎯 Приоритет: ${priority}\n\n` +
            '💰 Выбери НАГРАДУ за выполнение:', taskRewardKeyboard).catch(console.error);
    } catch (error) {
        console.error('❌ Set task priority error:', error);
    }
}

function setTaskReward(chatId, telegramId, reward) {
    try {
        if (!global.userScreenshots[telegramId] || global.userScreenshots[telegramId].type !== 'task_creation') {
            return;
        }

        const taskData = global.userScreenshots[telegramId];
        taskData.taskData.reward_coins = parseInt(reward.split(' ')[0]);
        taskData.step = 'enter_due_date';

        bot.sendMessage(chatId,
            `💰 Награда: ${reward}\n\n` +
            '📅 Укажи СРОК выполнения:\n' +
            '💡 Формат: ДД.ММ.ГГГГ (например: 25.12.2024)\n' +
            '⚡ Или напиши "без срока"').catch(console.error);
    } catch (error) {
        console.error('❌ Set task reward error:', error);
    }
}

// ========== НОВЫЕ ФУНКЦИИ ТАСК-ТРЕКЕРА ==========

function showPostponedTasks(chatId, telegramId) {
    try {
        db.get("SELECT id FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) return;

            db.all(`SELECT t.*,
                    u_creator.full_name as creator_name, u_creator.username as creator_username
                    FROM tasks t
                    LEFT JOIN users u_creator ON t.creator_id = u_creator.id
                    WHERE t.assignee_id = ? AND t.status = 'postponed'
                    ORDER BY t.postponed_until ASC`, [user.id], (err, tasks) => {

                if (!tasks || tasks.length === 0) {
                    bot.sendMessage(chatId,
                        '📦 ОТЛОЖЕННЫЕ ЗАДАЧИ 📋\n\n' +
                        '✅ Нет отложенных задач!\n\n' +
                        '🚀 Все задачи в работе!').catch(console.error);
                    return;
                }

                let tasksText = '📦 ОТЛОЖЕННЫЕ ЗАДАЧИ 📋\n\n';

                tasks.forEach((task, index) => {
                    const priority = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
                    const creatorName = task.creator_name || task.creator_username || 'Система';
                    const postponedUntil = task.postponed_until ? new Date(task.postponed_until).toLocaleDateString('ru-RU') : 'не указан';

                    tasksText += `${index + 1}. ${priority} ${task.title}\n`;
                    tasksText += `   📝 ${task.description || 'Описание отсутствует'}\n`;
                    tasksText += `   👤 От: ${creatorName}\n`;
                    tasksText += `   📅 Отложено до: ${postponedUntil}\n`;
                    if (task.reward_coins > 0) {
                        tasksText += `   💰 Награда: ${task.reward_coins} П-коинов\n`;
                    }
                    tasksText += '\n';
                });

                bot.sendMessage(chatId, tasksText).catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Show postponed tasks error:', error);
    }
}

function showCancelledTasks(chatId, telegramId) {
    try {
        db.get("SELECT id FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) return;

            db.all(`SELECT t.*,
                    u_creator.full_name as creator_name, u_creator.username as creator_username
                    FROM tasks t
                    LEFT JOIN users u_creator ON t.creator_id = u_creator.id
                    WHERE (t.assignee_id = ? OR t.creator_id = ?) AND t.status = 'cancelled'
                    ORDER BY t.last_action_date DESC
                    LIMIT 10`, [user.id, user.id], (err, tasks) => {

                if (!tasks || tasks.length === 0) {
                    bot.sendMessage(chatId,
                        '❌ ОТМЕНЕННЫЕ ЗАДАЧИ 📋\n\n' +
                        '✅ Нет отмененных задач!\n\n' +
                        '🚀 Отличная работа!').catch(console.error);
                    return;
                }

                let tasksText = '❌ ОТМЕНЕННЫЕ ЗАДАЧИ 📋\n\n';

                tasks.forEach((task, index) => {
                    const priority = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
                    const creatorName = task.creator_name || task.creator_username || 'Система';
                    const cancelDate = new Date(task.last_action_date).toLocaleDateString('ru-RU');

                    tasksText += `${index + 1}. ${priority} ${task.title}\n`;
                    tasksText += `   📝 ${task.description || 'Описание отсутствует'}\n`;
                    tasksText += `   👤 От: ${creatorName}\n`;
                    tasksText += `   📅 Отменено: ${cancelDate}\n`;
                    if (task.cancelled_reason) {
                        tasksText += `   💬 Причина: ${task.cancelled_reason}\n`;
                    }
                    tasksText += '\n';
                });

                bot.sendMessage(chatId, tasksText).catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Show cancelled tasks error:', error);
    }
}

function acceptTask(chatId, telegramId) {
    bot.sendMessage(chatId,
        '✅ Задача принята к выполнению!\n\n' +
        '🎯 Задача перешла в статус "Выполняется"\n' +
        '💪 Удачи в выполнении!', mainMenuKeyboard).catch(console.error);
}

function startTaskComment(chatId, telegramId) {
    global.userScreenshots[telegramId] = {
        type: 'task_comment',
        step: 'enter_comment'
    };

    bot.sendMessage(chatId,
        '💬 КОММЕНТАРИЙ К ЗАДАЧЕ\n\n' +
        '📝 Напиши свой комментарий к задаче:\n' +
        '💡 Объясни, что не так или что нужно уточнить').catch(console.error);
}

function postponeTask(chatId, telegramId) {
    global.userScreenshots[telegramId] = {
        type: 'task_postpone',
        step: 'enter_date'
    };

    bot.sendMessage(chatId,
        '📦 ОТЛОЖИТЬ ЗАДАЧУ\n\n' +
        '📅 На какую дату отложить задачу?\n' +
        '💡 Формат: ДД.ММ.ГГГГ (например: 25.12.2024)\n' +
        '⚡ Или напиши "на неделю" / "на месяц"').catch(console.error);
}

function cancelTask(chatId, telegramId) {
    global.userScreenshots[telegramId] = {
        type: 'task_cancel',
        step: 'enter_reason'
    };

    bot.sendMessage(chatId,
        '❌ ОТМЕНИТЬ ЗАДАЧУ\n\n' +
        '📝 Укажи причину отмены:\n' +
        '💡 Объясни, почему задачу нельзя выполнить').catch(console.error);
}

function redirectTask(chatId, telegramId) {
    bot.sendMessage(chatId,
        '🔄 Задача отправлена исполнителю для доработки\n\n' +
        '📋 Исполнитель получит уведомление с вашим комментарием', mainMenuKeyboard).catch(console.error);
}

function keepTaskAsIs(chatId, telegramId) {
    bot.sendMessage(chatId,
        '📦 Задача оставлена без изменений\n\n' +
        '✅ Комментарий сохранен в истории задачи', mainMenuKeyboard).catch(console.error);
}

// ========== ФУНКЦИИ УПРАВЛЕНИЯ БАЛАНСОМ ==========

function showBalanceManagement(chatId, telegramId) {
    try {
        db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
            if (!admin) {
                bot.sendMessage(chatId, '❌ Доступ запрещен!').catch(console.error);
                return;
            }

            const balanceKeyboard = {
                reply_markup: {
                    keyboard: [
                        ['➕ Начислить баллы', '➖ Списать баллы'],
                        ['👥 Список пользователей', '📊 Балансы'],
                        ['🔙 Назад в админку']
                    ],
                    resize_keyboard: true
                }
            };

            bot.sendMessage(chatId,
                '💰 УПРАВЛЕНИЕ БАЛАНСОМ 💳\n\n' +
                '➕ Начислить баллы пользователям\n' +
                '➖ Списать баллы за нарушения\n' +
                '👥 Список пользователей\n' +
                '📊 Просмотр всех балансов\n\n' +
                '👇 Выбери действие:', balanceKeyboard).catch(console.error);
        });
    } catch (error) {
        console.error('❌ Show balance management error:', error);
    }
}

// ========== ФУНКЦИЯ ПОХВАСТАТЬСЯ ==========

function startAchievementCreation(chatId, telegramId) {
    global.userScreenshots[telegramId] = {
        type: 'achievement_creation',
        step: 'enter_title'
    };

    bot.sendMessage(chatId,
        '🎉 ПОХВАСТАТЬСЯ ДОСТИЖЕНИЕМ! 🏆\n\n' +
        '📝 Напиши НАЗВАНИЕ своего достижения:\n' +
        '💡 Например: "Закрыл крупную сделку", "Выучил новый навык"\n' +
        '⚡ Или опиши свой успех кратко').catch(console.error);
}

function handleAchievementCreation(chatId, telegramId, text) {
    try {
        const achievementData = global.userScreenshots[telegramId];

        if (achievementData.step === 'enter_title') {
            achievementData.title = text;
            achievementData.step = 'enter_description';

            bot.sendMessage(chatId,
                `🏆 Название: "${text}"\n\n` +
                '📝 Теперь напиши ОПИСАНИЕ достижения:\n' +
                '💡 Расскажи подробнее о своем успехе\n' +
                '⚡ Или напиши "без описания"').catch(console.error);

        } else if (achievementData.step === 'enter_description') {
            achievementData.description = text === 'без описания' ? null : text;
            achievementData.step = 'add_photo';

            bot.sendMessage(chatId,
                `🏆 Название: "${achievementData.title}"\n` +
                `📝 Описание: ${achievementData.description || 'Без описания'}\n\n` +
                '📸 Хочешь добавить фото к достижению?\n' +
                '💡 Загрузи фото или напиши "без фото"', {
                    reply_markup: {
                        keyboard: [
                            ['📸 Загрузить фото', '📋 Без фото'],
                            ['🔙 Назад в меню']
                        ],
                        resize_keyboard: true
                    }
                }).catch(console.error);

        } else if (achievementData.step === 'add_photo') {
            if (text === '📋 Без фото' || text === 'без фото') {
                // Публикуем без фото
                achievementData.photoFileId = null;
                achievementData.step = 'confirm_achievement';

                bot.sendMessage(chatId,
                    '📋 Готово без фото! ✅\n\n' +
                    `🏆 Название: ${achievementData.title}\n` +
                    `📝 Описание: ${achievementData.description || 'Без описания'}\n\n` +
                    '✅ Все готово! Опубликовать достижение?\n' +
                    '📢 Оно будет отправлено всем пользователям!', {
                        reply_markup: {
                            keyboard: [
                                ['✅ Опубликовать', '❌ Отменить'],
                                ['🔙 Назад в меню']
                            ],
                            resize_keyboard: true
                        }
                    }).catch(console.error);
            } else if (text === '📸 Загрузить фото') {
                bot.sendMessage(chatId,
                    '📸 Отправь фото своего достижения! 📷\n\n' +
                    '💡 Просто загрузи картинку в чат').catch(console.error);
            }
        }
    } catch (error) {
        console.error('❌ Handle achievement creation error:', error);
    }
}

function publishAchievement(chatId, telegramId) {
    try {
        const achievementData = global.userScreenshots[telegramId];

        if (!achievementData || achievementData.type !== 'achievement_creation') {
            return;
        }

        // Получаем информацию о пользователе
        db.get("SELECT * FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) {
                bot.sendMessage(chatId, '❌ Ошибка! Пользователь не найден.').catch(console.error);
                return;
            }

            // Сохраняем достижение в базе
            db.run(`INSERT INTO achievements (user_id, title, description, photo_file_id)
                    VALUES (?, ?, ?, ?)`,
                   [user.id, achievementData.title, achievementData.description, achievementData.photoFileId],
                   function(err) {

                if (err) {
                    console.error('❌ Achievement save error:', err);
                    bot.sendMessage(chatId, '❌ Ошибка сохранения достижения!').catch(console.error);
                    return;
                }

                const achievementId = this.lastID;

                // Уведомляем создателя
                bot.sendMessage(chatId,
                    '🎉 Достижение опубликовано! 🏆\n\n' +
                    '📢 Все пользователи получили уведомление\n' +
                    '👍 Ждем лайков и комментариев!', mainMenuKeyboard).catch(console.error);

                // Отправляем всем пользователям
                broadcastAchievement(achievementId, user, achievementData);

                delete global.userScreenshots[telegramId];
            });
        });
    } catch (error) {
        console.error('❌ Publish achievement error:', error);
    }
}

function broadcastAchievement(achievementId, author, achievementData) {
    try {
        // Получаем всех пользователей
        db.all("SELECT telegram_id, full_name, username FROM users WHERE is_registered = 1 AND telegram_id != ?",
               [author.telegram_id], (err, users) => {

            if (err || !users) {
                console.error('❌ Get users for broadcast error:', err);
                return;
            }

            const authorName = author.full_name || author.username || 'Коллега';
            const achievementText = `🎉 ДОСТИЖЕНИЕ КОЛЛЕГИ! 🏆\n\n` +
                                  `👤 ${authorName}\n` +
                                  `🏆 ${achievementData.title}\n` +
                                  (achievementData.description ? `📝 ${achievementData.description}\n\n` : '\n') +
                                  `👍 Поставь лайк: /like_${achievementId}\n` +
                                  `💬 Комментарий: /comment_${achievementId}\n\n` +
                                  '🔥 Поздравим коллегу с успехом!';

            // Отправляем всем пользователям
            users.forEach(user => {
                if (achievementData.photoFileId) {
                    // Отправляем с фото
                    bot.sendPhoto(user.telegram_id, achievementData.photoFileId, {
                        caption: achievementText
                    }).catch(console.error);
                } else {
                    // Отправляем только текст
                    bot.sendMessage(user.telegram_id, achievementText).catch(console.error);
                }
            });

            console.log(`📢 Достижение разослано ${users.length} пользователям`);
        });
    } catch (error) {
        console.error('❌ Broadcast achievement error:', error);
    }
}

function showAchievementsAdmin(chatId, telegramId) {
    try {
        db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
            if (!admin) {
                bot.sendMessage(chatId, '❌ Доступ запрещен!').catch(console.error);
                return;
            }

            db.all(`SELECT a.*, u.full_name, u.username,
                    (SELECT COUNT(*) FROM achievement_likes al WHERE al.achievement_id = a.id) as likes_count,
                    (SELECT COUNT(*) FROM achievement_comments ac WHERE ac.achievement_id = a.id) as comments_count
                    FROM achievements a
                    LEFT JOIN users u ON a.user_id = u.id
                    ORDER BY a.created_date DESC
                    LIMIT 10`, (err, achievements) => {

                if (!achievements || achievements.length === 0) {
                    bot.sendMessage(chatId,
                        '🎉 ДОСТИЖЕНИЯ СОТРУДНИКОВ 🏆\n\n' +
                        '📋 Пока нет достижений\n\n' +
                        '🎯 Ждем первых успехов команды!').catch(console.error);
                    return;
                }

                let achievementsText = '🎉 ПОСЛЕДНИЕ ДОСТИЖЕНИЯ 🏆\n\n';

                achievements.forEach((achievement, index) => {
                    const userName = achievement.full_name || achievement.username || 'Неизвестный';
                    const date = new Date(achievement.created_date).toLocaleDateString('ru-RU');

                    achievementsText += `${index + 1}. ${achievement.title}\n`;
                    achievementsText += `   👤 ${userName}\n`;
                    achievementsText += `   📅 ${date}\n`;
                    achievementsText += `   👍 ${achievement.likes_count} лайков\n`;
                    achievementsText += `   💬 ${achievement.comments_count} комментариев\n\n`;
                });

                bot.sendMessage(chatId, achievementsText, adminKeyboard).catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Show achievements admin error:', error);
    }
}

// ========== ФУНКЦИИ ЛАЙКОВ И КОММЕНТАРИЕВ ==========

function handleLikeAchievement(chatId, telegramId, achievementId) {
    try {
        db.get("SELECT id FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) {
                bot.sendMessage(chatId, '❌ Пользователь не найден!').catch(console.error);
                return;
            }

            // Проверяем, есть ли уже лайк от этого пользователя
            db.get("SELECT id FROM achievement_likes WHERE achievement_id = ? AND user_id = ?",
                   [achievementId, user.id], (err, existingLike) => {

                if (existingLike) {
                    bot.sendMessage(chatId, '👍 Ты уже поставил лайк этому достижению!').catch(console.error);
                    return;
                }

                // Добавляем лайк
                db.run("INSERT INTO achievement_likes (achievement_id, user_id) VALUES (?, ?)",
                       [achievementId, user.id], (err) => {

                    if (err) {
                        console.error('❌ Like achievement error:', err);
                        bot.sendMessage(chatId, '❌ Ошибка при добавлении лайка!').catch(console.error);
                        return;
                    }

                    // Получаем информацию о достижении для уведомления
                    db.get(`SELECT a.*, u.full_name, u.username, u.telegram_id as author_telegram_id
                            FROM achievements a
                            LEFT JOIN users u ON a.user_id = u.id
                            WHERE a.id = ?`, [achievementId], (err, achievement) => {

                        if (achievement && achievement.author_telegram_id !== telegramId) {
                            // Уведомляем автора достижения
                            const likerName = user.full_name || user.username || 'Коллега';
                            bot.sendMessage(achievement.author_telegram_id,
                                `👍 Новый лайк! 🎉\n\n` +
                                `👤 ${likerName} поставил лайк твоему достижению:\n` +
                                `🏆 "${achievement.title}"\n\n` +
                                '🔥 Так держать!').catch(console.error);
                        }
                    });

                    bot.sendMessage(chatId, '👍 Лайк поставлен! 🎉').catch(console.error);
                });
            });
        });
    } catch (error) {
        console.error('❌ Handle like achievement error:', error);
    }
}

function startCommentAchievement(chatId, telegramId, achievementId) {
    try {
        db.get("SELECT * FROM achievements WHERE id = ?", [achievementId], (err, achievement) => {
            if (!achievement) {
                bot.sendMessage(chatId, '❌ Достижение не найдено!').catch(console.error);
                return;
            }

            global.userScreenshots[telegramId] = {
                type: 'achievement_comment',
                achievementId: achievementId,
                step: 'enter_comment'
            };

            bot.sendMessage(chatId,
                `💬 КОММЕНТАРИЙ К ДОСТИЖЕНИЮ\n\n` +
                `🏆 "${achievement.title}"\n\n` +
                '📝 Напиши свой комментарий:').catch(console.error);
        });
    } catch (error) {
        console.error('❌ Start comment achievement error:', error);
    }
}

function handleAchievementComment(chatId, telegramId, text) {
    try {
        const commentData = global.userScreenshots[telegramId];

        db.get("SELECT id FROM users WHERE telegram_id = ?", [telegramId], (err, user) => {
            if (!user) {
                bot.sendMessage(chatId, '❌ Пользователь не найден!').catch(console.error);
                return;
            }

            // Добавляем комментарий
            db.run("INSERT INTO achievement_comments (achievement_id, user_id, comment) VALUES (?, ?, ?)",
                   [commentData.achievementId, user.id, text], (err) => {

                if (err) {
                    console.error('❌ Comment achievement error:', err);
                    bot.sendMessage(chatId, '❌ Ошибка при добавлении комментария!').catch(console.error);
                    return;
                }

                // Получаем информацию о достижении для уведомления
                db.get(`SELECT a.*, u.full_name, u.username, u.telegram_id as author_telegram_id
                        FROM achievements a
                        LEFT JOIN users u ON a.user_id = u.id
                        WHERE a.id = ?`, [commentData.achievementId], (err, achievement) => {

                    if (achievement && achievement.author_telegram_id !== telegramId) {
                        // Уведомляем автора достижения
                        const commenterName = user.full_name || user.username || 'Коллега';
                        bot.sendMessage(achievement.author_telegram_id,
                            `💬 Новый комментарий! 📝\n\n` +
                            `👤 ${commenterName} прокомментировал твое достижение:\n` +
                            `🏆 "${achievement.title}"\n\n` +
                            `💬 "${text}"\n\n` +
                            '🎉 Поздравляем!').catch(console.error);
                    }
                });

                bot.sendMessage(chatId, '💬 Комментарий добавлен! 🎉', mainMenuKeyboard).catch(console.error);
                delete global.userScreenshots[telegramId];
            });
        });
    } catch (error) {
        console.error('❌ Handle achievement comment error:', error);
    }
}

// ========== ФУНКЦИИ УПРАВЛЕНИЯ БАЛАНСОМ ==========

function showBalances(chatId, telegramId) {
    try {
        db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
            if (!admin) {
                bot.sendMessage(chatId, '❌ Нет прав администратора!').catch(console.error);
                return;
            }

            db.all("SELECT username, full_name, p_coins FROM users WHERE is_registered = 1 ORDER BY p_coins DESC",
                   (err, users) => {

                if (!users || users.length === 0) {
                    bot.sendMessage(chatId, '👻 Нет пользователей!').catch(console.error);
                    return;
                }

                let balancesText = '📊 БАЛАНСЫ ПОЛЬЗОВАТЕЛЕЙ 💰\n\n';
                const medals = ['🥇', '🥈', '🥉'];

                users.forEach((user, index) => {
                    const name = user.full_name || user.username || 'Неизвестный';
                    const medal = index < 3 ? medals[index] : `${index + 1}.`;
                    balancesText += `${medal} ${name} - ${user.p_coins} П-коинов\n`;
                });

                balancesText += '\n💰 Общий баланс команды отличный!';

                bot.sendMessage(chatId, balancesText, balanceKeyboard).catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Show balances error:', error);
    }
}

function startAddCoins(chatId, telegramId) {
    try {
        db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
            if (!admin) {
                bot.sendMessage(chatId, '❌ Нет прав администратора!').catch(console.error);
                return;
            }

            db.all("SELECT id, username, full_name, telegram_id FROM users WHERE is_registered = 1 ORDER BY full_name", (err, users) => {
                if (!users || users.length === 0) {
                    bot.sendMessage(chatId, '👻 Нет пользователей для начисления!').catch(console.error);
                    return;
                }

                global.userScreenshots[telegramId] = {
                    type: 'balance_add',
                    step: 'select_user',
                    users: users,
                    failed_attempts: 0
                };

                let usersList = '➕ НАЧИСЛИТЬ БАЛЛЫ 💰\n\n';
                usersList += 'Выбери пользователя:\n\n';

                users.forEach((user, index) => {
                    const name = user.full_name || user.username || 'Неизвестный';
                    usersList += `${index + 1}. ${name} (@${user.username})\n`;
                });

                usersList += '\n🔢 Напиши номер пользователя:';

                bot.sendMessage(chatId, usersList).catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Start add coins error:', error);
    }
}

function startDeductCoins(chatId, telegramId) {
    try {
        db.get("SELECT * FROM admins WHERE telegram_id = ?", [telegramId], (err, admin) => {
            if (!admin) {
                bot.sendMessage(chatId, '❌ Нет прав администратора!').catch(console.error);
                return;
            }

            db.all("SELECT id, username, full_name, telegram_id FROM users WHERE is_registered = 1 ORDER BY full_name", (err, users) => {
                if (!users || users.length === 0) {
                    bot.sendMessage(chatId, '👻 Нет пользователей для списания!').catch(console.error);
                    return;
                }

                global.userScreenshots[telegramId] = {
                    type: 'balance_deduct',
                    step: 'select_user',
                    users: users,
                    failed_attempts: 0
                };

                let usersList = '➖ СПИСАТЬ БАЛЛЫ 💸\n\n';
                usersList += 'Выбери пользователя:\n\n';

                users.forEach((user, index) => {
                    const name = user.full_name || user.username || 'Неизвестный';
                    usersList += `${index + 1}. ${name} (@${user.username})\n`;
                });

                usersList += '\n🔢 Напиши номер пользователя:';

                bot.sendMessage(chatId, usersList).catch(console.error);
            });
        });
    } catch (error) {
        console.error('❌ Start deduct coins error:', error);
    }
}

function handleBalanceAdd(chatId, telegramId, text) {
    // [DEBUG LOG] Balance add entry
    const addState = global.userScreenshots[telegramId];
    console.log(`[BALANCE ADD DEBUG] User ${telegramId} text "${text}" | Step: ${addState ? addState.step : 'none'}`);
    
    try {
        const addData = global.userScreenshots[telegramId];

        if (addData.step === 'select_user') {
            const userIndex = parseInt(text) - 1;

            if (isNaN(userIndex) || userIndex < 0 || userIndex >= addData.users.length) {
                // [DEBUG LOG] Invalid user in balance add
                console.log(`[BALANCE ADD DEBUG] Invalid user index "${text}" for user ${telegramId}, users length: ${addData.users.length}`);
                bot.sendMessage(chatId, '❌ Неверный номер пользователя! Попробуй еще раз 🔢').catch(console.error);
                return;
            }

            addData.selectedUser = addData.users[userIndex];
            addData.step = 'enter_amount';

            bot.sendMessage(chatId,
                `➕ Начислить баллы пользователю: ${addData.selectedUser.full_name || addData.selectedUser.username}\n\n` +
                '💰 Сколько баллов начислить?\n' +
                '🔢 Напиши положительное число:').catch(console.error);

        } else if (addData.step === 'enter_amount') {
            const amount = parseInt(text);

            if (isNaN(amount) || amount <= 0) {
                bot.sendMessage(chatId, '❌ Сумма должна быть положительным числом! 💰').catch(console.error);
                return;
            }

            // Получаем имя админа
            db.get("SELECT full_name, username FROM users WHERE telegram_id = ?", [telegramId], (err, adminUser) => {
                const adminName = adminUser ? (adminUser.full_name || adminUser.username || 'Админ') : 'Админ';

                // Начисляем баллы
                db.run("UPDATE users SET p_coins = p_coins + ? WHERE id = ?", [amount, addData.selectedUser.id], () => {
                    // Уведомляем пользователя
                    bot.sendMessage(addData.selectedUser.telegram_id,
                        `💰 ${adminName} НАЧИСЛИЛ БАЛЛЫ! 🎉\n\n` +
                        `➕ +${amount} П-коинов\n\n` +
                        '🎯 Продолжай в том же духе!').catch(console.error);

                    // Уведомляем админа
                    bot.sendMessage(chatId,
                        `✅ БАЛЛЫ НАЧИСЛЕНЫ! 💰\n\n` +
                        `👤 ${addData.selectedUser.full_name || addData.selectedUser.username}\n` +
                        `➕ +${amount} П-коинов\n\n` +
                        '🎉 Операция завершена!', balanceKeyboard).catch(console.error);

                    delete global.userScreenshots[telegramId];
                });
            });
        }
    } catch (error) {
        console.error('❌ Handle balance add error:', error);
    }
}

function handleBalanceDeduct(chatId, telegramId, text) {
    try {
        const deductData = global.userScreenshots[telegramId];

        if (deductData.step === 'select_user') {
            const userIndex = parseInt(text) - 1;

            if (isNaN(userIndex) || userIndex < 0 || userIndex >= deductData.users.length) {
                deductData.failed_attempts = (deductData.failed_attempts || 0) + 1;
                console.log(`[BALANCE DEDUCT DEBUG] Failed attempt ${deductData.failed_attempts} for user ${telegramId}, text: "${text}"`);
                if (deductData.failed_attempts >= 3) {
                    bot.sendMessage(chatId, '❌ Слишком много неверных попыток! Возвращаемся в меню.').catch(console.error);
                    delete global.userScreenshots[telegramId];
                    backToMainMenu(chatId, telegramId);
                    return;
                }
                bot.sendMessage(chatId, '❌ Неверный номер пользователя! Попробуй еще раз 🔢').catch(console.error);
                return;
            }

            deductData.selectedUser = deductData.users[userIndex];
            deductData.step = 'enter_amount';

            bot.sendMessage(chatId,
                `➖ Списать баллы у пользователя: ${deductData.selectedUser.full_name || deductData.selectedUser.username}\n\n` +
                '💸 Сколько баллов списать?\n' +
                '🔢 Напиши положительное число:').catch(console.error);

        } else if (deductData.step === 'enter_amount') {
            const amount = parseInt(text);

            if (isNaN(amount) || amount <= 0) {
                bot.sendMessage(chatId, '❌ Сумма должна быть положительным числом! 💸').catch(console.error);
                return;
            }

            // Получаем имя админа
            db.get("SELECT full_name, username FROM users WHERE telegram_id = ?", [telegramId], (err, adminUser) => {
                const adminName = adminUser ? (adminUser.full_name || adminUser.username || 'Админ') : 'Админ';

                // Проверяем баланс пользователя
                db.get("SELECT p_coins FROM users WHERE id = ?", [deductData.selectedUser.id], (err, userData) => {
                    if (!userData || userData.p_coins < amount) {
                        bot.sendMessage(chatId, '❌ У пользователя недостаточно баллов! 😔').catch(console.error);
                        return;
                    }

                    // Списываем баллы
                    db.run("UPDATE users SET p_coins = p_coins - ? WHERE id = ?", [amount, deductData.selectedUser.id], () => {
                        // Уведомляем пользователя
                        bot.sendMessage(deductData.selectedUser.telegram_id,
                            `💸 ${adminName} СПИСАЛ БАЛЛЫ 😔\n\n` +
                            `➖ -${amount} П-коинов\n\n` +
                            '💪 Старайся лучше!').catch(console.error);

                        // Уведомляем админа
                        bot.sendMessage(chatId,
                            `✅ БАЛЛЫ СПИСАНЫ! 💸\n\n` +
                            `👤 ${deductData.selectedUser.full_name || deductData.selectedUser.username}\n` +
                            `➖ -${amount} П-коинов\n\n` +
                            '🎯 Операция завершена!', balanceKeyboard).catch(console.error);

                        delete global.userScreenshots[telegramId];
                    });
                });
            });
        }
    } catch (error) {
        console.error('❌ Handle balance deduct error:', error);
    }
}

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

// PDF Generation Function
function generateInvoicePDF(data, filePath) {
    // Simple transliteration function for Cyrillic to Latin
    function transliterate(text) {
        if (!text) return '';
        const map = {
            'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
            'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
            'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
            'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '',
            'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
            'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
            'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
            'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
            'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch', 'Ъ': '',
            'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
        };
        return text.replace(/[а-яёА-ЯЁ]/g, char => map[char] || char);
    }

    const transOrgName = transliterate(data.org_name || 'Company Name');
    const transOrgAddress = transliterate(data.org_address || 'Address Line 1\nAddress Line 2');
    const transDescription = transliterate(data.work_type || 'Advertising services on Partnerkin.com');

    const doc = new PDFDocument({ size: 'A4', margin: 36 }); // 0.5in margins
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const pageWidth = 595; // A4 width in points
    const pageHeight = 842; // A4 height
    const margin = 36;
    const contentWidth = pageWidth - 2 * margin;
    const tableWidth = contentWidth * 0.8; // 80% width
    const tableX = margin + (contentWidth - tableWidth) / 2; // Centered

    // 1. Header Section (~100pt from top margin, so y=36+100=136pt)
    const headerY = margin + 100;
    const detailsY = headerY + 20;

    // Left: Dynamic payer organization details
    doc.font('Helvetica-Bold').fontSize(12).text(transliterate(data.org_name || 'Company'), margin + 20, headerY, { lineGap: 4 });
    doc.font('Helvetica').fontSize(10).text(transliterate(data.org_address || 'Address'), margin + 20, headerY + 20, { lineGap: 3 });

    // Right: Invoice details (x ≈ pageWidth - 100pt = 595-100=495pt, but with margin: margin + contentWidth - 100 ≈ 36 + 523 - 100 = 459pt)
    const rightX = pageWidth - margin - 100;
    const invoiceDate = data.invoice_date || new Date().toLocaleDateString('ru-RU');
    const invoiceNumber = `INV-${data.invoice_number || '001'}`;
    const subject = 'advertising on Partnerkin.com';
    doc.font('Helvetica').fontSize(10).text(`Invoice Date: ${invoiceDate} | Invoice Number: ${invoiceNumber} | Subject: ${subject}`, rightX, detailsY, { align: 'right', lineGap: 0 });

    // 2. Invoice Table (~200-300pt below header: headerY=136 + 250 ≈ 386pt, but specs y=300 absolute? Use y=300 for table start)
    const tableY = 236; // Retained positioning to avoid overlaps with headers
    const rowHeight = 30; // With 10pt padding top/bottom
    const colWidth = tableWidth / 3; // Equal widths for balanced 3-column layout: Description, Quantity, Amount

    // Headers - vertically centered in cell (cell top at tableY + 10, height rowHeight=30, text at midpoint)
    // Updated: Removed "Description" column; added "Quantity" in its place
    const cellMidpoint = 15; // (rowHeight / 2)
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Description', tableX, tableY + 10 + cellMidpoint, { align: 'center', width: colWidth }); // First column: service description (work_type)
    doc.text('Quantity', tableX + colWidth, tableY + 10 + cellMidpoint, { align: 'center', width: colWidth }); // New: Quantity column
    doc.text('Amount', tableX + 2 * colWidth, tableY + 10 + cellMidpoint, { align: 'center', width: colWidth }); // Retained: Amount (formatted to 1 decimal)

    // Data row - single row for this invoice (no multi-item loop needed)
    // Updated: Description shows work_type; Quantity from data.quantity (integer); Amount uses toFixed(1) for precision (e.g., 100.0)
    // Removed org_info from table (already in header); no Description column content
    doc.font('Helvetica').fontSize(10);
    const transWorkType = transliterate(data.work_type || 'Advertising services'); // Description: service type
    const quantityStr = data.quantity ? data.quantity.toString() : '1'; // Quantity: integer from data
    const amountStr = `${(data.total || 0).toFixed(1)} USDT`; // Amount: formatted to 1 decimal place
    doc.text(transWorkType, tableX, tableY + 10 + rowHeight + cellMidpoint, { align: 'center', width: colWidth });
    doc.text(quantityStr, tableX + colWidth, tableY + 10 + rowHeight + cellMidpoint, { align: 'center', width: colWidth });
    doc.text(amountStr, tableX + 2 * colWidth, tableY + 10 + rowHeight + cellMidpoint, { align: 'center', width: colWidth });

    // Borders: 1pt solid black, around cells with padding (unchanged structure for 2 rows)
    const borderWidth = 1;
    doc.lineWidth(borderWidth);
    // Outer border
    doc.rect(tableX, tableY + 10, tableWidth, rowHeight * 2).stroke(); // Header + data row height
    // Vertical lines (3 columns: 4 lines)
    let currentX = tableX;
    for (let i = 0; i <= 3; i++) { // 4 lines for 3 columns
        doc.moveTo(currentX, tableY + 10).lineTo(currentX, tableY + 10 + rowHeight * 2).stroke();
        currentX += colWidth;
    }
    // Horizontal lines
    doc.moveTo(tableX, tableY + 10).lineTo(tableX + tableWidth, tableY + 10).stroke(); // Top
    doc.moveTo(tableX, tableY + 10 + rowHeight).lineTo(tableX + tableWidth, tableY + 10 + rowHeight).stroke(); // Between header/data
    doc.moveTo(tableX, tableY + 10 + rowHeight * 2).lineTo(tableX + tableWidth, tableY + 10 + rowHeight * 2).stroke(); // Bottom

    // 3. Total Payment Line (fixed at 380pt)
    // Updated: Total formatted to 1 decimal place for consistency with Amount column
    const totalY = 380;
    doc.font('Helvetica-Bold').fontSize(12).text('Total Payment ', tableX, totalY);
    // Dashed line spanning most width
    doc.dash(5, { space: 5 }).moveTo(tableX + 100, totalY + 5).lineTo(tableX + tableWidth - 50, totalY + 5).undash().stroke();
    doc.text(` ${(data.total || 0).toFixed(1)} USDT`, tableX + tableWidth - 80, totalY, { align: 'right' });

    // Payment details closer to total (fixed at 410pt)
    const paymentY = 410;
    doc.font('Helvetica').fontSize(10).text('USDT TRC-20', margin + 20, paymentY, { lineGap: 3 });
    doc.font('Courier').fontSize(10).text('TWwhE7Sa6CUPN6Lq6NwKDQNrMqFJSNMZPR', margin + 20, paymentY + 15, { lineGap: 3 }); // Monospace for wallet, aligned in footer area

    // Company footer below payment (fixed at 450pt)
    const companyFooterY = 450;
    doc.font('Helvetica-Bold').fontSize(10).text('WARHOLA LTD', margin + 20, companyFooterY, { lineGap: 3 });
    doc.font('Helvetica').fontSize(10).text('27 Old Gloucester Street, London, United Kingdom, WC1N 3AX\nadv@partnerkin.com', margin + 20, companyFooterY + 15, { lineGap: 3 });

    doc.end();

    stream.on('finish', () => {
        console.log(`PDF generated and saved to ${filePath} with even vertical distribution and single-page fit.`);
    });
}