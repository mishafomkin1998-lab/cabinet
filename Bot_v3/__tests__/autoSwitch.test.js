/**
 * Тесты для функции getNextActiveStatus (логика Auto)
 *
 * Ожидаемое поведение:
 * - Порядок: payers → inbox → my-favorites → favorites → [первый доступный онлайн]
 * - После favorites переключается на первый доступный онлайн (online → shared-online → online-smart)
 * - С онлайна на онлайн НЕ переключается (остаётся на текущем)
 * - Отключённые статусы пропускаются
 *
 * Запуск: npm test
 */

// Эмуляция globalSettings и globalMode
let globalSettings = {
    disabledStatusesMail: [],
    disabledStatusesChat: []
};
let globalMode = 'mail'; // Тесты для режима Mail

// Хелпер: получить массив отключённых статусов для текущего режима
function getDisabledStatuses() {
    if (globalMode === 'chat') {
        return globalSettings.disabledStatusesChat || [];
    } else {
        return globalSettings.disabledStatusesMail || [];
    }
}

// Копия ИСПРАВЛЕННОЙ функции из init.js
function getNextActiveStatus(currentStatus) {
    const disabledList = getDisabledStatuses();
    const statusOrder = ['payers', 'inbox', 'my-favorites', 'favorites'];
    const onlineStatuses = ['online', 'shared-online', 'online-smart'];
    const currentIdx = statusOrder.indexOf(currentStatus);

    // Если текущий статус - один из онлайнов, остаёмся на нём
    if (onlineStatuses.includes(currentStatus)) {
        return currentStatus;
    }

    // Ищем следующий не отключенный статус
    for (let i = currentIdx + 1; i < statusOrder.length; i++) {
        const nextStatus = statusOrder[i];
        if (!disabledList.includes(nextStatus)) {
            return nextStatus;
        }
    }

    // После favorites переключаемся на первый доступный онлайн
    for (const onlineStatus of onlineStatuses) {
        if (!disabledList.includes(onlineStatus)) {
            return onlineStatus;
        }
    }

    // Fallback: online-smart (всегда доступен)
    return 'online-smart';
}

// ============= ТЕСТЫ =============

describe('getNextActiveStatus - Базовое переключение', () => {

    beforeEach(() => {
        globalSettings.disabledStatusesMail = [];
    });

    test('payers → inbox', () => {
        expect(getNextActiveStatus('payers')).toBe('inbox');
    });

    test('inbox → my-favorites', () => {
        expect(getNextActiveStatus('inbox')).toBe('my-favorites');
    });

    test('my-favorites → favorites', () => {
        expect(getNextActiveStatus('my-favorites')).toBe('favorites');
    });

    test('favorites → online', () => {
        expect(getNextActiveStatus('favorites')).toBe('online');
    });

});

describe('getNextActiveStatus - Пропуск отключённых статусов', () => {

    beforeEach(() => {
        globalSettings.disabledStatusesMail = [];
    });

    test('payers → my-favorites (inbox отключён)', () => {
        globalSettings.disabledStatusesMail = ['inbox'];
        expect(getNextActiveStatus('payers')).toBe('my-favorites');
    });

    test('payers → favorites (inbox и my-favorites отключены)', () => {
        globalSettings.disabledStatusesMail = ['inbox', 'my-favorites'];
        expect(getNextActiveStatus('payers')).toBe('favorites');
    });

    test('payers → online (всё кроме online отключено)', () => {
        globalSettings.disabledStatusesMail = ['inbox', 'my-favorites', 'favorites'];
        expect(getNextActiveStatus('payers')).toBe('online');
    });

});

describe('getNextActiveStatus - Три типа онлайна', () => {

    beforeEach(() => {
        globalSettings.disabledStatusesMail = [];
    });

    test('favorites → online (все онлайны включены)', () => {
        expect(getNextActiveStatus('favorites')).toBe('online');
    });

    test('favorites → shared-online (online отключён)', () => {
        globalSettings.disabledStatusesMail = ['online'];
        expect(getNextActiveStatus('favorites')).toBe('shared-online');
    });

    test('favorites → online-smart (online и shared-online отключены)', () => {
        globalSettings.disabledStatusesMail = ['online', 'shared-online'];
        expect(getNextActiveStatus('favorites')).toBe('online-smart');
    });

    test('favorites → online-smart (все три онлайна отключены - fallback)', () => {
        globalSettings.disabledStatusesMail = ['online', 'shared-online', 'online-smart'];
        expect(getNextActiveStatus('favorites')).toBe('online-smart');
    });

});

describe('getNextActiveStatus - Онлайн остаётся на месте', () => {

    beforeEach(() => {
        globalSettings.disabledStatusesMail = [];
    });

    test('online → остаётся online', () => {
        expect(getNextActiveStatus('online')).toBe('online');
    });

    test('shared-online → остаётся shared-online', () => {
        expect(getNextActiveStatus('shared-online')).toBe('shared-online');
    });

    test('online-smart → остаётся online-smart', () => {
        expect(getNextActiveStatus('online-smart')).toBe('online-smart');
    });

});

describe('getNextActiveStatus - Комплексные сценарии', () => {

    beforeEach(() => {
        globalSettings.disabledStatusesMail = [];
    });

    test('inbox → online (my-favorites и favorites отключены)', () => {
        globalSettings.disabledStatusesMail = ['my-favorites', 'favorites'];
        expect(getNextActiveStatus('inbox')).toBe('online');
    });

    test('inbox → shared-online (my-favorites, favorites, online отключены)', () => {
        globalSettings.disabledStatusesMail = ['my-favorites', 'favorites', 'online'];
        expect(getNextActiveStatus('inbox')).toBe('shared-online');
    });

    test('payers → online-smart (всё кроме online-smart отключено)', () => {
        globalSettings.disabledStatusesMail = ['inbox', 'my-favorites', 'favorites', 'online', 'shared-online'];
        expect(getNextActiveStatus('payers')).toBe('online-smart');
    });

});
