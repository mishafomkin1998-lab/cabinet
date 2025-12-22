// ==========================================
// ТЕСТОВЫЙ СКРИПТ ДЛЯ ПРОВЕРКИ ЭНДПОИНТОВ БОТА
// ==========================================

const axios = require('axios');

const SERVER_URL = 'http://localhost:3000';

// Цвета для консоли
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

function log(color, message) {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testMessageSent() {
    console.log('\n' + '='.repeat(60));
    log('blue', '📨 ТЕСТ 1: POST /api/message_sent');
    console.log('='.repeat(60));

    try {
        const response = await axios.post(`${SERVER_URL}/api/message_sent`, {
            botId: "bot_test_12345",
            accountDisplayId: "TestProfile001",
            recipientId: "man_98765",
            type: "outgoing",
            length: 185,
            isFirst: false,
            isLast: false,
            convId: "conv_test_001",
            responseTime: "00:05:30",
            status: "success",
            textContent: "Hello! This is a test message from bot.",
            mediaUrl: null,
            fileName: null,
            translatorId: 1,
            errorReason: null
        });

        log('green', '✅ УСПЕХ: ' + JSON.stringify(response.data, null, 2));
    } catch (error) {
        log('red', '❌ ОШИБКА: ' + error.message);
        if (error.response) {
            console.log('Response:', error.response.data);
        }
    }
}

async function testMessageSentFailed() {
    console.log('\n' + '='.repeat(60));
    log('blue', '📨 ТЕСТ 2: POST /api/message_sent (с ошибкой)');
    console.log('='.repeat(60));

    try {
        const response = await axios.post(`${SERVER_URL}/api/message_sent`, {
            botId: "bot_test_12345",
            accountDisplayId: "TestProfile001",
            recipientId: "man_98765",
            type: "chat_msg",
            length: 50,
            isFirst: false,
            isLast: false,
            convId: "conv_test_001",
            responseTime: null,
            status: "failed",
            textContent: "Failed message",
            mediaUrl: null,
            fileName: null,
            translatorId: 1,
            errorReason: "API rate limit exceeded - 429 error"
        });

        log('green', '✅ УСПЕХ: ' + JSON.stringify(response.data, null, 2));
    } catch (error) {
        log('red', '❌ ОШИБКА: ' + error.message);
        if (error.response) {
            console.log('Response:', error.response.data);
        }
    }
}

async function testHeartbeat() {
    console.log('\n' + '='.repeat(60));
    log('blue', '❤️  ТЕСТ 3: POST /api/heartbeat');
    console.log('='.repeat(60));

    try {
        const response = await axios.post(`${SERVER_URL}/api/heartbeat`, {
            botId: "bot_test_12345",
            accountDisplayId: "TestProfile001",
            status: "online",
            timestamp: new Date().toISOString(),
            ip: "127.0.0.1",
            systemInfo: {
                version: "10.0",
                platform: "Win32"
            }
        });

        log('green', '✅ УСПЕХ: ' + JSON.stringify(response.data, null, 2));
    } catch (error) {
        log('red', '❌ ОШИБКА: ' + error.message);
        if (error.response) {
            console.log('Response:', error.response.data);
        }
    }
}

async function testError() {
    console.log('\n' + '='.repeat(60));
    log('blue', '⚠️  ТЕСТ 4: POST /api/error');
    console.log('='.repeat(60));

    try {
        const response = await axios.post(`${SERVER_URL}/api/error`, {
            botId: "bot_test_12345",
            accountDisplayId: "TestProfile001",
            endpoint: "bot_send_message",
            errorType: "mail_send_error",
            message: "Failed to send message due to network timeout",
            rawData: null,
            userId: null
        });

        log('green', '✅ УСПЕХ: ' + JSON.stringify(response.data, null, 2));
    } catch (error) {
        log('red', '❌ ОШИБКА: ' + error.message);
        if (error.response) {
            console.log('Response:', error.response.data);
        }
    }
}

async function testIgnoredProfile() {
    console.log('\n' + '='.repeat(60));
    log('blue', '🚫 ТЕСТ 5: POST /api/message_sent (анкета не найдена)');
    console.log('='.repeat(60));

    try {
        const response = await axios.post(`${SERVER_URL}/api/message_sent`, {
            botId: "bot_test_12345",
            accountDisplayId: "NonExistentProfile999",
            recipientId: "man_98765",
            type: "outgoing",
            length: 100,
            isFirst: true,
            isLast: false,
            convId: "conv_test_002",
            responseTime: null,
            status: "success",
            textContent: "This should be ignored",
            mediaUrl: null,
            fileName: null,
            translatorId: 1,
            errorReason: null
        });

        if (response.data.status === 'ignored') {
            log('green', '✅ УСПЕХ (ожидаемо игнорировано): ' + JSON.stringify(response.data, null, 2));
        } else {
            log('yellow', '⚠️  ВНИМАНИЕ: Анкета должна быть игнорирована, но получен другой ответ: ' + JSON.stringify(response.data, null, 2));
        }
    } catch (error) {
        log('red', '❌ ОШИБКА: ' + error.message);
        if (error.response) {
            console.log('Response:', error.response.data);
        }
    }
}

async function runAllTests() {
    log('yellow', '\n🧪 НАЧИНАЕМ ТЕСТИРОВАНИЕ ЭНДПОИНТОВ БОТА...\n');

    await testMessageSent();
    await testMessageSentFailed();
    await testHeartbeat();
    await testError();
    await testIgnoredProfile();

    console.log('\n' + '='.repeat(60));
    log('green', '✅ ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ!');
    console.log('='.repeat(60) + '\n');
}

// Запуск тестов
runAllTests().catch(error => {
    log('red', '❌ КРИТИЧЕСКАЯ ОШИБКА: ' + error.message);
    process.exit(1);
});
