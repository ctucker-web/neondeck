import type { CSSProperties } from 'react';
import type { Item } from '../types';

export function Hero({ item }: { item: Item }) {
  return (
    <section className="hero" aria-live="polite">
      <div className="hero__art" style={{ '--hue': item.hue } as CSSProperties}>
        <span>{item.glyph}</span>
      </div>
      {/* key restarts the flicker animation when the focused item changes */}
      <div className="hero__body" key={item.id}>
        <p className="hero__kicker">
          {item.badge && <span className={`badge badge--${item.badge.toLowerCase()}`}>{item.badge}</span>}
          {item.subtitle}
        </p>
        <h1>{item.title}</h1>
        <ul className="hero__meta">
          {item.meta.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <p className="hero__synopsis">{item.synopsis}</p>
      </div>
    </section>
  );
}
