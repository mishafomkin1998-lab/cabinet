// ============= КОНТЕКСТНОЕ МЕНЮ ТРАНСКРИПЦИИ =============

// Создание контекстного меню при загрузке
function createTranscriptionContextMenu() {
    // Удаляем старое меню если есть
    const existingMenu = document.getElementById('transcription-context-menu');
    if (existingMenu) existingMenu.remove();

    // Создаём новое меню
    const menu = document.createElement('div');
    menu.id = 'transcription-context-menu';
    menu.className = 'transcription-context-menu';

    // Заголовок
    const header = document.createElement('div');
    header.className = 'transcription-context-menu-header';
    header.textContent = 'Вставить переменную';
    menu.appendChild(header);

    // Пункты меню из TRANSCRIPTION_VARIABLES (определены в config.js)
    TRANSCRIPTION_VARIABLES.forEach(v => {
        const item = document.createElement('div');
        item.className = 'transcription-context-menu-item';
        item.innerHTML = `<span class="var-name">${v.name}</span><span class="var-desc">${v.desc}</span>`;
        item.onclick = () => insertTranscriptionVar(v.name);
        menu.appendChild(item);
    });

    document.body.appendChild(menu);

    // Закрытие меню при клике вне него
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target)) {
            menu.classList.remove('show');
        }
    });

    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            menu.classList.remove('show');
        }
    });
}

// Показ контекстного меню
function showTranscriptionContextMenu(e, textarea) {
    e.preventDefault();
    currentContextMenuTextarea = textarea;

    // Если меню ещё не создано - создаём
    let menu = document.getElementById('transcription-context-menu');
    if (!menu) {
        createTranscriptionContextMenu();
        menu = document.getElementById('transcription-context-menu');
    }
    if (!menu) return;

    // Позиционируем меню
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    // Проверяем границы экрана
    menu.classList.add('show');
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = (e.clientX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = (e.clientY - rect.height) + 'px';
    }
}

// Вставка переменной в textarea
function insertTranscriptionVar(varName) {
    const menu = document.getElementById('transcription-context-menu');
    if (menu) menu.classList.remove('show');

    if (!currentContextMenuTextarea) return;

    const textarea = currentContextMenuTextarea;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    // Вставляем переменную в позицию курсора
    textarea.value = text.substring(0, start) + varName + text.substring(end);

    // Устанавливаем курсор после вставленной переменной
    const newPos = start + varName.length;
    textarea.setSelectionRange(newPos, newPos);
    textarea.focus();

    // Триггерим события для автосохранения
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Если есть botId, сохраняем шаблон
    const botIdMatch = textarea.id.match(/msg-(.+)/);
    if (botIdMatch && botIdMatch[1]) {
        autoSaveTemplateText(botIdMatch[1]);
    }
}

// Инициализация контекстного меню для всех textarea сообщений
function initTranscriptionContextMenu() {
    createTranscriptionContextMenu();

    // Добавляем обработчик на document для делегирования событий
    document.addEventListener('contextmenu', (e) => {
        const textarea = e.target.closest('.textarea-msg');
        if (textarea) {
            showTranscriptionContextMenu(e, textarea);
        }
    });

    console.log('✅ Контекстное меню транскрипции инициализировано');
}
