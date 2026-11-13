import type { RouteDef } from '../routes';

export function Placeholder({ def, onBack }: { def: RouteDef; onBack: () => void }) {
  return (
    <div className="placeholder">
      <div className="panel">
        <p className="panel__kicker">Module offline</p>
        <h1>{def.label}</h1>
        <p>This screen arrives in milestone {def.milestone}. Navigation, focus, and theming already work here.</p>
        <button className="btn" data-focusable data-autofocus="" onClick={onBack}>
          Back to Home
        </button>
      </div>
    </div>
  );
}
