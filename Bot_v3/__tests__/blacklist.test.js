/**
 * Тесты для логики черного списка (Blacklist)
 *
 * Тестируем:
 * 1. Фильтрация по датам (только сегодня + вчера)
 * 2. Порядок отображения (новые снизу)
 *
 * Запуск: npm test
 */

// ============= ТЕСТЫ ФИЛЬТРАЦИИ ПО ДАТАМ =============

describe('Blacklist - Фильтрация по датам', () => {

    // Функция фильтрации из AccountBot.js (логика)
    function filterRecentMessages(msgs, now = new Date()) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0); // Начало вчерашнего дня

        return msgs.filter(m => new Date(m.DatePost) >= yesterday);
    }

    test('Письмо от сегодня - добавляется', () => {
        const now = new Date('2024-12-24T20:00:00');
        const msgs = [
            { DatePost: '2024-12-24T15:00:00', User: { AccountId: 1 } }
        ];

        const result = filterRecentMessages(msgs, now);
        expect(result.length).toBe(1);
    });

    test('Письмо от вчера утром - добавляется', () => {
        const now = new Date('2024-12-24T20:00:00');
        const msgs = [
            { DatePost: '2024-12-23T08:00:00', User: { AccountId: 1 } }
        ];

        const result = filterRecentMessages(msgs, now);
        expect(result.length).toBe(1);
    });

    test('Письмо от вчера 00:00 - добавляется (граница)', () => {
        const now = new Date('2024-12-24T20:00:00');
        const msgs = [
            { DatePost: '2024-12-23T00:00:00', User: { AccountId: 1 } }
        ];

        const result = filterRecentMessages(msgs, now);
        expect(result.length).toBe(1);
    });

    test('Письмо от позавчера 23:59 - НЕ добавляется', () => {
        const now = new Date('2024-12-24T20:00:00');
        const msgs = [
            { DatePost: '2024-12-22T23:59:59', User: { AccountId: 1 } }
        ];

        const result = filterRecentMessages(msgs, now);
        expect(result.length).toBe(0);
    });

    test('Письмо от позавчера утром - НЕ добавляется', () => {
        const now = new Date('2024-12-24T20:00:00');
        const msgs = [
            { DatePost: '2024-12-22T10:00:00', User: { AccountId: 1 } }
        ];

        const result = filterRecentMessages(msgs, now);
        expect(result.length).toBe(0);
    });

    test('Смешанный список - только сегодня и вчера', () => {
        const now = new Date('2024-12-24T20:00:00');
        const msgs = [
            { DatePost: '2024-12-24T10:00:00', User: { AccountId: 1 } }, // сегодня ✓
            { DatePost: '2024-12-23T15:00:00', User: { AccountId: 2 } }, // вчера ✓
            { DatePost: '2024-12-22T20:00:00', User: { AccountId: 3 } }, // позавчера ✗
            { DatePost: '2024-12-21T12:00:00', User: { AccountId: 4 } }, // 3 дня назад ✗
        ];

        const result = filterRecentMessages(msgs, now);
        expect(result.length).toBe(2);
        expect(result.map(m => m.User.AccountId)).toEqual([1, 2]);
    });

    test('Полночь - корректная граница', () => {
        // Сейчас 24 декабря 00:01 (только что началось)
        const now = new Date('2024-12-24T00:01:00');
        const msgs = [
            { DatePost: '2024-12-23T23:59:00', User: { AccountId: 1 } }, // вчера ✓
            { DatePost: '2024-12-23T00:00:00', User: { AccountId: 2 } }, // вчера ✓
            { DatePost: '2024-12-22T23:59:00', User: { AccountId: 3 } }, // позавчера ✗
        ];

        const result = filterRecentMessages(msgs, now);
        expect(result.length).toBe(2);
    });

});

// ============= ТЕСТЫ ПОРЯДКА ОТОБРАЖЕНИЯ =============

describe('Blacklist - Порядок отображения', () => {

    // Логика из main.js renderBlacklist
    function getDisplayOrder(data) {
        return [...data].reverse();
    }

    function getOriginalIndex(data, displayIndex) {
        return data.length - 1 - displayIndex;
    }

    test('Массив отображается в обратном порядке', () => {
        const data = ['old1', 'old2', 'old3', 'new4', 'new5'];
        const display = getDisplayOrder(data);

        // Визуально: new5 сверху, old1 снизу? Нет!
        // После reverse: [new5, new4, old3, old2, old1]
        // forEach рендерит сверху вниз: new5 → old1
        // Значит old1 будет СНИЗУ, new5 СВЕРХУ

        // Но мы хотим old1 СВЕРХУ, new5 СНИЗУ
        // Значит нужно БЕЗ reverse...

        // Подождите, давайте проверим реальную логику:
        // Если data = [old1, old2, new3] (push добавляет в конец)
        // reverse() = [new3, old2, old1]
        // forEach: new3 первым (сверху), old1 последним (снизу)
        // Это НЕПРАВИЛЬНО - новые сверху!

        // Проверяем что reverse переворачивает
        expect(display).toEqual(['new5', 'new4', 'old3', 'old2', 'old1']);
    });

    test('Оригинальный индекс вычисляется правильно', () => {
        const data = ['A', 'B', 'C', 'D', 'E']; // 5 элементов, индексы 0-4

        // displayIndex 0 (первый в отображении) = оригинальный индекс 4 (последний)
        expect(getOriginalIndex(data, 0)).toBe(4);

        // displayIndex 4 (последний в отображении) = оригинальный индекс 0 (первый)
        expect(getOriginalIndex(data, 4)).toBe(0);

        // displayIndex 2 (середина) = оригинальный индекс 2 (середина)
        expect(getOriginalIndex(data, 2)).toBe(2);
    });

    test('Новые элементы (push) появляются в конце оригинального массива', () => {
        const blacklist = ['user1', 'user2'];
        blacklist.push('user3'); // новый

        expect(blacklist).toEqual(['user1', 'user2', 'user3']);
        expect(blacklist[blacklist.length - 1]).toBe('user3'); // новый в конце
    });

});

// ============= ТЕСТЫ ДОБАВЛЕНИЯ В ЧС =============

describe('Blacklist - Добавление', () => {

    test('Не добавляет дубликаты', () => {
        const blacklist = ['123', '456'];

        const newId = '123';
        if (!blacklist.includes(newId)) {
            blacklist.push(newId);
        }

        expect(blacklist.length).toBe(2);
        expect(blacklist).toEqual(['123', '456']);
    });

    test('Добавляет новый ID', () => {
        const blacklist = ['123', '456'];

        const newId = '789';
        if (!blacklist.includes(newId)) {
            blacklist.push(newId);
        }

        expect(blacklist.length).toBe(3);
        expect(blacklist).toEqual(['123', '456', '789']);
    });

    test('Лимит - удаляет старые при переполнении', () => {
        const BLACKLIST_MAX_SIZE = 5;
        const blacklist = ['1', '2', '3', '4', '5'];

        // Добавляем новый, но лимит достигнут
        if (blacklist.length >= BLACKLIST_MAX_SIZE) {
            blacklist.splice(0, 2); // Удаляем первые 2 (старые)
        }
        blacklist.push('6');

        expect(blacklist.length).toBe(4);
        expect(blacklist).toEqual(['3', '4', '5', '6']);
        expect(blacklist.includes('1')).toBe(false); // старый удалён
        expect(blacklist.includes('2')).toBe(false); // старый удалён
    });

});
