import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { PLATFORM_METHODS, type PlatformApi } from '@neondeck/core';
import { configStore } from './platform/config';
import * as windows from './platform/windows';

// Keeps the data folder at %APPDATA%\\NEONDECK in development and when installed.
app.setName('NEONDECK');

const RETURN_HOTKEY = 'Control+Shift+Home';
const startFullscreen = process.argv.includes('--fullscreen');
const devUrl = process.env.NEONDECK_DEV_URL;

let win: BrowserWindow | null = null;

function uiEntry(): string {
  const packaged = join(process.resourcesPath, 'tv', 'index.html');
  return existsSync(packaged) ? packaged : join(__dirname, '..', '..', 'tv', 'dist', 'index.html');
}

/** Bring NEONDECK back in front after an app or site closes. */
function reclaimFocus(): void {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  // Windows refuses plain focus requests from background programs; briefly
  // going always-on-top is the supported way to come forward.
  win.setAlwaysOnTop(true);
  win.focus();
  win.setAlwaysOnTop(false);
}

function unsupported(): never {
  throw new Error(`This feature is not available on ${process.platform} yet.`);
}

function createApi(): PlatformApi {
  const config = configStore(join(app.getPath('userData'), 'config'));
  const isWin = process.platform === 'win32';
  const returning = <A extends unknown[]>(fn: (...a: A) => Promise<void>) => async (...a: A) => {
    try {
      await fn(...a);
    } finally {
      reclaimFocus();
    }
  };
  return {
    startApps: () => (isWin ? windows.startApps() : unsupported()),
    wingetList: () => (isWin ? windows.wingetList() : unsupported()),
    wingetSearch: (q, s) => (isWin ? windows.wingetSearch(q, s) : unsupported()),
    install: (pkg) => (isWin ? windows.install(pkg) : unsupported()),
    uninstall: (id) => (isWin ? windows.uninstall(String(id)) : unsupported()),
    upgrade: (id) => (isWin ? windows.upgrade(String(id)) : unsupported()),
    launchApp: returning((appId: string) => (isWin ? windows.launchApp(String(appId)) : unsupported())),
    launchUrl: returning((url: string, profile: string) =>
      isWin ? windows.launchUrl(String(url), String(profile), app.getPath('userData')) : unsupported(),
    ),
    readConfig: (name) => config.read(String(name)),
    writeConfig: (name, data) => config.write(String(name), data),
    getAutostart: async () => app.getLoginItemSettings({ args: ['--fullscreen'] }).openAtLogin,
    setAutostart: async (on) => app.setLoginItemSettings({ openAtLogin: Boolean(on), args: ['--fullscreen'] }),
    quit: async () => app.quit(),
  };
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    fullscreen: startFullscreen,
    backgroundColor: '#05060a',
    autoHideMenuBar: true,
    title: 'NEONDECK',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  // The UI is local. Never navigate the shell window to the web.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win?.setFullScreen(!win.isFullScreen());
  });
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(uiEntry());
  win.on('closed', () => (win = null));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', reclaimFocus);
  void app.whenReady().then(() => {
    const api = createApi();
    ipcMain.handle('nd', async (event, method: keyof PlatformApi, args: unknown[]) => {
      if (event.sender !== win?.webContents) throw new Error('Unknown caller.');
      if (!PLATFORM_METHODS.includes(method)) throw new Error(`Unknown method: ${String(method)}`);
      return (api[method] as (...a: unknown[]) => Promise<unknown>)(...(Array.isArray(args) ? args : []));
    });
    createWindow();
    // From inside any app or site: close the site NEONDECK opened and come back.
    globalShortcut.register(RETURN_HOTKEY, () => {
      windows.closeActiveSite();
      reclaimFocus();
    });
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
