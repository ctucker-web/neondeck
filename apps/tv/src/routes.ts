export type Route = 'home' | 'live' | 'guide' | 'library' | 'dvr' | 'apps' | 'search' | 'settings';

export interface RouteDef {
  id: Route;
  label: string;
  icon: string; // SVG path data on a 24x24 grid
  milestone?: number; // set while the screen is still a placeholder
}

export const routes: RouteDef[] = [
  { id: 'home', label: 'Home', icon: 'M3 11 12 3l9 8v10h-6v-6H9v6H3z' },
  { id: 'live', label: 'Live TV', icon: 'M2 6h20v13H2zM8 2l4 4 4-4M9 22h6' , milestone: 2 },
  { id: 'guide', label: 'Guide', icon: 'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 9v11', milestone: 2 },
  { id: 'library', label: 'Library', icon: 'M4 3h4v18H4zM10 3h4v18h-4zM16 5l4-1 3 16-4 1z', milestone: 3 },
  { id: 'dvr', label: 'DVR', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', milestone: 4 },
  { id: 'apps', label: 'Apps', icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' },
  { id: 'search', label: 'Search', icon: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM15 15l6 6', milestone: 3 },
  { id: 'settings', label: 'Settings', icon: 'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4M14 4v4M6 10v4M12 16v4' },
];
