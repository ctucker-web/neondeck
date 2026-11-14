import type { PackageRef, StartApp, WingetPackage } from './types';

/**
 * Everything the UI needs from the operating system. The Windows adapter
 * implements it with winget, PowerShell, and Edge; a Linux adapter can
 * implement the same contract later without touching the UI.
 */
export interface PlatformApi {
  startApps(): Promise<StartApp[]>;
  wingetList(): Promise<WingetPackage[]>;
  wingetSearch(query: string, source?: PackageRef['source']): Promise<WingetPackage[]>;
  install(pkg: PackageRef): Promise<void>;
  uninstall(id: string): Promise<void>;
  upgrade(id: string): Promise<void>;
  /** Resolves when the launched app's window closes (or focus tracking gives up). */
  launchApp(appId: string): Promise<void>;
  /** Opens a site in browser app mode, fullscreen. Resolves when it closes. */
  launchUrl(url: string, profile: string): Promise<void>;
  /** Download text (playlists, guide data) without browser cross-origin limits. */
  fetchText(url: string): Promise<string>;
  /** Open the folder holding the diagnostics log. */
  openLogs(): Promise<void>;
  readConfig(name: string): Promise<unknown>;
  writeConfig(name: string, data: unknown): Promise<void>;
  getAutostart(): Promise<boolean>;
  setAutostart(on: boolean): Promise<void>;
  quit(): Promise<void>;
}

export const PLATFORM_METHODS: (keyof PlatformApi)[] = [
  'startApps', 'wingetList', 'wingetSearch', 'install', 'uninstall', 'upgrade', 'launchApp',
  'launchUrl', 'fetchText', 'openLogs', 'readConfig', 'writeConfig', 'getAutostart', 'setAutostart', 'quit',
];
