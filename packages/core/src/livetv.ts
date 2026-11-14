// Live TV model and source parsers: M3U playlists, Xtream-style accounts,
// and XMLTV guide data. Pure functions, no network, tested on any OS.

export interface Channel {
  /** Stable id: "<sourceId>:<tvg-id or name>". */
  id: string;
  sourceId: string;
  name: string;
  url: string;
  group: string;
  number: number;
  logo?: string;
  /** Id used to match XMLTV guide data. */
  tvgId?: string;
}

export interface Programme {
  channel: string;
  start: number; // epoch ms
  stop: number;
  title: string;
  desc?: string;
}

export interface XtreamAccount {
  server: string;
  username: string;
  password: string;
}

export interface Source {
  id: string;
  name: string;
  kind: 'starter' | 'm3u' | 'xtream';
  enabled: boolean;
  url?: string;
  xtream?: XtreamAccount;
  /** Optional XMLTV guide address for this source. */
  epgUrl?: string;
}

export interface LiveTvConfig {
  version: 1;
  sources: Source[];
  favorites: string[];
  lastChannel?: string;
  previousChannel?: string;
}

export const STARTER_SOURCE_ID = 'starter';

export function defaultLiveTvConfig(): LiveTvConfig {
  return {
    version: 1,
    sources: [{ id: STARTER_SOURCE_ID, name: 'Starter channels', kind: 'starter', enabled: true }],
    favorites: [],
  };
}

export function normalizeLiveTvConfig(raw: unknown): LiveTvConfig {
  const base = defaultLiveTvConfig();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<LiveTvConfig>;
  const sources = (Array.isArray(r.sources) ? r.sources : []).filter(
    (s): s is Source =>
      !!s && typeof s.id === 'string' && typeof s.name === 'string' &&
      (s.kind === 'starter' || (s.kind === 'm3u' && typeof s.url === 'string') || (s.kind === 'xtream' && !!s.xtream)),
  );
  if (!sources.some((s) => s.kind === 'starter')) sources.unshift(base.sources[0]);
  return {
    version: 1,
    sources: sources.map((s) => ({ ...s, enabled: s.enabled !== false })),
    favorites: Array.isArray(r.favorites) ? r.favorites.filter((f) => typeof f === 'string') : [],
    lastChannel: typeof r.lastChannel === 'string' ? r.lastChannel : undefined,
    previousChannel: typeof r.previousChannel === 'string' ? r.previousChannel : undefined,
  };
}

// ---------- M3U ----------

export interface M3uEntry {
  name: string;
  url: string;
  group?: string;
  logo?: string;
  tvgId?: string;
  number?: number;
}

const ATTR = /([a-zA-Z0-9-]+)="([^"]*)"/g;

/** Parse an extended M3U playlist. Unknown directives are ignored. */
export function parseM3u(text: string): M3uEntry[] {
  const out: M3uEntry[] = [];
  let pending: Partial<M3uEntry> | null = null;

  for (const rawLine of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF')) {
      const attrs: Record<string, string> = {};
      let attrsEnd = 0;
      for (const m of line.matchAll(ATTR)) {
        attrs[m[1].toLowerCase()] = m[2];
        attrsEnd = m.index + m[0].length;
      }
      // The display name is everything after the first comma that follows
      // the attributes (names may themselves contain commas and quotes).
      const comma = line.indexOf(',', attrsEnd);
      const name = (comma >= 0 ? line.slice(comma + 1) : '').trim() || attrs['tvg-name'] || '';
      const chno = Number(attrs['tvg-chno']);
      pending = {
        name,
        group: attrs['group-title'] || undefined,
        logo: attrs['tvg-logo'] || undefined,
        tvgId: attrs['tvg-id'] || undefined,
        number: Number.isFinite(chno) && chno > 0 ? chno : undefined,
      };
    } else if (line.startsWith('#EXTGRP:')) {
      if (pending && !pending.group) pending.group = line.slice(8).trim() || undefined;
    } else if (line.startsWith('#')) {
      continue;
    } else {
      if (pending?.name && /^(https?|rtmp|rtsp|udp|rtp):\/\//i.test(line)) {
        out.push({ ...pending, name: pending.name, url: line });
      }
      pending = null;
    }
  }
  return out;
}

/** Playlist and guide addresses for an Xtream-style account. */
export function xtreamUrls(account: XtreamAccount): { playlist: string; epg: string } | null {
  let base: URL;
  try {
    base = new URL(/^https?:\/\//i.test(account.server) ? account.server : `http://${account.server}`);
  } catch {
    return null;
  }
  if (!account.username || !account.password) return null;
  const q = `username=${encodeURIComponent(account.username)}&password=${encodeURIComponent(account.password)}`;
  const root = `${base.protocol}//${base.host}`;
  return { playlist: `${root}/get.php?${q}&type=m3u_plus&output=m3u8`, epg: `${root}/xmltv.php?${q}` };
}

/**
 * Turn playlist entries into channels with stable ids and channel numbers.
 * Entries keep their own number when they have one; the rest are numbered
 * from `firstNumber` upward, skipping numbers already taken.
 */
export function buildChannels(sourceId: string, entries: M3uEntry[], firstNumber: number, fallbackGroup: string): Channel[] {
  const taken = new Set(entries.flatMap((e) => (e.number ? [e.number] : [])));
  const ids = new Set<string>();
  let next = firstNumber;
  return entries.map((e) => {
    let number = e.number;
    if (!number) {
      while (taken.has(next)) next++;
      number = next++;
    }
    const key = e.tvgId || e.name;
    let id = `${sourceId}:${key}`;
    for (let n = 2; ids.has(id); n++) id = `${sourceId}:${key}#${n}`;
    ids.add(id);
    return { id, sourceId, name: e.name, url: e.url, group: e.group || fallbackGroup, number, logo: e.logo, tvgId: e.tvgId };
  });
}

// ---------- XMLTV ----------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
      if (ref[0] === '#') {
        const code = ref[1].toLowerCase() === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[ref.toLowerCase()] ?? whole;
    })
    .trim();
}

