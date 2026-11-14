import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STARTER_SOURCE_ID, normalizeUrl, nowAndNext, type Channel } from '@neondeck/core';
import { OskForm } from '../components/OskForm';
import { Player } from '../livetv/Player';
import { useLiveTv } from '../livetv/store';
import { useApps } from '../apps/store';

const FAVORITES = '★ Favorites';
const ALL = 'All';
/** Rendering tens of thousands of rows would stall the TV; show a page and filter by group. */
const MAX_ROWS = 400;

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function LiveTvScreen() {
  const tv = useLiveTv();
  const { notify } = useApps();
  const [group, setGroup] = useState(ALL);
  const [view, setView] = useState<'watch' | 'sources' | 'add-m3u' | 'add-xtream'>('watch');
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState(false);
  const [digits, setDigits] = useState('');
  const surface = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // Each view replaces the controls that had focus, so move focus into the new view.
  const main = useRef<HTMLDivElement>(null);
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    const target = main.current?.querySelector<HTMLElement>('[data-autofocus]') ?? main.current?.querySelector<HTMLElement>('[data-focusable]:not([disabled])');
    target?.focus();
  }, [view]);

  const groups = useMemo(() => {
    const names = [...new Set(tv.channels.map((c) => c.group))];
    return [ALL, ...(tv.config.favorites.length ? [FAVORITES] : []), ...names];
  }, [tv.channels, tv.config.favorites.length]);

  const list = useMemo(() => {
    if (group === ALL) return tv.channels;
    if (group === FAVORITES) return tv.channels.filter((c) => tv.config.favorites.includes(c.id));
    return tv.channels.filter((c) => c.group === group);
  }, [tv.channels, tv.config.favorites, group]);

  useEffect(() => {
    if (!groups.includes(group)) setGroup(ALL);
  }, [groups, group]);

  // Resume the last channel when the screen opens.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || tv.current || tv.channels.length === 0) return;
    resumed.current = true;
    const last = tv.channels.find((c) => c.id === tv.config.lastChannel);
    if (last) tv.tune(last.id);
  }, [tv]);

  useEffect(() => setError(null), [tv.current?.id]);

  const enterFullscreen = useCallback(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setFullscreen(true);
  }, []);
  const exitFullscreen = useCallback(() => {
    setFullscreen(false);
    setTimeout(() => (returnFocus.current?.isConnected ? returnFocus.current.focus() : document.querySelector<HTMLElement>('.chan--current')?.focus()), 0);
  }, []);

  useEffect(() => {
    if (tv.wantFullscreen && tv.current) {
      tv.clearWantFullscreen();
      enterFullscreen();
    }
  }, [tv, enterFullscreen]);

  useEffect(() => {
    if (fullscreen) surface.current?.focus();
  }, [fullscreen]);

  // Show the channel banner for a few seconds after every tune.
  useEffect(() => {
    if (!fullscreen) return;
    setBanner(true);
    const t = setTimeout(() => setBanner(false), 4500);
    return () => clearTimeout(t);
  }, [fullscreen, tv.current?.id]);

  // Number entry: digits collect for a moment, then tune to that channel.
  useEffect(() => {
    if (!digits) return;
    const t = setTimeout(() => {
      const target = tv.channels.find((c) => c.number === Number(digits));
      if (target) tv.tune(target.id);
      else notify(`There is no channel ${digits}.`);
      setDigits('');
    }, 1500);
    return () => clearTimeout(t);
  }, [digits, tv, notify]);

  const onSurfaceKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === 'ArrowUp') tv.zap(1, list);
    else if (k === 'ArrowDown') tv.zap(-1, list);
    else if (k === 'ArrowLeft') tv.recall();
    else if (k === 'ArrowRight') setBanner((b) => !b);
    else if (k === 'Escape' || k === 'Backspace') exitFullscreen();
    else if (/^\d$/.test(k)) setDigits((d) => (d + k).slice(0, 5));
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const selectChannel = (c: Channel) => {
    if (tv.current?.id === c.id) enterFullscreen();
    else tv.tune(c.id);
  };

  const cur = tv.current;
  const prog = cur ? nowAndNext(tv.guide.get(cur.tvgId ?? ''), Date.now()) : {};
  const nothingLoaded = tv.channels.length === 0;

  const info = cur && (
    <div className="player__info">
      <span className="player__num">{cur.number}</span>
      <div>
        <p className="player__name">{cur.name}</p>
        <p className="player__now">
          {prog.now ? `${prog.now.title} · until ${clock(prog.now.stop)}` : cur.group}
          {prog.next ? `  ›  Next: ${prog.next.title}` : ''}
        </p>
      </div>
      <span className="player__tune">{error ? 'NO SIGNAL' : tv.tuneMs === null ? 'TUNING…' : `TUNED IN ${tv.tuneMs} MS`}</span>
    </div>
  );

  return (
    <div className="live">
      <div className="live__list">
        <div className="tabs tabs--scroll">
          {groups.map((g) => (
            <button key={g} className="tab" role="tab" aria-selected={g === group} data-focusable onClick={() => setGroup(g)}>
              {g}
            </button>
          ))}
        </div>
        <div className="chans">
          {list.slice(0, MAX_ROWS).map((c, i) => {
            const fav = tv.config.favorites.includes(c.id);
            const p = nowAndNext(tv.guide.get(c.tvgId ?? ''), Date.now()).now;
            return (
              <div className="chan-row" key={c.id}>
                <button className={`chan${cur?.id === c.id ? ' chan--current' : ''}`} data-focusable data-autofocus={i === 0 ? '' : undefined} onClick={() => selectChannel(c)}>
                  <span className="chan__num">{c.number}</span>
                  <span className="chan__name">{c.name}</span>
                  <span className="chan__now">{p?.title ?? c.group}</span>
                </button>
                <button className={`chan-fav${fav ? ' chan-fav--on' : ''}`} data-focusable aria-label={fav ? `Remove ${c.name} from favorites` : `Add ${c.name} to favorites`} onClick={() => tv.toggleFav(c.id)}>
                  ★
                </button>
              </div>
            );
          })}
          {list.length > MAX_ROWS && <p className="apps__empty">Showing the first {MAX_ROWS} of {list.length}. Pick a group above to narrow the list.</p>}
          {nothingLoaded && <p className="apps__empty">{tv.loading ? 'Loading channels…' : 'No channels yet. Choose Sources to add a playlist.'}</p>}
        </div>
      </div>

      <div className="live__main" ref={main}>
        {view === 'watch' && (
          <>
            <div className={`player${fullscreen ? ' player--full' : ''}`} data-nav-modal={fullscreen ? '' : undefined}>
              {cur ? (
                <Player key={cur.id} url={cur.url} onPlaying={tv.setTuneMs} onError={setError} />
              ) : (
                <p className="player__idle">{nothingLoaded ? 'Add a source to start watching.' : 'Choose a channel.'}</p>
              )}
              {error && <p className="player__error">{error}</p>}
              {fullscreen && (
                <button ref={surface} className="player__surface" data-focusable data-noscroll onKeyDown={onSurfaceKey} onClick={() => setBanner((b) => !b)} aria-label="Player. Up and down change channel, left recalls the last channel, back exits." />
              )}
              {fullscreen && (banner || error) && <div className="player__banner">{info}<p className="player__keys">▲▼ channel · ◀ last channel · 0–9 channel number · Back to exit</p></div>}
              {fullscreen && digits && <div className="player__digits">{digits}</div>}
            </div>
            {!fullscreen && info}
            <div className="live__actions">
              <button className="btn" data-focusable disabled={!cur} onClick={enterFullscreen}>Fullscreen</button>
              <button className="btn" data-focusable disabled={!tv.config.previousChannel} onClick={tv.recall}>Last channel</button>
              <button className="btn" data-focusable data-autofocus={nothingLoaded && !tv.loading ? '' : undefined} onClick={() => setView('sources')}>Sources</button>
            </div>
          </>
        )}

        {view === 'sources' && (
          <div className="rows">
            <h2 className="rows__head">Sources</h2>
            {tv.config.sources.map((s) => {
              const st = tv.status[s.id];
              const detail = !s.enabled ? 'Off' : !st ? '' : st.state === 'loading' ? 'Loading…' : st.state === 'error' ? st.message : `${st.channels} channels${st.message ? ` · ${st.message}` : ''}`;
              return (
                <div className="source" key={s.id}>
                  <div className="source__text">
                    <p className="opt__label">{s.name}</p>
                    <p className={`opt__hint${st?.state === 'error' ? ' source__error' : ''}`}>{detail}</p>
                  </div>
                  <button className="btn" data-focusable onClick={() => tv.setEnabled(s.id, !s.enabled)}>{s.enabled ? 'Turn off' : 'Turn on'}</button>
                  {s.id !== STARTER_SOURCE_ID && <button className="btn btn--danger" data-focusable onClick={() => tv.remove(s.id)}>Remove</button>}
                </div>
              );
            })}
            <div className="live__actions">
              <button className="btn" data-focusable data-autofocus="" onClick={() => setView('add-m3u')}>Add M3U playlist</button>
              <button className="btn" data-focusable onClick={() => setView('add-xtream')}>Add Xtream account</button>
              <button className="btn" data-focusable onClick={tv.reload}>Reload all</button>
              <button className="btn" data-focusable onClick={() => setView('watch')}>Done</button>
            </div>
            <p className="settings__note">Starter channels are the broadcasters’ own free public streams. Add your own playlists for anything else; NEONDECK ships no other streams.</p>
          </div>
        )}

        {view === 'add-m3u' && (
          <OskForm
            fields={[
              { key: 'name', label: 'Name', placeholder: 'My playlist' },
              { key: 'url', label: 'Playlist address', placeholder: 'example.com/list.m3u' },
              { key: 'epg', label: 'Guide address (optional)', placeholder: 'example.com/guide.xml' },
            ]}
            submitLabel="Add playlist"
            onCancel={() => setView('sources')}
            onSubmit={(v) => {
              const url = normalizeUrl(v.url);
              const epg = v.epg.trim() ? normalizeUrl(v.epg) : undefined;
              if (!url) return notify('That playlist address does not look like a web link.');
              if (epg === null) return notify('That guide address does not look like a web link.');
              tv.addM3u(v.name.trim() || 'My playlist', url, epg);
              setView('sources');
            }}
          />
        )}

        {view === 'add-xtream' && (
          <OskForm
            fields={[
              { key: 'name', label: 'Name', placeholder: 'My provider' },
              { key: 'server', label: 'Server', placeholder: 'example.com:8080' },
              { key: 'username', label: 'Username', placeholder: 'username' },
              { key: 'password', label: 'Password', placeholder: 'password', secret: true },
            ]}
            submitLabel="Add account"
            onCancel={() => setView('sources')}
            onSubmit={(v) => {
              if (!v.server.trim() || !v.username || !v.password) return notify('Server, username, and password are all needed.');
              tv.addXtream(v.name.trim() || 'My provider', { server: v.server.trim(), username: v.username, password: v.password });
              setView('sources');
            }}
          />
        )}
      </div>
    </div>
  );
}
