// Theme engine: a theme is a plain JSON file of design tokens. Applying one
// writes each token to a CSS custom property (--nd-<token>) on <html>, so
// every component restyles without re-rendering. From milestone 5, themes
// are also loaded from the plugins directory.
import neon from './themes/neon.json';
import amber from './themes/amber.json';
import ice from './themes/ice.json';

export interface Theme {
  id: string;
  name: string;
  tokens: Record<string, string>;
}

export const themes: Theme[] = [neon, amber, ice];

export function applyTheme(id: string): void {
  const theme = themes.find((t) => t.id === id) ?? themes[0];
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(`--nd-${key}`, value);
  }
  root.dataset.theme = theme.id;
}
