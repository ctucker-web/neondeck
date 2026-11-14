import type { CSSProperties } from 'react';
import type { CardShape, Item } from '../types';

interface Props {
  item: Item;
  shape: CardShape;
  autoFocus?: boolean;
  onFocus: (item: Item) => void;
  onSelect?: (item: Item) => void;
}

export function Card({ item, shape, autoFocus, onFocus, onSelect }: Props) {
  return (
    <button
      className={`card card--${shape}`}
      data-focusable
      data-autofocus={autoFocus ? '' : undefined}
      onFocus={() => onFocus(item)}
      onClick={() => onSelect?.(item)}
    >
      <span className="card__glow">
      <span className="card__frame">
        <span className="card__art" style={{ '--hue': item.hue } as CSSProperties}>
          <span className="card__glyph">{item.glyph}</span>
          {item.badge && <span className={`badge badge--${item.badge.toLowerCase()}`}>{item.badge}</span>}
          {shape === 'tile' && <span className="card__tilename">{item.title}</span>}
          {item.progress !== undefined && (
            <span className="card__progress">
              <span style={{ width: `${item.progress * 100}%` }} />
            </span>
          )}
        </span>
      </span>
      </span>
      {shape !== 'tile' && (
        <>
          <span className="card__title">{item.title}</span>
          <span className="card__sub">{item.subtitle}</span>
        </>
      )}
    </button>
  );
}
