// App tiles state: the catalog, this profile's pins, what is installed, and
// the actions (launch, install, pin...) shared by Home and the Apps screen.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DEFAULT_PROFILE, addCustomTile, allTiles, defaultTilesConfig, findInstalledApp, linkTile, newStartApps,
  normalizeTilesConfig, resolveLaunch,
  type PackageRef, type StartApp, type Tile, type TilesConfig, type WingetPackage,
} from '@neondeck/core';
import { isDemo, platform } from '../platform/bridge';

export type Sheet =
  | { kind: 'tile'; id: string }
  | { kind: 'storepick'; tileId: string; results: WingetPackage[] }
  | { kind: 'package'; pkg: WingetPackage; installed: boolean }
  | { kind: 'startapp'; app: StartApp };

interface AppsContext {
  demo: boolean;
  profile: string;
  config: TilesConfig;
  tiles: Tile[];
  startApps: StartApp[];
  packages: WingetPackage[] | null;
  busy: string | null;
  toast: string | null;
  sheet: Sheet | null;
  setSheet: (s: Sheet | null) => void;
  update: (fn: (c: TilesConfig) => TilesConfig) => void;
  notify: (msg: string) => void;
  statusOf: (tile: Tile) => string;
  activate: (tile: Tile) => void;
  openApp: (name: string, appId: string) => void;
  openSite: (name: string, url: string) => void;
  install: (pkg: PackageRef, name: string, tileId?: string) => void;
  uninstall: (id: string, name: string) => void;
  upgrade: (id: string, name: string) => void;
  findInStore: (tile: Tile) => void;
  loadPackages: () => void;
  search: (query: string) => Promise<WingetPackage[]>;
  /** Run any long task behind the blocking status panel. */
  runTask: (label: string, task: () => Promise<string | void>) => void;
}

const Ctx = createContext<AppsContext | null>(null);

export function useApps(): AppsContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApps must be used inside <AppsProvider>');
  return ctx;
}

function message(e: unknown): string {
  // Electron prefixes errors that cross the process boundary.
  return (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
}

export function AppsProvider({ children }: { children: ReactNode }) {
  const profile = DEFAULT_PROFILE;
  const [config, setConfig] = useState<TilesConfig>(defaultTilesConfig);
  const [startApps, setStartApps] = useState<StartApp[]>([]);
  const [packages, setPackages] = useState<WingetPackage[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const loaded = useRef(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }, []);

  const refreshApps = useCallback(async () => {
    const apps = await platform.startApps();
    setStartApps(apps);
    return apps;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setConfig(normalizeTilesConfig(await platform.readConfig('tiles')));
        loaded.current = true;
        await refreshApps();
      } catch (e) {
        loaded.current = true;
        notify(`Could not read installed apps: ${message(e)}`);
      }
    })();
  }, [refreshApps, notify]);

  const update = useCallback((fn: (c: TilesConfig) => TilesConfig) => {
    setConfig((prev) => {
      const next = fn(prev);
      if (loaded.current && next !== prev) void platform.writeConfig('tiles', next);
      return next;
    });
  }, []);

  /** Run a long task behind a blocking status panel; report failures. */
  const run = useCallback(
    async (label: string, task: () => Promise<string | void>) => {
      setSheet(null);
      setBusy(label);
      try {
        const done = await task();
        if (done) notify(done);
      } catch (e) {
        notify(message(e));
      } finally {
        setBusy(null);
      }
    },
    [notify],
  );

  const loadPackages = useCallback(() => {
    setPackages(null);
    platform.wingetList().then(setPackages, (e) => {
      setPackages([]);
      notify(message(e));
    });
  }, [notify]);

  const openApp = useCallback(
    (name: string, appId: string) =>
      void run(`${name} is open. Close it to come back here.`, async () => {
        await platform.launchApp(appId);
        if (isDemo) return `Demo mode: ${name} would have opened as a Windows app.`;
      }),
    [run],
  );

  const openSite = useCallback(
    (name: string, url: string) =>
      void run(`${name} is open in Edge. Close it to come back here.`, async () => {
        await platform.launchUrl(url, profile);
        if (isDemo) return `Demo mode: ${name} would have opened fullscreen in Edge.`;
      }),
    [run, profile],
  );

  const install = useCallback(
    (pkg: PackageRef, name: string, tileId?: string) =>
      void run(`Installing ${name}. This can take a few minutes.`, async () => {
        const before = await platform.startApps();
        await platform.install(pkg);
        const fresh = newStartApps(before, await refreshApps());
        if (tileId) {
          // Remember which package and which Start menu app belong to this tile.
          update((c) => linkTile(c, tileId, { package: pkg, appId: fresh.length === 1 ? fresh[0].appId : undefined }));
          return `${name} is installed.`;
        }
        if (fresh.length > 0) {
          update((c) => addCustomTile(c, { name: fresh[0].name, kind: 'program', target: fresh[0].appId }, profile));
          return `${fresh[0].name} is installed and pinned to Home.`;
        }
        return `${name} is installed. Find it under “On This PC” to add a tile.`;
      }),
    [run, refreshApps, update, profile],
  );

  const uninstall = useCallback(
    (id: string, name: string) =>
      void run(`Uninstalling ${name}.`, async () => {
        await platform.uninstall(id);
        await refreshApps();
        loadPackages();
        return `${name} was uninstalled.`;
      }),
    [run, refreshApps, loadPackages],
  );

  const upgrade = useCallback(
    (id: string, name: string) =>
      void run(`Updating ${name}.`, async () => {
        await platform.upgrade(id);
        loadPackages();
        return `${name} is up to date.`;
      }),
    [run, loadPackages],
  );

  const findInStore = useCallback(
    (tile: Tile) =>
      void run(`Searching the Microsoft Store for ${tile.name}.`, async () => {
        const results = await platform.wingetSearch(tile.name, 'msstore');
        if (results.length === 0) return `No Windows app found for ${tile.name}. It will keep opening in Edge.`;
        setSheet({ kind: 'storepick', tileId: tile.id, results: results.slice(0, 8) });
      }),
    [run],
  );

  const tiles = useMemo(() => allTiles(config), [config]);

  const statusOf = useCallback(
    (tile: Tile) => {
      if (findInstalledApp(tile, config, startApps)) return 'Installed app';
      if (tile.programAppId) return 'Not installed';
      return tile.package ? 'App available' : 'Opens in Edge';
    },
    [config, startApps],
  );

  const activate = useCallback(
    (tile: Tile) => {
      const plan = resolveLaunch(tile, config, startApps);
      if (plan.kind === 'app') openApp(tile.name, plan.appId);
      else if (plan.kind === 'web') openSite(tile.name, plan.url);
      else setSheet({ kind: 'tile', id: tile.id }); // install offer, or a broken custom tile
    },
    [config, startApps, openApp, openSite],
  );

  const value: AppsContext = {
    demo: isDemo, profile, config, tiles, startApps, packages, busy, toast, sheet, setSheet, update, notify,
    statusOf, activate, openApp, openSite, install, uninstall, upgrade, findInStore, loadPackages,
    search: (q) => platform.wingetSearch(q),
    runTask: (label, task) => void run(label, task),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
