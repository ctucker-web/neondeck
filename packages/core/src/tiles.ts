// Tile model: catalog + custom tiles, per-profile pin/hide/order, and the
// launch decision. Everything here is pure so it runs (and is tested) on
// any OS; the platform adapters only carry out the resulting plan.
import catalogFile from './catalog.json';
import type { CatalogEntry, CustomTile, LaunchPlan, PackageRef, ProfileTiles, StartApp, Tile, TilesConfig } from './types';

export const catalog = catalogFile.services as CatalogEntry[];

export const DEFAULT_PROFILE = 'default';

export function defaultTilesConfig(): TilesConfig {
  return {
    version: 1,
    profiles: { [DEFAULT_PROFILE]: { pinned: ['youtube', 'pluto-tv', 'tubi', 'pbs'], hidden: [] } },
    custom: [],
    links: {},
  };
}

/** Accept whatever is on disk and return a well-formed config. */
export function normalizeTilesConfig(raw: unknown): TilesConfig {
  const base = defaultTilesConfig();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<TilesConfig>;
  const profiles: Record<string, ProfileTiles> = {};
  for (const [name, p] of Object.entries(r.profiles ?? {})) {
    profiles[name] = {
      pinned: Array.isArray(p?.pinned) ? p.pinned.filter((x) => typeof x === 'string') : [],
      hidden: Array.isArray(p?.hidden) ? p.hidden.filter((x) => typeof x === 'string') : [],
    };
  }
  if (!profiles[DEFAULT_PROFILE]) profiles[DEFAULT_PROFILE] = base.profiles[DEFAULT_PROFILE];
  return {
    version: 1,
    profiles,
    custom: Array.isArray(r.custom) ? r.custom.filter((c) => c && c.id && c.name && c.target) : [],
    links: r.links && typeof r.links === 'object' ? r.links : {},
  };
}

export function allTiles(config: TilesConfig): Tile[] {
  const fromCatalog: Tile[] = catalog.map((e) => ({ ...e, package: config.links[e.id]?.package ?? e.package }));
  const custom: Tile[] = config.custom.map((c) => ({
    id: c.id,
    name: c.name,
    category: 'custom',
    url: c.kind === 'url' ? c.target : undefined,
    programAppId: c.kind === 'program' ? c.target : undefined,
  }));
  return [...custom, ...fromCatalog];
}

function profileOf(config: TilesConfig, profile: string): ProfileTiles {
  return config.profiles[profile] ?? { pinned: [], hidden: [] };
}

function withProfile(config: TilesConfig, profile: string, next: ProfileTiles): TilesConfig {
  return { ...config, profiles: { ...config.profiles, [profile]: next } };
}

/** Home-row tiles for a profile, in the user's order. Unknown ids are dropped. */
export function pinnedTiles(config: TilesConfig, profile: string): Tile[] {
  const byId = new Map(allTiles(config).map((t) => [t.id, t]));
  return profileOf(config, profile).pinned.flatMap((id) => byId.get(id) ?? []);
}

export function isPinned(config: TilesConfig, profile: string, id: string): boolean {
  return profileOf(config, profile).pinned.includes(id);
}

export function isHidden(config: TilesConfig, profile: string, id: string): boolean {
  return profileOf(config, profile).hidden.includes(id);
}

export function pin(config: TilesConfig, profile: string, id: string): TilesConfig {
  const p = profileOf(config, profile);
  if (p.pinned.includes(id)) return config;
  // Pinning something implies you want to see it.
  return withProfile(config, profile, { pinned: [...p.pinned, id], hidden: p.hidden.filter((h) => h !== id) });
}

export function unpin(config: TilesConfig, profile: string, id: string): TilesConfig {
  const p = profileOf(config, profile);
  return withProfile(config, profile, { ...p, pinned: p.pinned.filter((x) => x !== id) });
}

/** Move a pinned tile left (-1) or right (+1); stops at the ends. */
export function movePinned(config: TilesConfig, profile: string, id: string, delta: -1 | 1): TilesConfig {
  const p = profileOf(config, profile);
  const from = p.pinned.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= p.pinned.length) return config;
  const pinned = [...p.pinned];
  [pinned[from], pinned[to]] = [pinned[to], pinned[from]];
  return withProfile(config, profile, { ...p, pinned });
}

export function setHidden(config: TilesConfig, profile: string, id: string, hidden: boolean): TilesConfig {
  const p = profileOf(config, profile);
  const rest = p.hidden.filter((h) => h !== id);
  return withProfile(config, profile, {
    pinned: hidden ? p.pinned.filter((x) => x !== id) : p.pinned,
    hidden: hidden ? [...rest, id] : rest,
  });
}

export function addCustomTile(config: TilesConfig, tile: Omit<CustomTile, 'id'>, profile: string): TilesConfig {
  const slug = tile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tile';
  const taken = new Set(allTiles(config).map((t) => t.id));
  let id = `custom-${slug}`;
  for (let n = 2; taken.has(id); n++) id = `custom-${slug}-${n}`;
  return pin({ ...config, custom: [...config.custom, { ...tile, id }] }, profile, id);
}

export function removeCustomTile(config: TilesConfig, id: string): TilesConfig {
  const profiles: Record<string, ProfileTiles> = {};
  for (const [name, p] of Object.entries(config.profiles)) {
    profiles[name] = { pinned: p.pinned.filter((x) => x !== id), hidden: p.hidden.filter((x) => x !== id) };
  }
  return { ...config, profiles, custom: config.custom.filter((c) => c.id !== id) };
}

export function linkTile(config: TilesConfig, id: string, link: { appId?: string; package?: PackageRef }): TilesConfig {
  return { ...config, links: { ...config.links, [id]: { ...config.links[id], ...link } } };
}

/** The installed Start menu app for a tile, if there is one. */
export function findInstalledApp(tile: Tile, config: TilesConfig, startApps: StartApp[]): StartApp | undefined {
  if (tile.programAppId) return startApps.find((a) => a.appId === tile.programAppId);
  const linked = config.links[tile.id]?.appId;
  if (linked) {
    const hit = startApps.find((a) => a.appId === linked);
    if (hit) return hit;
  }
  if (tile.category === 'custom') return undefined;
  const names = [tile.name, ...(tile.appNames ?? [])].map((n) => n.toLowerCase());
  return startApps.find((a) => names.includes(a.name.trim().toLowerCase()));
}

/**
 * Decide how a tile launches:
 *   1. its Windows app, if installed;
 *   2. otherwise offer to install it, if a package is known;
 *   3. otherwise open its site in the browser's app mode.
 */
export function resolveLaunch(tile: Tile, config: TilesConfig, startApps: StartApp[]): LaunchPlan {
  const app = findInstalledApp(tile, config, startApps);
  if (app) return { kind: 'app', appId: app.appId };
  if (tile.package) return { kind: 'install', package: tile.package, fallbackUrl: tile.url };
  if (tile.url) return { kind: 'web', url: tile.url };
  return { kind: 'none' };
}

/** Apps that appeared in the Start menu between two scans (after an install). */
export function newStartApps(before: StartApp[], after: StartApp[]): StartApp[] {
  const seen = new Set(before.map((a) => a.appId));
  return after.filter((a) => !seen.has(a.appId));
}
