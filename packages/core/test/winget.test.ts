import { describe, expect, it } from 'vitest';
import { isValidPackageId, normalizeUrl, parseStartApps, parseWingetPackages, parseWingetTable } from '../src';

const SEARCH = [
  '   - \r   \\ \r                    \rName               Id                Version      Match          Source',
  '-------------------------------------------------------------------------------',
  'Example Player     Example.Player    1.2.2.870    Moniker: play  winget',
  'Example Player     9NEXAMPLE0001     Unknown                     msstore',
  'Example Media Se…  Example.Server    1.41.3.9314                 winget',
].join('\r\n');

const LIST = [
  'Name                         Id                       Version        Available      Source',
  '------------------------------------------------------------------------------------------',
  'Example Player               Example.Player           1.2.2.870      1.2.3.900      winget',
  'Some Store App               MSIX\\Vendor.App_1.0.0.0  1.0.0.0',
  'Tool With Spaces In Name     Vendor.Tool              2.0                           winget',
  '2 upgrades available.',
].join('\n');

describe('parseWingetTable', () => {
  it('finds headers after spinner noise', () => {
    expect(parseWingetTable(SEARCH).headers).toEqual(['Name', 'Id', 'Version', 'Match', 'Source']);
  });
  it('returns nothing when there is no table', () => {
    expect(parseWingetTable('No package found matching input criteria.')).toEqual({ headers: [], rows: [] });
    expect(parseWingetTable('')).toEqual({ headers: [], rows: [] });
  });
});

describe('parseWingetPackages', () => {
  it('parses search results from both sources', () => {
    expect(parseWingetPackages(SEARCH)).toEqual([
      { name: 'Example Player', id: 'Example.Player', version: '1.2.2.870', source: 'winget' },
      { name: 'Example Player', id: '9NEXAMPLE0001', version: 'Unknown', source: 'msstore' },
      { name: 'Example Media Se…', id: 'Example.Server', version: '1.41.3.9314', source: 'winget' },
    ]);
  });

  it('parses list output with available versions and drops the footer', () => {
    const pkgs = parseWingetPackages(LIST);
    expect(pkgs).toHaveLength(3);
    expect(pkgs[0]).toEqual({ name: 'Example Player', id: 'Example.Player', version: '1.2.2.870', available: '1.2.3.900', source: 'winget' });
    expect(pkgs[1]).toEqual({ name: 'Some Store App', id: 'MSIX\\Vendor.App_1.0.0.0', version: '1.0.0.0' });
    expect(pkgs[2].available).toBeUndefined();
    expect(pkgs[2].source).toBe('winget');
  });

  it('keeps columns aligned when names contain double-width characters', () => {
    const out = [
      'Name          Id            Version  Source',
      '-------------------------------------------',
      '音楽プレーヤー  Vendor.Music  3.1      winget',
      'Plain         Vendor.Plain  1.0      winget',
    ].join('\n');
    expect(parseWingetPackages(out).map((p) => p.id)).toEqual(['Vendor.Music', 'Vendor.Plain']);
  });

  it('works with translated headers by position', () => {
    const out = ['Nombre   Id        Versión  Origen', '--------------------------------', 'App      Ven.App   1.0      winget'].join('\n');
    expect(parseWingetPackages(out)).toEqual([{ name: 'App', id: 'Ven.App', version: '1.0', source: 'winget' }]);
  });
});

describe('parseStartApps', () => {
  it('accepts an array', () => {
    const json = '[{"Name":"Calculator","AppID":"Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"},{"Name":"Notepad","AppID":"notepad.exe"}]';
    expect(parseStartApps(json)).toEqual([
      { name: 'Calculator', appId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' },
      { name: 'Notepad', appId: 'notepad.exe' },
    ]);
  });
  it('accepts a single object and skips malformed entries', () => {
    expect(parseStartApps('{"Name":"Only","AppID":"only.exe"}')).toEqual([{ name: 'Only', appId: 'only.exe' }]);
    expect(parseStartApps('[{"Name":"NoId"},{"Name":"","AppID":"x"}]')).toEqual([]);
    expect(parseStartApps('  ')).toEqual([]);
  });
});

describe('input validation', () => {
  it('accepts real-shaped package ids and rejects command-line tricks', () => {
    expect(isValidPackageId('Spotify.Spotify')).toBe(true);
    expect(isValidPackageId('9NEXAMPLE0001')).toBe(true);
    expect(isValidPackageId('Vendor.App --override "x"')).toBe(false);
    expect(isValidPackageId('--id')).toBe(false);
    expect(isValidPackageId('a;b')).toBe(false);
    expect(isValidPackageId('')).toBe(false);
  });
  it('normalizes web addresses and refuses other schemes', () => {
    expect(normalizeUrl('example.com/watch')).toBe('https://example.com/watch');
    expect(normalizeUrl('http://nas.local:8096')).toBe('http://nas.local:8096/');
    expect(normalizeUrl('file:///C:/Windows/System32/cmd.exe')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('notaurl')).toBeNull();
    expect(normalizeUrl('')).toBeNull();
  });
});
