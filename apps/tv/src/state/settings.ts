import { useEffect, useState } from 'react';
import { applyTheme } from '../theme';

export interface Settings {
  theme: string;
  motion: 'full' | 'reduced';
  scanlines: boolean;
}

const KEY = 'neondeck.settings';

function defaults(): Settings {
  const prefersReduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { theme: 'neon', motion: prefersReduced ? 'reduced' : 'full', scanlines: true };
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    // Storage unavailable or corrupt: fall back to defaults.
  }
  return defaults();
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    applyTheme(settings.theme);
    const root = document.documentElement;
    root.dataset.motion = settings.motion;
    root.dataset.scanlines = settings.scanlines ? 'on' : 'off';
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // Non-fatal: settings just won't persist.
    }
  }, [settings]);

  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  return { settings, update };
}
