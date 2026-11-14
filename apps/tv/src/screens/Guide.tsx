import { useMemo, useRef, useState } from 'react';
import type { Channel, Programme } from '@neondeck/core';
import { useLiveTv } from '../livetv/store';

const HOURS = 6;
const SLOT = 30 * 60_000;
const REM_PER_MIN = 0.42;
const MAX_ROWS = 150;

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

interface Focused {
  channel: Channel;
  programme?: Programme;
}

export function GuideScreen({ onWatch }: { onWatch: (channelId: string) => void }) {
  const tv = useLiveTv();
  // The grid starts at the last half hour and stays put while you browse.
  const start = useMemo(() => Math.floor(Date.now() / SLOT) * SLOT, []);
  const end = start + HOURS * 3_600_000;
  const width = (t: number) => `${((t - start) / 60_000) * REM_PER_MIN}rem`;
  const [focused, setFocused] = useState<Focused | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  // Keep the focused row in view, and scroll sideways only as far as needed
  // to show where the focused programme starts (never away from "now" for a
  // channel with no guide data).
  const reveal = (el: HTMLElement, isProgramme: boolean) => {
    const g = grid.current;
    if (!g) return;
    el.parentElement?.parentElement?.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    g.scrollLeft = isProgramme ? Math.max(0, el.offsetLeft - 3 * rem) : 0;
  };
  const now = Date.now();
  const slots = Array.from({ length: HOURS * 2 }, (_, i) => start + i * SLOT);
  const channels = tv.channels.slice(0, MAX_ROWS);

  return (
    <div className="guide">
      <div className="guide__info">
        {focused ? (
          <>
            <p className="panel__kicker">{focused.channel.number} · {focused.channel.name}</p>
            <h1>{focused.programme?.title ?? 'No guide data for this channel'}</h1>
            <p className="guide__when">{focused.programme ? `${clock(focused.programme.start)} – ${clock(focused.programme.stop)}` : 'Press OK to watch'}</p>
            {focused.programme?.desc && <p className="guide__desc">{focused.programme.desc}</p>}
          </>
        ) : (
          <p className="apps__empty">{tv.channels.length ? 'Choose a programme. Press OK to watch that channel.' : tv.loading ? 'Loading channels…' : 'No channels yet. Add a source in Live TV.'}</p>
        )}
      </div>

      <div className="guide__grid" ref={grid}>
        <div className="guide__times" style={{ width: `calc(15rem + ${width(end)})` }}>
          <span className="guide__corner">{new Date(start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          {slots.map((t) => (
            <span key={t} className="guide__time" style={{ width: width(start + SLOT) }}>{clock(t)}</span>
          ))}
        </div>
        {channels.map((c, row) => {
          const list = (tv.guide.get(c.tvgId ?? '') ?? []).filter((p) => p.stop > start && p.start < end);
          return (
            <div className="guide__row" key={c.id} style={{ width: `calc(15rem + ${width(end)})` }}>
              <div className="guide__chan"><b>{c.number}</b> {c.name}</div>
              <div className="guide__track">
                {list.length === 0 && (
                  <button className="guide__cell guide__cell--empty" style={{ left: 0, width: width(end) }} data-focusable data-noscroll data-autofocus={row === 0 ? '' : undefined} onFocus={(e) => { setFocused({ channel: c }); reveal(e.currentTarget, false); }} onClick={() => onWatch(c.id)}>
                    No guide data · press OK to watch
                  </button>
                )}
                {list.map((p, i) => {
                  const from = Math.max(p.start, start);
                  const to = Math.min(p.stop, end);
                  const live = p.start <= now && now < p.stop;
                  return (
                    <button
                      key={`${p.start}-${i}`}
                      className={`guide__cell${live ? ' guide__cell--live' : ''}`}
                      style={{ left: width(from), width: width(start + (to - from)) }}
                      data-focusable
                      data-noscroll
                      data-autofocus={row === 0 && live ? '' : undefined}
                      onFocus={(e) => { setFocused({ channel: c, programme: p }); reveal(e.currentTarget, true); }}
                      onClick={() => onWatch(c.id)}
                    >
                      {p.title}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {tv.channels.length > MAX_ROWS && <p className="apps__empty">Showing the first {MAX_ROWS} channels.</p>}
      </div>
    </div>
  );
}
