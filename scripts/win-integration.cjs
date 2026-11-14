// Runs the real Windows adapter on a Windows machine (GitHub Actions) and
// writes what happened to <outDir>/integration.json. Not part of the app.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const outDir = path.resolve(process.argv[2] || 'ci-results');
fs.mkdirSync(outDir, { recursive: true });
const w = require(path.resolve(process.argv[3] || 'ci-build/windows.cjs'));

const log = [];
const save = () => fs.writeFileSync(path.join(outDir, 'integration.json'), JSON.stringify(log, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, label) =>
  Promise.race([p, sleep(ms).then(() => { throw new Error(`timed out after ${ms}ms: ${label}`); })]);

async function step(name, fn) {
  const t = Date.now();
  try {
    const result = await fn();
    log.push({ name, ok: true, ms: Date.now() - t, result });
  } catch (e) {
    log.push({ name, ok: false, ms: Date.now() - t, error: String((e && e.stack) || e).slice(0, 1500) });
  }
  save();
  console.log(name, log[log.length - 1].ok ? 'ok' : 'FAILED');
}

const ps = (script) => spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).stdout.trim();
const procs = (match) =>
  ps(`Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${match}*' } | Select-Object -First 5 Name,ProcessId | ConvertTo-Json -Compress`);

(async () => {
  await step('environment', async () => ({
    os: `${os.version()} ${os.release()}`,
    winget: spawnSync('winget.exe', ['--version'], { encoding: 'utf8' }).stdout?.trim() || 'NOT FOUND',
    edge: ['ProgramFiles(x86)', 'ProgramFiles'].map((k) => path.join(process.env[k] || '', 'Microsoft/Edge/Application/msedge.exe')).filter(fs.existsSync),
  }));

  let apps = [];
  await step('startApps', async () => {
    apps = await w.startApps();
    return { count: apps.length, sample: apps.slice(0, 25) };
  });

  await step('raw winget search (fixture)', async () => {
    const r = await w.run('winget.exe', ['search', '--query', 'vlc', '--source', 'winget', '--count', '5', '--accept-source-agreements', '--disable-interactivity']);
    fs.writeFileSync(path.join(outDir, 'winget-search-vlc.txt'), r.out);
    const s = await w.run('winget.exe', ['search', '--query', 'Netflix', '--source', 'msstore', '--count', '5', '--accept-source-agreements', '--disable-interactivity']);
    fs.writeFileSync(path.join(outDir, 'winget-search-netflix-msstore.txt'), s.out + '\n--- stderr ---\n' + s.err);
    const l = await w.run('winget.exe', ['list', '--accept-source-agreements', '--disable-interactivity']);
    fs.writeFileSync(path.join(outDir, 'winget-list.txt'), l.out);
    return { searchCode: r.code, storeCode: s.code, listCode: l.code };
  });

  await step('wingetSearch vlc', async () => (await w.wingetSearch('vlc')).slice(0, 8));
  await step('wingetSearch Netflix msstore', async () => (await w.wingetSearch('Netflix', 'msstore')).slice(0, 8));
  await step('wingetList', async () => { const l = await w.wingetList(); return { count: l.length, sample: l.slice(0, 8) }; });

  await step('launchUrl opens Edge and resolves on close', async () => {
    const data = path.join(os.tmpdir(), 'nd-ci-data');
    let settled = false;
    const p = w.launchUrl('https://example.com', 'ciprofile', data).then(() => (settled = true));
    await sleep(12000);
    const running = procs('ciprofile');
    const settledEarly = settled;
    w.closeActiveSite();
    await withTimeout(p, 20000, 'launchUrl after close');
    return { edgeProcessesWhileOpen: running, resolvedBeforeClose: settledEarly, resolvedAfterClose: settled };
  });

  await step('install 7zip.7zip', async () => {
    const before = await w.startApps();
    await w.install({ source: 'winget', id: '7zip.7zip' });
    const after = await w.startApps();
    const seen = new Set(before.map((a) => a.appId));
    apps = after;
    return { newStartApps: after.filter((a) => !seen.has(a.appId)) };
  });

  await step('launchApp resolves when the window closes', async () => {
    const target = apps.find((a) => /7-zip file manager/i.test(a.name)) || apps.find((a) => /^notepad$/i.test(a.name)) || apps.find((a) => /paint|calculator/i.test(a.name));
    if (!target) throw new Error('no suitable app to launch');
    let settled = false;
    const p = w.launchApp(target.appId).then(() => (settled = true));
    await sleep(12000);
    const settledEarly = settled;
    const fg = ps(`Add-Type 'using System;using System.Runtime.InteropServices;public static class F{[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);}'; $p=0; [void][F]::GetWindowThreadProcessId([F]::GetForegroundWindow(),[ref]$p); (Get-Process -Id $p).ProcessName`);
    spawnSync('taskkill.exe', ['/F', '/IM', '7zFM.exe']);
    spawnSync('taskkill.exe', ['/F', '/IM', 'notepad.exe']);
    spawnSync('taskkill.exe', ['/F', '/IM', 'mspaint.exe']);
    await withTimeout(p, 45000, 'launchApp after kill');
    return { target, foregroundProcessWhileOpen: fg, resolvedBeforeClose: settledEarly, resolvedAfterClose: settled };
  });

  await step('upgrade rejects unknown id', async () => w.upgrade('Not.Installed').then(() => 'UNEXPECTED SUCCESS', (e) => e.message));
  await step('uninstall 7zip.7zip', async () => { await w.uninstall('7zip.7zip'); return 'ok'; });

  save();
  process.exit(0);
})();
