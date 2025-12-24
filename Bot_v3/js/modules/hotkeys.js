// ============= ГОРЯЧИЕ КЛАВИШИ =============
// Ctrl+Tab / Ctrl+Shift+Tab - переключение вкладок
// Ctrl+F - поиск по ID вкладок
// F5 - обновить активного бота
// Shift+F5 - перелогинить всех ботов

// Состояние поиска вкладок
let tabSearchState = {
    isOpen: false,
    matches: [],
    currentIndex: 0
};

function initHotkeys() {
    document.addEventListener('keydown', function(e) {
        if(!globalSettings.hotkeys) return;

        // Ctrl+Tab - следующая вкладка, Ctrl+Shift+Tab - предыдущая вкладка
        if(e.ctrlKey && e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            switchTabRelative(e.shiftKey ? -1 : 1);
        }
        // Ctrl+F - поиск по вкладкам
        else if(e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            e.stopPropagation();
            openTabSearch();
        }
        else if(e.shiftKey && e.key === 'F5') { e.preventDefault(); reloginAllBots(); }
        else if(e.key === 'F5') { e.preventDefault(); if(activeTabId && bots[activeTabId]) bots[activeTabId].doActivity(); }
    }, true); // capture phase для перехвата до браузера

    // Обработка клавиш в поле поиска вкладок
    document.addEventListener('keydown', function(e) {
        const searchInput = document.getElementById('tab-search-input');
        if (document.activeElement !== searchInput) return;

        // Escape - закрыть поиск
        if (e.key === 'Escape') {
            e.preventDefault();
            closeTabSearch();
        }
        // Enter - перейти к первому/текущему совпадению
        else if (e.key === 'Enter') {
            e.preventDefault();
            navigateTabSearch(1);
        }
        // Tab - следующее совпадение
        else if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            navigateTabSearch(1);
        }
        // Shift+Tab - предыдущее совпадение
        else if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault();
            navigateTabSearch(-1);
        }
        // Стрелка вниз - следующее совпадение
        else if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigateTabSearch(1);
        }
        // Стрелка вверх - предыдущее совпадение
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigateTabSearch(-1);
        }
    });

    // Клик вне поиска - закрыть
    document.addEventListener('click', function(e) {
        if (!tabSearchState.isOpen) return;
        const searchBox = document.getElementById('tab-search-box');
        if (searchBox && !searchBox.contains(e.target)) {
            closeTabSearch();
        }
    });
}

// Открыть поиск вкладок
function openTabSearch() {
    const searchBox = document.getElementById('tab-search-box');
    const searchInput = document.getElementById('tab-search-input');

    if (!searchBox || !searchInput) return;

    tabSearchState.isOpen = true;
    tabSearchState.matches = [];
    tabSearchState.currentIndex = 0;

    searchBox.classList.add('show');
    searchBox.classList.remove('error', 'success');
    searchInput.value = '';
    searchInput.focus();

    updateTabSearchCount();
}

// Закрыть поиск вкладок
function closeTabSearch() {
    const searchBox = document.getElementById('tab-search-box');
    const searchInput = document.getElementById('tab-search-input');

    if (!searchBox) return;

    tabSearchState.isOpen = false;
    searchBox.classList.remove('show', 'error', 'success');

    if (searchInput) {
        searchInput.value = '';
    }

    // Убираем подсветку со всех вкладок
    clearTabSearchHighlights();
}

// Очистить подсветку вкладок
function clearTabSearchHighlights() {
    document.querySelectorAll('.tab-item.search-match, .tab-item.search-current').forEach(tab => {
        tab.classList.remove('search-match', 'search-current');
    });
    tabSearchState.matches = [];
    tabSearchState.currentIndex = 0;
}

// Поиск вкладок по вводу
function searchTabs(query) {
    const searchBox = document.getElementById('tab-search-box');

    // Очищаем предыдущую подсветку
    clearTabSearchHighlights();

    if (!query || query.trim() === '') {
        searchBox.classList.remove('error', 'success');
        updateTabSearchCount();
        return;
    }

    const searchValue = query.trim();
    const tabs = document.querySelectorAll('.tab-item');
    const matches = [];

    tabs.forEach(tab => {
        const tabId = tab.id.replace('tab-', '');
        const bot = bots[tabId];
        if (!bot) return;

        const displayId = bot.displayId.toString();

        // Проверяем содержит ли ID искомую строку
        if (displayId.includes(searchValue)) {
            matches.push({ tab, tabId, displayId });

            // Точное совпадение
            if (displayId === searchValue) {
                tab.classList.add('search-current');
            } else {
                tab.classList.add('search-match');
            }
        }
    });

    tabSearchState.matches = matches;
    tabSearchState.currentIndex = 0;

    // Обновляем состояние поля
    if (matches.length === 0) {
        searchBox.classList.add('error');
        searchBox.classList.remove('success');
    } else {
        searchBox.classList.remove('error');
        searchBox.classList.add('success');

        // Если точное совпадение - переключаемся
        const exactMatch = matches.find(m => m.displayId === searchValue);
        if (exactMatch) {
            selectTab(exactMatch.tabId);
            // Оставляем подсветку на короткое время и закрываем
            setTimeout(() => {
                closeTabSearch();
            }, 500);
        } else if (matches.length === 1) {
            // Если одно совпадение - делаем его текущим
            matches[0].tab.classList.remove('search-match');
            matches[0].tab.classList.add('search-current');
        }
    }

    updateTabSearchCount();
}

// Навигация по совпадениям
function navigateTabSearch(direction) {
    if (tabSearchState.matches.length === 0) return;

    // Убираем текущую подсветку
    tabSearchState.matches.forEach(m => {
        m.tab.classList.remove('search-current');
        m.tab.classList.add('search-match');
    });

    // Перемещаемся
    tabSearchState.currentIndex += direction;

    // Циклический переход
    if (tabSearchState.currentIndex >= tabSearchState.matches.length) {
        tabSearchState.currentIndex = 0;
    }
    if (tabSearchState.currentIndex < 0) {
        tabSearchState.currentIndex = tabSearchState.matches.length - 1;
    }

    // Подсвечиваем текущий и переключаемся
    const current = tabSearchState.matches[tabSearchState.currentIndex];
    current.tab.classList.remove('search-match');
    current.tab.classList.add('search-current');
    selectTab(current.tabId);

    updateTabSearchCount();
}

// Обновить счётчик
function updateTabSearchCount() {
    const countEl = document.getElementById('tab-search-count');
    if (!countEl) return;

    const matches = tabSearchState.matches;

    if (matches.length === 0) {
        countEl.textContent = '';
        countEl.classList.remove('has-matches');
    } else if (matches.length === 1) {
        countEl.textContent = '1';
        countEl.classList.add('has-matches');
    } else {
        countEl.textContent = `${tabSearchState.currentIndex + 1}/${matches.length}`;
        countEl.classList.add('has-matches');
    }
}

// Инициализация обработчика ввода
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('tab-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            searchTabs(e.target.value);
        });
    }
});

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
