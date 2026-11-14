import { app, BrowserWindow, globalShortcut, ipcMain, net, session, shell } from 'electron';
import { appendFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
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

// ---------- diagnostics log ----------

const logDir = () => join(app.getPath('userData'), 'logs');
const logFile = () => join(logDir(), 'neondeck.log');

function log(line: string): void {
  try {
    appendFileSync(logFile(), `${new Date().toISOString()} ${line}\n`);
  } catch {
    // Logging must never break the app.
  }
}

function startLog(): void {
  try {
    mkdirSync(logDir(), { recursive: true });
    // Start fresh once the file passes 1 MB.
    if (statSync(logFile(), { throwIfNoEntry: false })?.size ?? 0 > 1_000_000) writeFileSync(logFile(), '');
  } catch {
    // Ignore.
  }
  log(`--- NEONDECK ${app.getVersion()} started on ${process.platform} ${process.getSystemVersion()} ---`);
}

/** Addresses may hold account details (Xtream); keep only the host in logs. */
function redact(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  return text.replace(/(https?:\/\/[^/\s"]+)[^\s"]*/g, '$1/…').slice(0, 200);
}

// ---------- downloads for playlists and guide data ----------

const MAX_DOWNLOAD = 150 * 1024 * 1024;

async function fetchText(url: string): Promise<string> {
  const parsed = new URL(String(url));
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Only http and https addresses are allowed.');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90_000);
  try {
    const res = await net.fetch(parsed.toString(), { signal: ctl.signal });
    if (!res.ok) throw new Error(`The server answered ${res.status}.`);
    let body = Buffer.from(await res.arrayBuffer());
    if (body.length > MAX_DOWNLOAD) throw new Error('That file is too large.');
    // Guide files are often gzip-compressed (.xml.gz).
    if (body[0] === 0x1f && body[1] === 0x8b) body = gunzipSync(body, { maxOutputLength: MAX_DOWNLOAD * 4 });
    return body.toString('utf8');
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('The server took too long to answer.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Streams come from other origins and most servers send no cross-origin
 * headers, which would stop the player from reading them. The shell window
 * only ever shows NEONDECK's own local UI, so allow it to read responses.
 */
function allowStreamReads(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, done) => {
    const headers: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(details.responseHeaders ?? {})) {
      if (!k.toLowerCase().startsWith('access-control-')) headers[k] = v;
    }
    headers['Access-Control-Allow-Origin'] = ['*'];
    headers['Access-Control-Allow-Headers'] = ['*'];
    headers['Access-Control-Expose-Headers'] = ['*'];
    if (details.method === 'OPTIONS') done({ responseHeaders: headers, statusLine: 'HTTP/1.1 200 OK' });
    else done({ responseHeaders: headers });
  });
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
    fetchText: (url) => fetchText(String(url)),
    openLogs: async () => void (await shell.openPath(logDir())),
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
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required', // channels start without a click
    },
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
    startLog();
    allowStreamReads();
    const api = createApi();
    ipcMain.handle('nd', async (event, method: keyof PlatformApi, args: unknown[]) => {
      if (event.sender !== win?.webContents) throw new Error('Unknown caller.');
      if (!PLATFORM_METHODS.includes(method)) throw new Error(`Unknown method: ${String(method)}`);
      const list = Array.isArray(args) ? args : [];
      const started = Date.now();
      const quiet = method === 'readConfig' || method === 'writeConfig';
      try {
        const result = await (api[method] as (...a: unknown[]) => Promise<unknown>)(...list);
        if (!quiet) log(`ok   ${method}(${redact(list[0])}) ${Date.now() - started}ms`);
        return result;
      } catch (e) {
        log(`FAIL ${method}(${redact(list[0])}) ${Date.now() - started}ms: ${redact((e as Error).message)}`);
        throw e;
      }
    });
    createWindow();
    win?.webContents.on('render-process-gone', (_e, d) => log(`FAIL renderer gone: ${d.reason}`));
    win?.webContents.on('console-message', (_e, level, message) => {
      if (level >= 3) log(`UI error: ${redact(message)}`);
    });
    // From inside any app or site: close the site NEONDECK opened and come back.
    globalShortcut.register(RETURN_HOTKEY, () => {
      windows.closeActiveSite();
      reclaimFocus();
    });
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
