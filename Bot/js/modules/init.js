window.onload = async function() {
    restoreSession();
    loadGlobalSettingsUI();
    toggleExtendedFeatures();
    initHotkeys();
    initTooltips();

    // Глобальное отслеживание Shift для bulk-действий
    document.addEventListener('keydown', (e) => { if (e.key === 'Shift') isShiftPressed = true; });
    document.addEventListener('keyup', (e) => { if (e.key === 'Shift') isShiftPressed = false; });
    window.addEventListener('blur', () => { isShiftPressed = false; }); // Сброс при потере фокуса

    document.addEventListener('click', (e) => {
        if(!e.target.closest('.ai-container')) {
            document.querySelectorAll('.ai-options').forEach(el => el.classList.remove('show'));
        }
    });

    window.onclick = function(e) {
        if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
        if(!e.target.classList.contains('vars-item') && !e.target.classList.contains('form-control')) {
            document.querySelectorAll('.vars-dropdown').forEach(d=>d.style.display='none');
        }
    };
};

function setGlobalTarget(targetType) {
    Object.values(bots).forEach(bot => {
        if(globalMode === 'mail') bot.mailSettings.target = targetType;
        else bot.chatSettings.target = targetType;
        if(activeTabId === bot.id) {
            const sel = document.getElementById(`target-select-${bot.id}`);
            if(sel) sel.value = targetType;
        }
    });
    saveSession();
    alert(`Всем анкетам установлен статус: ${targetType.toUpperCase()}`);
}

async function makeApiRequest(bot, method, path, data = null, isRetry = false) {
    let endpoint = `${LADADATE_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
    let config = {
        method: method,
        url: endpoint,
        headers: { 'Content-Type': 'application/json' },
        data: data,
        withCredentials: true // Для сохранения и отправки cookies (нужно для /chat-* эндпоинтов)
    };
    if (bot && bot.token) config.headers.Authorization = `Bearer ${bot.token}`;

    // Определяем прокси для запроса
    let proxyConfig = null;

    // 1. Сначала пробуем прокси по позиции бота (ip:port)
    if (bot && bot.id) {
        const positionProxy = getProxyForBot(bot.id);
        if (positionProxy) {
            proxyConfig = parseSimpleProxy(positionProxy);
            if (proxyConfig) {
                console.log(`🌐 Прокси для ${bot.displayId || bot.id}: ${positionProxy}`);
            }
        }
    }

    // 2. Если нет прокси по позиции, используем общий proxyURL (http://user:pass@ip:port)
    if (!proxyConfig && globalSettings.proxyURL) {
        proxyConfig = parseProxyUrl(globalSettings.proxyURL);
    }

    // 3. Применяем прокси если он есть (без прокси тоже работает)
    if (proxyConfig) {
        config.proxy = proxyConfig;
    }

    try {
        return await axios(config);
    } catch (error) {
        if (error.response && error.response.status === 401 && bot && !isRetry) {
            console.log(`[Auto-Relogin] Token expired for ${bot.displayId}. Attempting silent relogin...`);
            try {
                const loginRes = await makeApiRequest(null, 'POST', '/api/auth/login', { Login: bot.login, Password: bot.pass });

                if (loginRes.data.Token) {
                    console.log(`[Auto-Relogin] Success for ${bot.displayId}! Retrying original request...`);
                    bot.token = loginRes.data.Token;
                    return await makeApiRequest(bot, method, path, data, true);
                }
            } catch (loginErr) {
                console.error(`[Auto-Relogin] Failed for ${bot.displayId}`, loginErr);
            }
        }
        throw error;
    }
}
