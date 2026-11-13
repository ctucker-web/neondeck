import { routes, type Route } from '../routes';

export function Rail({ current, onSelect }: { current: Route; onSelect: (r: Route) => void }) {
  return (
    <nav className="rail" aria-label="Main" data-nav-group>
      <div className="rail__logo" aria-hidden="true">
        N<span>D</span>
      </div>
      {routes.map((r) => (
        <button
          key={r.id}
          className="rail__item"
          data-focusable
          data-noscroll
          aria-current={r.id === current ? 'page' : undefined}
          onClick={() => onSelect(r.id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={r.icon} />
          </svg>
          <span>{r.label}</span>
        </button>
      ))}
    </nav>
  );
}
