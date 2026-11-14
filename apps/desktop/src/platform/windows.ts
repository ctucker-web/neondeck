// Windows 11 adapter: winget for packages, PowerShell for the Start menu and
// focus tracking, Microsoft Edge app mode for websites.
//
// Every external program is started with an argument array and no shell, and
// every value that came from the UI is validated first, so nothing the
// renderer sends can turn into an arbitrary command.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  isValidPackageRef, normalizeUrl, parseStartApps, parseWingetPackages,
  type PackageRef, type StartApp, type WingetPackage,
} from '@neondeck/core';

interface RunResult {
  code: number;
  out: string;
  err: string;
}

export function run(file: string, args: string[], timeoutMs = 15 * 60_000): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, shell: false });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8').on('data', (d) => (out += d));
    // Kept separate: PowerShell writes progress records to stderr, and mixing
    // them into stdout corrupts the JSON we parse.
    child.stderr.setEncoding('utf8').on('data', (d) => (err += d));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, out, err }); });
  });
}

export function powershell(script: string, timeoutMs?: number): Promise<RunResult> {
  const full = `$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; $ErrorActionPreference='Stop'; ${script}`;
  const encoded = Buffer.from(full, 'utf16le').toString('base64');
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], timeoutMs);
}

const WINGET_COMMON = ['--accept-source-agreements', '--disable-interactivity'];

async function winget(args: string[]): Promise<RunResult> {
  try {
    return await run('winget.exe', [...args, ...WINGET_COMMON]);
  } catch {
    throw new Error('winget was not found. Install "App Installer" from the Microsoft Store, then try again.');
  }
}

function lastLines(out: string, n = 3): string {
  return out.split(/\r?\n/).map((l) => l.slice(l.lastIndexOf('\r') + 1).trim()).filter(Boolean).slice(-n).join(' ');
}

export async function startApps(): Promise<StartApp[]> {
  const { code, out, err } = await powershell('Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress', 60_000);
  if (code !== 0 && !out.trim()) throw new Error(`Could not read the Start menu: ${lastLines(err || 'PowerShell failed')}`);
  return parseStartApps(out);
}

export async function wingetList(): Promise<WingetPackage[]> {
  return parseWingetPackages((await winget(['list'])).out);
}

export async function wingetSearch(query: string, source?: PackageRef['source']): Promise<WingetPackage[]> {
  const q = String(query).trim().slice(0, 80);
  if (!q) return [];
  const sources: PackageRef['source'][] = source ? [source] : ['msstore', 'winget'];
  const results = await Promise.all(
    sources.map(async (s) => {
      // A non-zero exit here just means "no results".
      const { out } = await winget(['search', '--query', q, '--source', s, '--count', '25']);
      return parseWingetPackages(out).map((p) => ({ ...p, source: s }));
    }),
  );
  return results.flat();
}

export async function install(pkg: PackageRef): Promise<void> {
  if (!isValidPackageRef(pkg)) throw new Error('Invalid package reference.');
  const { code, out } = await winget([
    'install', '--id', pkg.id, '--exact', '--source', pkg.source, '--silent', '--accept-package-agreements',
  ]);
  if (code !== 0) throw new Error(`Install failed: ${lastLines(out + err)}`);
}

/** Uninstall and upgrade accept only ids that winget itself reports as installed. */
async function requireInstalled(id: string): Promise<void> {
  const listed = await wingetList();
  if (!listed.some((p) => p.id === id)) throw new Error('That package is not installed.');
}

export async function uninstall(id: string): Promise<void> {
  await requireInstalled(id);
  const { code, out } = await winget(['uninstall', '--id', id, '--exact', '--silent']);
  if (code !== 0) throw new Error(`Uninstall failed: ${lastLines(out)}`);
}

export async function upgrade(id: string): Promise<void> {
  await requireInstalled(id);
  const { code, out } = await winget(['upgrade', '--id', id, '--exact', '--silent', '--accept-package-agreements']);
  if (code !== 0) throw new Error(`Update failed: ${lastLines(out)}`);
}

// Waits for another program's window to take the foreground, then for that
// window to close. Exit codes: 0 closed, 2 nothing ever took the foreground.
const FOCUS_WATCH = (ourPid: number) => `
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class NdWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
}
"@
$target = [IntPtr]::Zero
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  $h = [NdWin]::GetForegroundWindow(); $p = 0
  [void][NdWin]::GetWindowThreadProcessId($h, [ref]$p)
  if ($h -ne [IntPtr]::Zero -and $p -ne ${ourPid}) {
    $name = (Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName
    if ($name -and $name -ne 'explorer' -and $name -ne 'powershell') { $target = $h; break }
  }
  Start-Sleep -Milliseconds 250
}
if ($target -eq [IntPtr]::Zero) { exit 2 }
while ([NdWin]::IsWindow($target)) { Start-Sleep -Milliseconds 500 }
exit 0
`;

export async function launchApp(appId: string): Promise<void> {
  // Only ids that are really in the Start menu may be launched.
  const apps = await startApps();
  if (!apps.some((a) => a.appId === appId)) throw new Error('That app is no longer installed.');
  await run('explorer.exe', [`shell:AppsFolder\\${appId}`], 30_000);
  await powershell(FOCUS_WATCH(process.pid), 24 * 60 * 60_000);
}

function findEdge(): string | null {
  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA];
  for (const root of roots) {
    if (!root) continue;
    const p = join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
    if (existsSync(p)) return p;
  }
  return null;
}

let activeSite: { kill: () => void } | null = null;

/** Close the site NEONDECK opened, if any (used by the "return" hotkey). */
export function closeActiveSite(): void {
  activeSite?.kill();
}

export function launchUrl(url: string, profile: string, dataRoot: string): Promise<void> {
  const safe = normalizeUrl(url);
  if (!safe) return Promise.reject(new Error('That address is not a valid web link.'));
  const edge = findEdge();
  if (!edge) return Promise.reject(new Error('Microsoft Edge was not found on this PC.'));
  const profileDir = join(dataRoot, 'edge', profile.replace(/[^a-z0-9-]/gi, '_') || 'default');

  // A dedicated Edge profile per NEONDECK profile: each person's service
  // sign-ins stay separate, and Edge runs as its own process, so we can tell
  // when the window closes. Sign-in data stays inside Edge; NEONDECK never
  // reads it.
  return new Promise((resolve, reject) => {
    const child = spawn(edge, [`--app=${safe}`, '--start-fullscreen', `--user-data-dir=${profileDir}`, '--no-first-run'], {
      shell: false,
      stdio: 'ignore',
    });
    activeSite = { kill: () => child.kill() };
    child.on('error', reject);
    child.on('close', () => { activeSite = null; resolve(); });
  });
}
