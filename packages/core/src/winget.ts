// Parsers for winget's text output. winget has no JSON output for search or
// list, so we read its fixed-width tables. Columns are located from the
// header row and measured in display cells, because winget pads by terminal
// width and East Asian characters occupy two cells.
import type { PackageRef, StartApp, WingetPackage } from './types';

function cellWidth(ch: string): number {
  const c = ch.codePointAt(0)!;
  const wide =
    (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1faff) || (c >= 0x20000 && c <= 0x3fffd);
  return wide ? 2 : 1;
}

/** Slice a line by display-cell positions [from, to). */
function sliceCells(line: string, from: number, to: number): string {
  let pos = 0;
  let out = '';
  for (const ch of line) {
    if (pos >= to) break;
    if (pos >= from) out += ch;
    pos += cellWidth(ch);
  }
  return out.trim();
}

/** Parse a winget table into rows of cell text, in column order. */
export function parseWingetTable(output: string): { headers: string[]; rows: string[][] } {
  const lines = output
    .split(/\r?\n/)
    // Progress spinners redraw with a bare carriage return; keep the last draw.
    .map((l) => l.slice(l.lastIndexOf('\r') + 1).replace(/\s+$/, ''));

  const rule = lines.findIndex((l, i) => i > 0 && /^-{5,}$/.test(l));
  if (rule < 1) return { headers: [], rows: [] };

  const headerLine = lines[rule - 1];
  const starts: number[] = [];
  const headers: string[] = [];
  let pos = 0;
  let prevSpace = true;
  for (const ch of headerLine) {
    const space = ch === ' ';
    if (!space && prevSpace) starts.push(pos);
    prevSpace = space;
    pos += cellWidth(ch);
  }
  starts.forEach((s, i) => headers.push(sliceCells(headerLine, s, starts[i + 1] ?? Infinity)));

  const rows = lines
    .slice(rule + 1)
    .filter((l) => l.trim() !== '')
    .map((l) => starts.map((s, i) => sliceCells(l, s, starts[i + 1] ?? Infinity)));
  return { headers, rows };
}

const SOURCES = new Set(['winget', 'msstore']);

/**
 * Turn `winget search`, `winget list`, or `winget upgrade` output into
 * packages. The first three columns are always name, id, version (this holds
 * on non-English Windows too, where the header words are translated).
 */
export function parseWingetPackages(output: string): WingetPackage[] {
  const { headers, rows } = parseWingetTable(output);
  const availableCol = headers.findIndex((h) => h.toLowerCase() === 'available');
  const out: WingetPackage[] = [];
  for (const row of rows) {
    const [name, id, version] = row;
    // Footer lines ("3 upgrades available.") land in the name column only.
    if (!name || !id || /\s/.test(id)) continue;
    const pkg: WingetPackage = { name, id, version: version ?? '' };
    const last = row[row.length - 1];
    if (row.length > 3 && SOURCES.has(last)) pkg.source = last;
    if (availableCol > 2 && row[availableCol]) pkg.available = row[availableCol];
    out.push(pkg);
  }
  return out;
}

/** Parse `Get-StartApps | ConvertTo-Json` (an object when there is one app). */
export function parseStartApps(json: string): StartApp[] {
  const text = json.trim();
  if (!text) return [];
  const data: unknown = JSON.parse(text);
  const list = Array.isArray(data) ? data : [data];
  const out: StartApp[] = [];
  for (const item of list) {
    const rec = item as Record<string, unknown>;
    const name = rec.Name ?? rec.name;
    const appId = rec.AppID ?? rec.AppId ?? rec.appId;
    if (typeof name === 'string' && typeof appId === 'string' && name && appId) out.push({ name, appId });
  }
  return out;
}

/** Package ids go on a command line, so accept only the characters winget uses. */
export function isValidPackageId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(id);
}

export function isValidPackageRef(ref: unknown): ref is PackageRef {
  const r = ref as PackageRef | null;
  return !!r && (r.source === 'winget' || r.source === 'msstore') && typeof r.id === 'string' && isValidPackageId(r.id);
}

/** Only http(s) URLs may be handed to the browser. */
export function normalizeUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return url.toString();
  } catch {
    return null;
  }
}
