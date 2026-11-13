export type Category = 'free' | 'subscription' | 'livetv' | 'sports' | 'music';

export const CATEGORY_LABELS: Record<Category, string> = {
  free: 'Free',
  subscription: 'Subscription',
  livetv: 'Live TV',
  sports: 'Sports',
  music: 'Music',
};

export interface PackageRef {
  source: 'winget' | 'msstore';
  id: string;
}

export interface CatalogEntry {
  id: string;
  name: string;
  category: Category;
  url: string;
  /** Verified package only. Absent means "look it up live". */
  package?: PackageRef;
  /** Extra Start menu names that identify the installed app. */
  appNames?: string[];
}

export interface CustomTile {
  id: string;
  name: string;
  kind: 'url' | 'program';
  /** A URL, or a Start menu AppID for programs. */
  target: string;
}

/** A catalog entry or a custom tile, in one shape the UI can render. */
export interface Tile {
  id: string;
  name: string;
  category: Category | 'custom';
  url?: string;
  programAppId?: string;
  package?: PackageRef;
  appNames?: string[];
}

/** One entry from the Windows Start menu (PowerShell Get-StartApps). */
export interface StartApp {
  name: string;
  appId: string;
}

export interface WingetPackage {
  name: string;
  id: string;
  version: string;
  available?: string;
  source?: string;
}

export interface ProfileTiles {
  pinned: string[];
  hidden: string[];
}

export interface TileLink {
  appId?: string;
  package?: PackageRef;
}

export interface TilesConfig {
  version: 1;
  profiles: Record<string, ProfileTiles>;
  custom: CustomTile[];
  /** What the user's PC taught us: tile id -> installed app / chosen package. */
  links: Record<string, TileLink>;
}

export type LaunchPlan =
  | { kind: 'app'; appId: string }
  | { kind: 'install'; package: PackageRef; fallbackUrl?: string }
  | { kind: 'web'; url: string }
  | { kind: 'none' };
