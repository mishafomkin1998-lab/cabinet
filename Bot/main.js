const { app, BrowserWindow } = require('electron');

// === КРИТИЧЕСКИ ВАЖНО: Флаги для поддержания ОНЛАЙНА ===
// Эти настройки запрещают Chromium "усыплять" скрытые вкладки.
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,OnConnect,OutOfBlinkCors');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// =======================================================

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 800, 
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true, 
            backgroundThrottling: false // ВАЖНО
        }
    });

    win.setMenuBarVisibility(false);
    win.loadFile('index.html');
    
    require('events').EventEmitter.defaultMaxListeners = 100;
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});