/** XMLTV time: "YYYYMMDDhhmmss +ZZZZ" (seconds and zone optional; zone defaults to UTC). */
export function parseXmltvTime(value: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/.exec(value.trim());
  if (!m) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  if (!m[7]) return utc;
  const sign = m[7][0] === '-' ? -1 : 1;
  const offset = sign * (+m[7].slice(1, 3) * 60 + +m[7].slice(3, 5)) * 60_000;
  return utc - offset;
}

const PROGRAMME = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;

/**
 * Parse XMLTV guide data. `keep` limits the result to a time window so a
 * week-long guide for thousands of channels doesn't sit in memory.
 */
export function parseXmltv(xml: string, keep?: { from: number; to: number }): Programme[] {
  const out: Programme[] = [];
  for (const m of xml.matchAll(PROGRAMME)) {
    const attrs: Record<string, string> = {};
    for (const a of m[1].matchAll(ATTR)) attrs[a[1].toLowerCase()] = a[2];
    const start = parseXmltvTime(attrs.start ?? '');
    const stop = parseXmltvTime(attrs.stop ?? '');
    if (!attrs.channel || start === null || stop === null || stop <= start) continue;
    if (keep && (stop <= keep.from || start >= keep.to)) continue;
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/.exec(m[2]);
    if (!title) continue;
    const desc = /<desc\b[^>]*>([\s\S]*?)<\/desc>/.exec(m[2]);
    out.push({ channel: decodeXml(attrs.channel), start, stop, title: decodeXml(title[1]), desc: desc ? decodeXml(desc[1]) : undefined });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Group programmes by guide channel id. */
export function indexGuide(programmes: Programme[]): Map<string, Programme[]> {
  const map = new Map<string, Programme[]>();
  for (const p of programmes) {
    const list = map.get(p.channel);
    if (list) list.push(p);
    else map.set(p.channel, [p]);
  }
  return map;
}

export function nowAndNext(list: Programme[] | undefined, at: number): { now?: Programme; next?: Programme } {
  if (!list) return {};
  const i = list.findIndex((p) => p.start <= at && at < p.stop);
  if (i >= 0) return { now: list[i], next: list[i + 1] };
  return { next: list.find((p) => p.start > at) };
}

// ---------- tuning ----------

/** The channel `delta` steps away in list order, wrapping at the ends. */
export function stepChannel(channels: Channel[], currentId: string | undefined, delta: number): Channel | undefined {
  if (channels.length === 0) return undefined;
  const i = channels.findIndex((c) => c.id === currentId);
  if (i < 0) return channels[0];
  return channels[(((i + delta) % channels.length) + channels.length) % channels.length];
}

/** Record a tune so "last channel" can swap back. */
export function recordTune(config: LiveTvConfig, channelId: string): LiveTvConfig {
  if (config.lastChannel === channelId) return config;
  return { ...config, previousChannel: config.lastChannel, lastChannel: channelId };
}

export function toggleFavorite(config: LiveTvConfig, channelId: string): LiveTvConfig {
  const on = config.favorites.includes(channelId);
  return { ...config, favorites: on ? config.favorites.filter((f) => f !== channelId) : [...config.favorites, channelId] };
}

export function addSource(config: LiveTvConfig, source: Omit<Source, 'id' | 'enabled'>): LiveTvConfig {
  const slug = source.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'source';
  const taken = new Set(config.sources.map((s) => s.id));
  let id = slug === STARTER_SOURCE_ID ? `${slug}-2` : slug;
  for (let n = 2; taken.has(id); n++) id = `${slug}-${n}`;
  return { ...config, sources: [...config.sources, { ...source, id, enabled: true }] };
}

export function removeSource(config: LiveTvConfig, id: string): LiveTvConfig {
  // The starter pack can be switched off but not deleted, so it can come back.
  if (id === STARTER_SOURCE_ID) return config;
  return {
    ...config,
    sources: config.sources.filter((s) => s.id !== id),
    favorites: config.favorites.filter((f) => !f.startsWith(`${id}:`)),
  };
}

export function setSourceEnabled(config: LiveTvConfig, id: string, enabled: boolean): LiveTvConfig {
  return { ...config, sources: config.sources.map((s) => (s.id === id ? { ...s, enabled } : s)) };
}

/** How a stream should be played, judged from its address. */
export function streamKind(url: string): 'hls' | 'mpegts' | 'native' {
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (path.endsWith('.m3u8') || path.endsWith('.m3u')) return 'hls';
  if (path.endsWith('.mp4') || path.endsWith('.webm') || path.endsWith('.mp3') || path.endsWith('.aac')) return 'native';
  if (path.endsWith('.ts') || /\/\d+$/.test(path)) return 'mpegts';
  return 'hls';
}
