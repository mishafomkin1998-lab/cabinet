/**
 * Тесты для функций работы с Custom IDs
 *
 * Запуск: npm test
 */

// Копия функции из customIds.js для тестирования
function parseCustomIds(text) {
    if (!text) return [];
    return text.split(/[\s,\n]+/)
        .map(id => id.trim())
        .filter(id => id && /^\d+$/.test(id));
}

// ============= ТЕСТЫ =============

describe('parseCustomIds', () => {

    test('разбивает строку по запятым', () => {
        const result = parseCustomIds('123, 456, 789');
        expect(result).toEqual(['123', '456', '789']);
    });

    test('разбивает строку по пробелам', () => {
        const result = parseCustomIds('123 456 789');
        expect(result).toEqual(['123', '456', '789']);
    });

    test('разбивает строку по переносам', () => {
        const result = parseCustomIds('123\n456\n789');
        expect(result).toEqual(['123', '456', '789']);
    });

    test('работает со смешанными разделителями', () => {
        const result = parseCustomIds('123, 456\n789 101112');
        expect(result).toEqual(['123', '456', '789', '101112']);
    });

    test('игнорирует пустые значения', () => {
        const result = parseCustomIds('123,, 456,  , 789');
        expect(result).toEqual(['123', '456', '789']);
    });

    test('игнорирует нечисловые значения', () => {
        const result = parseCustomIds('123, abc, 456, test123, 789');
        expect(result).toEqual(['123', '456', '789']);
    });

    test('возвращает пустой массив для пустой строки', () => {
        const result = parseCustomIds('');
        expect(result).toEqual([]);
    });

    test('возвращает пустой массив для null', () => {
        const result = parseCustomIds(null);
        expect(result).toEqual([]);
    });

    test('возвращает пустой массив для undefined', () => {
        const result = parseCustomIds(undefined);
        expect(result).toEqual([]);
    });

    test('обрабатывает ID с пробелами вокруг', () => {
        const result = parseCustomIds('  123  ,  456  ');
        expect(result).toEqual(['123', '456']);
    });

});
