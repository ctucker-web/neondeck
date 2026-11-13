import { describe, expect, it } from 'vitest';
import {
  addCustomTile, allTiles, catalog, defaultTilesConfig, isHidden, isPinned, isValidPackageRef, linkTile, movePinned,
  newStartApps, normalizeTilesConfig, normalizeUrl, pin, pinnedTiles, removeCustomTile, resolveLaunch, setHidden, unpin,
  DEFAULT_PROFILE as P,
} from '../src';

const tile = (id: string) => allTiles(defaultTilesConfig()).find((t) => t.id === id)!;

describe('catalog', () => {
  it('has unique ids and valid https urls', () => {
    expect(new Set(catalog.map((e) => e.id)).size).toBe(catalog.length);
    for (const e of catalog) expect(normalizeUrl(e.url), e.name).toMatch(/^https:/);
  });
  it('contains every requested category', () => {
    const count = (c: string) => catalog.filter((e) => e.category === c).length;
    expect([count('free'), count('subscription'), count('livetv'), count('sports'), count('music')]).toEqual([14, 16, 4, 5, 4]);
  });
  it('only ships well-formed package references', () => {
    for (const e of catalog) if (e.package) expect(isValidPackageRef(e.package), e.name).toBe(true);
  });
});

describe('pin, hide, reorder', () => {
  it('pins to the end, once', () => {
    let c = pin(defaultTilesConfig(), P, 'netflix');
    c = pin(c, P, 'netflix');
    expect(pinnedTiles(c, P).map((t) => t.id)).toEqual(['youtube', 'pluto-tv', 'tubi', 'pbs', 'netflix']);
  });
  it('reorders and stops at the ends', () => {
    let c = movePinned(defaultTilesConfig(), P, 'tubi', -1);
    expect(c.profiles[P].pinned).toEqual(['youtube', 'tubi', 'pluto-tv', 'pbs']);
    c = movePinned(c, P, 'youtube', -1);
    c = movePinned(c, P, 'pbs', 1);
    expect(c.profiles[P].pinned).toEqual(['youtube', 'tubi', 'pluto-tv', 'pbs']);
  });
  it('hiding unpins, and pinning unhides', () => {
    let c = setHidden(defaultTilesConfig(), P, 'tubi', true);
    expect(isPinned(c, P, 'tubi')).toBe(false);
    expect(isHidden(c, P, 'tubi')).toBe(true);
    c = pin(c, P, 'tubi');
    expect(isHidden(c, P, 'tubi')).toBe(false);
  });
  it('keeps profiles independent', () => {
    const c = pin(unpin(defaultTilesConfig(), P, 'youtube'), 'kids', 'pbs-kids');
    expect(pinnedTiles(c, 'kids').map((t) => t.id)).toEqual(['pbs-kids']);
    expect(isPinned(c, P, 'pbs-kids')).toBe(false);
  });
  it('does not mutate its input', () => {
    const c = defaultTilesConfig();
    pin(c, P, 'netflix');
    expect(c).toEqual(defaultTilesConfig());
  });
});

describe('custom tiles', () => {
  it('adds with a unique id, pins it, and removes it everywhere', () => {
    let c = addCustomTile(defaultTilesConfig(), { name: 'My NAS', kind: 'url', target: 'http://nas.local/' }, P);
    c = addCustomTile(c, { name: 'My NAS', kind: 'url', target: 'http://nas2.local/' }, P);
    expect(c.custom.map((t) => t.id)).toEqual(['custom-my-nas', 'custom-my-nas-2']);
    expect(isPinned(c, P, 'custom-my-nas-2')).toBe(true);
    c = removeCustomTile(c, 'custom-my-nas');
    expect(c.custom).toHaveLength(1);
    expect(isPinned(c, P, 'custom-my-nas')).toBe(false);
  });
});

describe('resolveLaunch', () => {
  const cfg = defaultTilesConfig();

  it('1. launches the installed app when the Start menu has it', () => {
    const apps = [{ name: 'Spotify', appId: 'Spotify.exe' }];
    expect(resolveLaunch(tile('spotify'), cfg, apps)).toEqual({ kind: 'app', appId: 'Spotify.exe' });
  });
  it('matches alternate app names case-insensitively', () => {
    expect(resolveLaunch(tile('tidal'), cfg, [{ name: 'tidal', appId: 'T!App' }])).toEqual({ kind: 'app', appId: 'T!App' });
  });
  it('2. offers install when a package is known but not installed', () => {
    expect(resolveLaunch(tile('spotify'), cfg, [])).toEqual({
      kind: 'install',
      package: { source: 'winget', id: 'Spotify.Spotify' },
      fallbackUrl: 'https://open.spotify.com',
    });
  });
  it('3. falls back to the website when no package is known', () => {
    expect(resolveLaunch(tile('netflix'), cfg, [])).toEqual({ kind: 'web', url: 'https://www.netflix.com' });
  });
  it('prefers an app the user linked, then a package they chose', () => {
    const withPkg = linkTile(cfg, 'netflix', { package: { source: 'msstore', id: '9NEXAMPLE0001' } });
    const t = allTiles(withPkg).find((x) => x.id === 'netflix')!;
    expect(resolveLaunch(t, withPkg, []).kind).toBe('install');
    const withApp = linkTile(withPkg, 'netflix', { appId: 'Vendor.Flix!App' });
    expect(resolveLaunch(t, withApp, [{ name: 'Some Other Name', appId: 'Vendor.Flix!App' }])).toEqual({ kind: 'app', appId: 'Vendor.Flix!App' });
    // Link is stale once the app is uninstalled.
    expect(resolveLaunch(t, withApp, []).kind).toBe('install');
  });
  it('handles custom program and URL tiles', () => {
    let c = addCustomTile(cfg, { name: 'Calc', kind: 'program', target: 'calc!App' }, P);
    c = addCustomTile(c, { name: 'Site', kind: 'url', target: 'https://example.com/' }, P);
    const [site, calc] = [allTiles(c).find((t) => t.id === 'custom-site')!, allTiles(c).find((t) => t.id === 'custom-calc')!];
    expect(resolveLaunch(calc, c, [{ name: 'Calculator', appId: 'calc!App' }])).toEqual({ kind: 'app', appId: 'calc!App' });
    expect(resolveLaunch(calc, c, [])).toEqual({ kind: 'none' });
    expect(resolveLaunch(site, c, [{ name: 'Site', appId: 'x' }])).toEqual({ kind: 'web', url: 'https://example.com/' });
  });
});

describe('config handling', () => {
  it('repairs missing or malformed files', () => {
    expect(normalizeTilesConfig(null)).toEqual(defaultTilesConfig());
    const c = normalizeTilesConfig({ profiles: { kids: { pinned: ['pbs-kids', 7] } }, custom: 'nope' });
    expect(c.profiles.kids).toEqual({ pinned: ['pbs-kids'], hidden: [] });
    expect(c.profiles[P]).toBeDefined();
    expect(c.custom).toEqual([]);
  });
  it('ignores pinned ids that no longer exist', () => {
    const c = normalizeTilesConfig({ profiles: { [P]: { pinned: ['gone', 'tubi'], hidden: [] } } });
    expect(pinnedTiles(c, P).map((t) => t.id)).toEqual(['tubi']);
  });
  it('detects newly installed Start menu apps', () => {
    const before = [{ name: 'A', appId: 'a' }];
    expect(newStartApps(before, [...before, { name: 'B', appId: 'b' }])).toEqual([{ name: 'B', appId: 'b' }]);
  });
});
