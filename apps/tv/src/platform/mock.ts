// Demo platform for running the UI in a browser. Nothing is really installed
// or launched; every app and package name below is sample data.
import type { PackageRef, PlatformApi, StartApp, WingetPackage } from '@neondeck/core';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const KEY = 'neondeck.demo.';

export function createMockPlatform(): PlatformApi {
  let apps: StartApp[] = [
    { name: 'Spotify', appId: 'Demo.Spotify!App' },
    { name: 'Sample Media Player', appId: 'Demo.MediaPlayer!App' },
    { name: 'Sample Game Launcher', appId: 'Demo.GameLauncher!App' },
    { name: 'Calculator', appId: 'Demo.Calculator!App' },
    { name: 'Photos', appId: 'Demo.Photos!App' },
  ];
  let packages: WingetPackage[] = [
    { name: 'Spotify', id: 'Spotify.Spotify', version: '1.2.50', available: '1.2.52', source: 'winget' },
    { name: 'Sample Media Player', id: 'Demo.MediaPlayer', version: '3.0.20', source: 'winget' },
    { name: 'Sample Game Launcher', id: 'Demo.GameLauncher', version: '2.10', source: 'winget' },
  ];
  let autostart = false;

  return {
    startApps: async () => apps,
    wingetList: async () => (await wait(400), packages),
    wingetSearch: async (query: string, source?: PackageRef['source']) => {
      await wait(700);
      const q = query.trim();
      if (!q) return [];
      const title = q[0].toUpperCase() + q.slice(1);
      const slug = title.replace(/[^A-Za-z0-9]/g, '');
      const all: WingetPackage[] = [
        { name: `${title} (demo result)`, id: `9DEMO${slug.toUpperCase().slice(0, 7).padEnd(7, '0')}`, version: 'Unknown', source: 'msstore' },
        { name: `${title} Desktop (demo result)`, id: `Demo.${slug}`, version: '1.0.0', source: 'winget' },
        { name: `${title} Companion (demo result)`, id: `Demo.${slug}Companion`, version: '0.9.1', source: 'winget' },
      ];
      return source ? all.filter((p) => p.source === source) : all;
    },
    install: async (pkg) => {
      await wait(1800);
      const name = pkg.id.replace(/^Demo\./, '').replace(/^.*\./, '');
      const known = pkg.id === 'Plex.Plex' ? 'Plex' : pkg.id === 'TIDALMusicAS.TIDAL' ? 'TIDAL' : name;
      apps = [...apps, { name: known, appId: `${pkg.id}!App` }];
      packages = [...packages, { name: known, id: pkg.id, version: '1.0.0', source: pkg.source }];
    },
    uninstall: async (id) => {
      await wait(1200);
      packages = packages.filter((p) => p.id !== id);
      apps = apps.filter((a) => !a.appId.startsWith(id) && !(id === 'Spotify.Spotify' && a.name === 'Spotify'));
    },
    upgrade: async (id) => {
      await wait(1500);
      packages = packages.map((p) => (p.id === id && p.available ? { ...p, version: p.available, available: undefined } : p));
    },
    launchApp: () => wait(1600),
    launchUrl: () => wait(1600),
    readConfig: async (name) => {
      try {
        return JSON.parse(localStorage.getItem(KEY + name) ?? 'null');
      } catch {
        return null;
      }
    },
    writeConfig: async (name, data) => {
      try {
        localStorage.setItem(KEY + name, JSON.stringify(data));
      } catch {
        // Demo only: losing this is harmless.
      }
    },
    getAutostart: async () => autostart,
    setAutostart: async (on) => {
      autostart = on;
    },
    quit: async () => {},
  };
}
