// Live TV state: sources, the merged channel list, guide data, and tuning.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  STARTER_SOURCE_ID, addSource, buildChannels, defaultLiveTvConfig, indexGuide, normalizeLiveTvConfig, parseM3u,
  parseXmltv, recordTune, removeSource, setSourceEnabled, stepChannel, toggleFavorite, xtreamUrls,
  type Channel, type LiveTvConfig, type M3uEntry, type Programme, type Source, type XtreamAccount,
} from '@neondeck/core';
import starterPack from '@neondeck/core/src/starter-pack.json';
import { platform } from '../platform/bridge';

export interface SourceStatus {
  state: 'loading' | 'ok' | 'error';
  channels: number;
  message?: string;
}

interface LiveTvContext {
  config: LiveTvConfig;
  channels: Channel[];
  guide: Map<string, Programme[]>;
  status: Record<string, SourceStatus>;
  loading: boolean;
  current: Channel | undefined;
  tuneMs: number | null;
  setTuneMs: (ms: number | null) => void;
  /** True when another screen asked to go straight to fullscreen. */
  wantFullscreen: boolean;
  clearWantFullscreen: () => void;
  tune: (id: string, fullscreen?: boolean) => void;
  zap: (delta: number, within?: Channel[]) => void;
  recall: () => void;
  toggleFav: (id: string) => void;
  addM3u: (name: string, url: string, epgUrl?: string) => void;
  addXtream: (name: string, account: XtreamAccount) => void;
  remove: (id: string) => void;
  setEnabled: (id: string, on: boolean) => void;
  reload: () => void;
}

const Ctx = createContext<LiveTvContext | null>(null);

export function useLiveTv(): LiveTvContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLiveTv must be used inside <LiveTvProvider>');
  return ctx;
}

const HOUR = 3_600_000;

function errorText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
}

async function loadSource(source: Source): Promise<{ entries: M3uEntry[]; programmes: Programme[]; guideError?: string }> {
  let entries: M3uEntry[];
  let epgUrl = source.epgUrl;

  if (source.kind === 'starter') {
    entries = (starterPack.channels as { name: string; group: string; url: string }[]).map((c) => ({ name: c.name, group: c.group, url: c.url }));
  } else {
    let playlistUrl = source.url;
    if (source.kind === 'xtream') {
      const urls = source.xtream ? xtreamUrls(source.xtream) : null;
      if (!urls) throw new Error('The account details are incomplete.');
      playlistUrl = urls.playlist;
      epgUrl = epgUrl || urls.epg;
    }
    const text = await platform.fetchText(playlistUrl!);
    entries = parseM3u(text);
    if (entries.length === 0) throw new Error('No channels were found at that address. Is it an M3U playlist?');
    // Many playlists name their guide in the header line.
    epgUrl = epgUrl || /^#EXTM3U[^\n]*?(?:url-tvg|x-tvg-url)="([^"]+)"/.exec(text.trimStart())?.[1]?.split(',')[0];
  }

  let programmes: Programme[] = [];
  let guideError: string | undefined;
  if (epgUrl) {
    try {
      const now = Date.now();
      programmes = parseXmltv(await platform.fetchText(epgUrl), { from: now - 2 * HOUR, to: now + 24 * HOUR });
    } catch (e) {
      guideError = `Channels loaded, but the guide did not: ${errorText(e)}`;
    }
  }
  return { entries, programmes, guideError };
}

export function LiveTvProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<LiveTvConfig>(defaultLiveTvConfig);
  const [ready, setReady] = useState(false);
  const [bySource, setBySource] = useState<Record<string, { channels: Channel[]; programmes: Programme[] }>>({});
  const [status, setStatus] = useState<Record<string, SourceStatus>>({});
  const [currentId, setCurrentId] = useState<string>();
  const [tuneMs, setTuneMs] = useState<number | null>(null);
  const [wantFullscreen, setWantFullscreen] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    void platform.readConfig('livetv').then(
      (raw) => { setConfig(normalizeLiveTvConfig(raw)); setReady(true); },
      () => setReady(true),
    );
  }, []);

  const update = useCallback((fn: (c: LiveTvConfig) => LiveTvConfig) => {
    setConfig((prev) => {
      const next = fn(prev);
      if (next !== prev) void platform.writeConfig('livetv', next);
      return next;
    });
  }, []);

  // Reload whenever the set of enabled sources changes (not on favorites or tuning).
  const sourcesKey = JSON.stringify(config.sources);
  useEffect(() => {
    if (!ready) return;
    const mine = ++generation.current;
    const enabled = config.sources.filter((s) => s.enabled);
    setStatus(Object.fromEntries(enabled.map((s) => [s.id, { state: 'loading', channels: 0 } as SourceStatus])));
    setBySource({});

    // Sources load independently so one slow or broken list never blocks the rest.
    enabled.forEach((source, index) => {
      loadSource(source).then(
        ({ entries, programmes, guideError }) => {
          if (generation.current !== mine) return;
          // Each source gets its own block of channel numbers: 1+, 1001+, 2001+ ...
          const channels = buildChannels(source.id, entries, index * 1000 + 1, source.name);
          setBySource((prev) => ({ ...prev, [source.id]: { channels, programmes } }));
          setStatus((prev) => ({ ...prev, [source.id]: { state: 'ok', channels: channels.length, message: guideError } }));
        },
        (e) => {
          if (generation.current !== mine) return;
          setStatus((prev) => ({ ...prev, [source.id]: { state: 'error', channels: 0, message: errorText(e) } }));
        },
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sourcesKey, reloadTick]);

  const channels = useMemo(
    () => config.sources.flatMap((s) => bySource[s.id]?.channels ?? []).sort((a, b) => a.number - b.number),
    [bySource, config.sources],
  );
  const guide = useMemo(() => indexGuide(Object.values(bySource).flatMap((s) => s.programmes)), [bySource]);
  const current = useMemo(() => channels.find((c) => c.id === currentId), [channels, currentId]);

  const tune = useCallback(
    (id: string, fullscreen = false) => {
      setTuneMs(null);
      setCurrentId(id);
      if (fullscreen) setWantFullscreen(true);
      update((c) => recordTune(c, id));
    },
    [update],
  );

  const value: LiveTvContext = {
    config, channels, guide, status,
    loading: Object.values(status).some((s) => s.state === 'loading'),
    current, tuneMs, setTuneMs, wantFullscreen,
    clearWantFullscreen: () => setWantFullscreen(false),
    tune,
    zap: (delta, within) => {
      const next = stepChannel(within?.length ? within : channels, currentId, delta);
      if (next) tune(next.id);
    },
    recall: () => {
      const target = currentId === config.lastChannel ? config.previousChannel : config.lastChannel;
      if (target && channels.some((c) => c.id === target)) tune(target);
    },
    toggleFav: (id) => update((c) => toggleFavorite(c, id)),
    addM3u: (name, url, epgUrl) => update((c) => addSource(c, { name, kind: 'm3u', url, epgUrl: epgUrl || undefined })),
    addXtream: (name, account) => update((c) => addSource(c, { name, kind: 'xtream', xtream: account })),
    remove: (id) => update((c) => removeSource(c, id)),
    setEnabled: (id, on) => update((c) => setSourceEnabled(c, id, on)),
    reload: () => setReloadTick((t) => t + 1),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { STARTER_SOURCE_ID };
