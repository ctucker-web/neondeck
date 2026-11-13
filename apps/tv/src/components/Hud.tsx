import { useEffect, useState } from 'react';
import { status } from '../data/mock';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function Hud({ section }: { section: string }) {
  const now = useClock();
  const { network, tuners, storage, profile } = status;
  const pct = Math.round((storage.usedTb / storage.totalTb) * 100);

  return (
    <header className="hud">
      <div className="hud__brand">
        NEON<span>DECK</span>
        <span className="hud__section">// {section}</span>
      </div>
      <dl className="hud__readouts">
        <div>
          <dt>Net</dt>
          <dd>
            <i className="dot dot--ok" /> {network.label} {network.detail}
          </dd>
        </div>
        <div>
          <dt>Tuner</dt>
          <dd>
            <i className="dot dot--rec" /> {tuners.inUse}/{tuners.total} {tuners.state}
          </dd>
        </div>
        <div>
          <dt>Storage</dt>
          <dd>
            <span className="meter" role="img" aria-label={`${pct}% used`}>
              <span style={{ width: `${pct}%` }} />
            </span>
            {storage.usedTb.toFixed(1)}/{storage.totalTb.toFixed(1)} TB
          </dd>
        </div>
        <div className="hud__clock">
          <dt>{now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</dt>
          <dd>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</dd>
        </div>
        <div className="hud__profile" aria-label={`Profile ${profile}`}>
          {profile}
        </div>
      </dl>
    </header>
  );
}
