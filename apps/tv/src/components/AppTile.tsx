import type { CSSProperties } from 'react';

export function hueOf(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function glyphOf(name: string): string {
  const words = name.replace(/[^A-Za-z0-9+ ]/g, ' ').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 1)).toUpperCase();
}

interface Props {
  name: string;
  status?: string;
  badge?: string;
  autoFocus?: boolean;
  onSelect: () => void;
  onFocus?: () => void;
}

export function AppTile({ name, status, badge, autoFocus, onSelect, onFocus }: Props) {
  return (
    <button className="card card--tile" data-focusable data-autofocus={autoFocus ? '' : undefined} onClick={onSelect} onFocus={onFocus}>
      <span className="card__glow">
        <span className="card__frame">
          <span className="card__art" style={{ '--hue': hueOf(name) } as CSSProperties}>
            <span className="card__glyph">{glyphOf(name)}</span>
            <span className="card__tilename">{name}</span>
            {badge && <span className="badge">{badge}</span>}
          </span>
        </span>
      </span>
      {status && <span className="card__sub">{status}</span>}
    </button>
  );
}
