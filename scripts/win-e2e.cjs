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
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  const ui = () => page.evaluate(() => ({
    busy: document.querySelector('.busy p')?.textContent ?? null,
    toast: document.querySelector('.toast')?.textContent ?? null,
    sheet: [...document.querySelectorAll('.sheet .opt__label')].map((e) => e.textContent),
    focus: (document.activeElement?.textContent || '').trim().slice(0, 60),
  }));
  const winState = () => app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { focused: w.isFocused(), visible: w.isVisible(), minimized: w.isMinimized() }; });
  const press = async (...keys) => { for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(250); } };
  const focusText = (sel, text) => page.evaluate(([s, t]) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t)); el?.focus(); return !!el; }, [sel, text]);
  const video = () => page.evaluate(() => { const v = document.querySelector('video'); return v ? { time: +v.currentTime.toFixed(2), paused: v.paused, width: v.videoWidth, height: v.videoHeight } : null; });
  const tuneInfo = () => page.evaluate(() => ({ name: document.querySelector('.player__name')?.textContent, tune: document.querySelector('.player__tune')?.textContent, error: document.querySelector('.player__error')?.textContent ?? null }));

  try {
    await page.waitForTimeout(8000);
    note('startup', { title: await page.title(), platform: await page.evaluate(() => window.neondeckBridge?.platform), ui: await ui(), win: await winState() });
    note('home shelves', await page.evaluate(() => [...document.querySelectorAll('.shelf')].map((s) => ({ title: s.querySelector('h2').textContent.trim(), cards: [...s.querySelectorAll('.card__title, .card__tilename')].map((e) => e.textContent) }))));
    await page.screenshot({ path: path.join(outDir, 'e2e-01-home.png') });

    // ---- Live TV: play every starter channel, then zap between them ----
    await focusText('.rail__item', 'Live TV'); await press('Enter'); await page.waitForTimeout(1500);
    const names = await page.evaluate(() => [...document.querySelectorAll('.chan__name')].map((e) => e.textContent));
    note('live channel list', names);
    const perChannel = [];
    for (const name of names) {
      await focusText('.chan', name); await press('Enter');
      let info = await tuneInfo();
      for (let i = 0; i < 24 && info.tune === 'TUNING…' && !info.error; i++) { await page.waitForTimeout(500); info = await tuneInfo(); }
      await page.waitForTimeout(2500);
      perChannel.push({ ...info, video: await video() });
    }
    note('live playback per channel', perChannel);
    await page.screenshot({ path: path.join(outDir, 'e2e-05-livetv.png') });

    // Fullscreen zapping between channels that are already known to work.
    await focusText('.chan', names[0]); await press('Enter'); await page.waitForTimeout(4000); await press('Enter'); await page.waitForTimeout(800);
    const zaps = [];
    for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await page.keyboard.press(key);
      let info = await tuneInfo();
      for (let i = 0; i < 30 && (!info.tune || info.tune === 'TUNING…') && !info.error; i++) { await page.waitForTimeout(250); info = await tuneInfo(); }
      zaps.push({ key, ...info });
      await page.waitForTimeout(1500);
    }
    note('fullscreen zapping', { fullscreen: await page.evaluate(() => !!document.querySelector('.player--full')), zaps });
    await page.screenshot({ path: path.join(outDir, 'e2e-06-fullscreen.png') });
    await press('Escape', 'Escape'); await page.waitForTimeout(800);

    // ---- Guide ----
    await focusText('.rail__item', 'Guide'); await press('Enter'); await page.waitForTimeout(1000);
    note('guide', { rows: await page.evaluate(() => document.querySelectorAll('.guide__row').length), focus: (await ui()).focus });
    await press('Escape'); await page.waitForTimeout(600);

    // ---- App tile: press OK on the first app tile on Home ----
    await page.evaluate(() => document.querySelector('.shelf[aria-label="Apps"] .card')?.focus());
    await press('Enter');
    await page.waitForTimeout(12000);
    note('after pressing first app tile', { ui: await ui(), edgeProcesses: edgeProcs(), win: await winState() });
    desktopShot('e2e-02-desktop-site-open.png');
    killEdge();
    await page.waitForTimeout(5000);
    note('after closing the site', { ui: await ui(), edgeProcesses: edgeProcs(), win: await winState() });

    // ---- Apps screen: open a tile's sheet, search the store ----
    await focusText('.rail__item', 'Apps'); await press('Enter'); await page.waitForTimeout(800);
    await focusText('.card--tile', 'Spotify'); await press('Enter'); await page.waitForTimeout(500);
    note('spotify sheet', (await ui()).sheet);
    await press('Escape');
    await focusText('.tab', 'On This PC'); await press('Enter'); await page.waitForTimeout(500);
    note('on this pc tiles', await page.evaluate(() => document.querySelectorAll('.grid .card--tile').length));
    await focusText('.tab', 'Updates'); await press('Enter'); await page.waitForTimeout(6000);
    note('updates rows', await page.evaluate(() => document.querySelectorAll('.rows .opt--row').length));
    await focusText('.tab', 'Store Search'); await press('Enter'); await page.keyboard.type('vlc');
    await page.evaluate(() => document.querySelector('.osk__key--go').focus()); await press('Enter'); await page.waitForTimeout(9000);
    note('store search results', await page.evaluate(() => [...document.querySelectorAll('.rows .opt--row')].slice(0, 5).map((e) => e.textContent)));
    await page.screenshot({ path: path.join(outDir, 'e2e-07-store-search.png') });

    note('bridge autostart', await page.evaluate(async () => {
      const b = window.neondeckBridge;
      try { await b.invoke('setAutostart', true); const on = await b.invoke('getAutostart'); await b.invoke('setAutostart', false); return { on, offAgain: await b.invoke('getAutostart') }; } catch (e) { return { error: e.message }; }
    }));
    note('page errors', errors);
  } catch (e) {
    note('E2E CRASH', String((e && e.stack) || e).slice(0, 1500));
    await page.screenshot({ path: path.join(outDir, 'e2e-crash.png') }).catch(() => {});
    note('page errors', errors);
  }
  // Include the app's own diagnostics log.
  try { fs.copyFileSync(path.join(process.env.APPDATA, 'NEONDECK', 'logs', 'neondeck.log'), path.join(outDir, 'neondeck.log')); } catch (e) { note('log copy failed', String(e)); }
  save();
  await app.close().catch(() => {});
  process.exit(0);
})();
