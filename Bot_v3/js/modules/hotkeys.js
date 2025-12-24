// ============= ГОРЯЧИЕ КЛАВИШИ =============
// Ctrl+Tab / Ctrl+Shift+Tab - переключение вкладок
// Ctrl+F - поиск в логгере
// F5 - обновить активного бота
// Shift+F5 - перелогинить всех ботов

function initHotkeys() {
    document.addEventListener('keydown', function(e) {
        if(!globalSettings.hotkeys) return;
        // Ctrl+Tab - следующая вкладка, Ctrl+Shift+Tab - предыдущая вкладка
        if(e.ctrlKey && e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            switchTabRelative(e.shiftKey ? -1 : 1);
        }
        // Ctrl+F - поиск в логгере
        else if(e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            e.stopPropagation();
            toggleLoggerSearch();
        }
        else if(e.shiftKey && e.key === 'F5') { e.preventDefault(); reloginAllBots(); }
        else if(e.key === 'F5') { e.preventDefault(); if(activeTabId && bots[activeTabId]) bots[activeTabId].doActivity(); }
    }, true); // capture phase для перехвата до браузера

    // Обработка клавиш в поле поиска логгера (правая колонка)
    document.addEventListener('keydown', function(e) {
        const searchInput = document.getElementById('logger-search-input');
        if (document.activeElement !== searchInput) return;

        // Enter - следующий результат
        if (e.key === 'Enter') {
            e.preventDefault();
            navigateLoggerSearch(e.shiftKey ? -1 : 1);
        }
        // Escape - закрыть поиск
        else if (e.key === 'Escape') {
            e.preventDefault();
            closeLoggerSearch();
        }
    });

    // Обработка клавиш в поле поиска лог-модала (Лог действий)
    document.addEventListener('keydown', function(e) {
        const searchInput = document.getElementById('log-modal-search-input');
        if (document.activeElement !== searchInput) return;

        // Enter - следующий результат
        if (e.key === 'Enter') {
            e.preventDefault();
            navigateLogModalSearch(e.shiftKey ? -1 : 1);
        }
        // Escape - очистить поиск
        else if (e.key === 'Escape') {
            e.preventDefault();
            clearLogModalSearch();
        }
    });
}

function switchTabRelative(step) {
    const keys = Object.keys(bots);
    if(keys.length < 2) return;
    const currentIdx = keys.indexOf(activeTabId);
    if(currentIdx === -1) return;
    let nextIdx = currentIdx + step;
    if(nextIdx >= keys.length) nextIdx = 0;
    if(nextIdx < 0) nextIdx = keys.length - 1;
    selectTab(keys[nextIdx]);
}
