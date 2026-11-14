import type { RouteDef } from '../routes';

export function Placeholder({ def, onBack }: { def: RouteDef; onBack: () => void }) {
  return (
    <div className="placeholder">
      <div className="panel">
        <p className="panel__kicker">Not built yet</p>
        <h1>{def.label}</h1>
        <p>This section is planned but does not exist yet, so there is nothing to open here. Live TV, Guide, and Apps are working.</p>
        <button className="btn" data-focusable data-autofocus="" onClick={onBack}>
          Back to Home
        </button>
      </div>
    </div>
  );
}
