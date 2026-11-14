import { useEffect, useState } from 'react';
import { useLiveTv } from '../livetv/store';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/** Status readouts. Every value here is measured, not decorative. */
export function Hud({ section }: { section: string }) {
  const now = useClock();
  const online = useOnline();
  const tv = useLiveTv();

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
            <i className={`dot ${online ? 'dot--ok' : 'dot--rec'}`} /> {online ? 'ONLINE' : 'OFFLINE'}
          </dd>
        </div>
        <div>
          <dt>Channels</dt>
          <dd>{tv.loading ? 'LOADING' : tv.channels.length}</dd>
        </div>
        {tv.current && (
          <div>
            <dt>Tuned</dt>
            <dd>
              CH {tv.current.number}
              {tv.tuneMs !== null && ` · ${tv.tuneMs} MS`}
            </dd>
          </div>
        )}
        <div className="hud__clock">
          <dt>{now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</dt>
          <dd>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</dd>
        </div>
      </dl>
    </header>
  );
}
