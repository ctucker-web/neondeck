// Drives the packaged NEONDECK.exe on Windows (GitHub Actions) like a user
// with a remote, and records what happens. Not part of the app.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { _electron } = require('playwright');

const outDir = path.resolve(process.argv[2] || 'ci-results');
fs.mkdirSync(outDir, { recursive: true });
const exe = path.resolve('apps/desktop/release/win-unpacked/NEONDECK.exe');
const log = [];
const save = () => fs.writeFileSync(path.join(outDir, 'e2e.json'), JSON.stringify(log, null, 2));
const note = (name, data) => { log.push({ name, data }); save(); console.log(name, JSON.stringify(data).slice(0, 300)); };
const ps = (script) => spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).stdout.trim();
const desktopShot = (file) =>
  ps(`Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $bmp.Save('${path.join(outDir, file).replace(/\\/g, '\\\\')}')`);
const edgeProcs = () => ps(`(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*NEONDECK*' } | Measure-Object).Count`);
const killEdge = () => ps(`Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*NEONDECK*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`);

(async () => {
  const app = await _electron.launch({ executablePath: exe, args: [] });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const ui = () => page.evaluate(() => ({
    busy: document.querySelector('.busy p')?.textContent ?? null,
    toast: document.querySelector('.toast')?.textContent ?? null,
    sheet: [...document.querySelectorAll('.sheet .opt__label')].map((e) => e.textContent),
    focus: (document.activeElement?.textContent || '').trim().slice(0, 60),
  }));
  const winState = () => app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { focused: w.isFocused(), visible: w.isVisible(), minimized: w.isMinimized() }; });
  const press = async (...keys) => { for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(250); } };

  try {
    await page.waitForTimeout(8000);
    note('startup', { title: await page.title(), platform: await page.evaluate(() => window.neondeckBridge?.platform), ui: await ui(), win: await winState() });
    await page.screenshot({ path: path.join(outDir, 'e2e-01-home.png') });
    note('bridge startApps', await page.evaluate(() => window.neondeckBridge.invoke('startApps').then((a) => ({ count: a.length }), (e) => ({ error: e.message }))));
    note('home app tiles', await page.evaluate(() => [...document.querySelectorAll('.shelf[aria-label="Apps"] .card__tilename')].map((e) => e.textContent)));

    // Press OK on the first app tile (a web tile on a fresh install).
    await page.evaluate(() => document.querySelector('.shelf[aria-label="Apps"] .card')?.focus());
    await press('Enter');
    await page.waitForTimeout(12000);
    note('after pressing first app tile', { ui: await ui(), edgeProcesses: edgeProcs(), win: await winState() });
    desktopShot('e2e-02-desktop-site-open.png');
    killEdge();
    await page.waitForTimeout(5000);
    note('after closing the site', { ui: await ui(), edgeProcesses: edgeProcs(), win: await winState() });
    desktopShot('e2e-03-desktop-after-close.png');

    // Bridge calls the Apps screen depends on.
    note('bridge wingetSearch', await page.evaluate(() => window.neondeckBridge.invoke('wingetSearch', 'vlc').then((r) => r.slice(0, 4), (e) => ({ error: e.message }))));
    note('bridge autostart', await page.evaluate(async () => {
      const b = window.neondeckBridge;
      try { await b.invoke('setAutostart', true); const on = await b.invoke('getAutostart'); await b.invoke('setAutostart', false); return { on, offAgain: await b.invoke('getAutostart') }; } catch (e) { return { error: e.message }; }
    }));
    note('autostart registry while on', 'see bridge autostart');
    note('page errors', errors);
    await page.screenshot({ path: path.join(outDir, 'e2e-04-end.png') });
  } catch (e) {
    note('E2E CRASH', String((e && e.stack) || e).slice(0, 1500));
    await page.screenshot({ path: path.join(outDir, 'e2e-crash.png') }).catch(() => {});
  }
  save();
  await app.close().catch(() => {});
  process.exit(0);
})();
