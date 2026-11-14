import { describe, expect, it } from 'vitest';
import {
  addSource, buildChannels, defaultLiveTvConfig, indexGuide, normalizeLiveTvConfig, nowAndNext, parseM3u, parseXmltv,
  parseXmltvTime, recordTune, removeSource, setSourceEnabled, stepChannel, streamKind, toggleFavorite, xtreamUrls,
} from '../src';

const M3U = `﻿#EXTM3U url-tvg="http://example.com/guide.xml"
#EXTINF:-1 tvg-id="news.one" tvg-name="News One" tvg-logo="http://example.com/n1.png" group-title="News" tvg-chno="5",News One HD
#EXTVLCOPT:http-user-agent=Example
http://example.com/live/news1.m3u8

#EXTINF:-1 group-title="Movies, Classic",Film "Vault", The
https://example.com/film.m3u8
#EXTINF:-1,Plain Channel
#EXTGRP:Local
http://example.com/plain.ts
#EXTINF:-1,Broken entry with no address
#EXTINF:-1,Not a stream
/relative/path.m3u8
#EXTINF:0 tvg-id="" tvg-name="Named By Attribute",
http://example.com/attr.m3u8
`;

describe('parseM3u', () => {
  const entries = parseM3u(M3U);

  it('reads attributes, name, and address', () => {
    expect(entries[0]).toEqual({
      name: 'News One HD', url: 'http://example.com/live/news1.m3u8', group: 'News',
      logo: 'http://example.com/n1.png', tvgId: 'news.one', number: 5,
    });
  });
  it('handles commas and quotes inside attributes and names', () => {
    expect(entries[1].group).toBe('Movies, Classic');
    expect(entries[1].name).toBe('Film "Vault", The');
  });
  it('uses #EXTGRP when there is no group-title', () => {
    expect(entries[2]).toMatchObject({ name: 'Plain Channel', group: 'Local', url: 'http://example.com/plain.ts' });
  });
  it('skips entries without a usable address and falls back to tvg-name', () => {
    expect(entries.map((e) => e.name)).toEqual(['News One HD', 'Film "Vault", The', 'Plain Channel', 'Named By Attribute']);
  });
  it('accepts Windows line endings and empty input', () => {
    expect(parseM3u('#EXTM3U\r\n#EXTINF:-1,A\r\nhttp://a.example/x.m3u8\r\n')).toHaveLength(1);
    expect(parseM3u('')).toEqual([]);
    expect(parseM3u('<html>not a playlist</html>')).toEqual([]);
  });
});

describe('buildChannels', () => {
  it('keeps given numbers, fills the rest without collisions, and makes ids unique', () => {
    const ch = buildChannels('src', [
      { name: 'A', url: 'http://x/a' },
      { name: 'B', url: 'http://x/b', number: 101 },
      { name: 'A', url: 'http://x/a2' },
      { name: 'C', url: 'http://x/c', tvgId: 'c.id' },
    ], 100, 'Other');
    expect(ch.map((c) => c.number)).toEqual([100, 101, 102, 103]);
    expect(ch.map((c) => c.id)).toEqual(['src:A', 'src:B', 'src:A#2', 'src:c.id']);
    expect(ch[0].group).toBe('Other');
  });
});

describe('xtreamUrls', () => {
  it('builds playlist and guide addresses and encodes credentials', () => {
    expect(xtreamUrls({ server: 'tv.example.com:8080/', username: 'me', password: 'p&ss word' })).toEqual({
      playlist: 'http://tv.example.com:8080/get.php?username=me&password=p%26ss%20word&type=m3u_plus&output=m3u8',
      epg: 'http://tv.example.com:8080/xmltv.php?username=me&password=p%26ss%20word',
    });
  });
  it('rejects incomplete accounts', () => {
    expect(xtreamUrls({ server: 'tv.example.com', username: '', password: 'x' })).toBeNull();
    expect(xtreamUrls({ server: 'http://', username: 'a', password: 'b' })).toBeNull();
  });
});

const XMLTV = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="news.one"><display-name>News One</display-name></channel>
  <programme start="20261114180000 +0000" stop="20261114190000 +0000" channel="news.one">
    <title lang="en">Evening Report &amp; Weather</title>
    <desc lang="en"><![CDATA[Headlines <live> from the desk.]]></desc>
  </programme>
  <programme start="20261114110000 -0800" stop="20261114113000 -0800" channel="news.one">
    <title>Late Edition</title>
  </programme>
  <programme start="20261114170000 +0000" stop="20261114180000 +0000" channel="other">
    <title>Caf&#233; Hour</title>
  </programme>
  <programme start="garbage" stop="20261114180000 +0000" channel="other"><title>Bad</title></programme>
  <programme start="20261114180000 +0000" stop="20261114170000 +0000" channel="other"><title>Backwards</title></programme>
</tv>`;

describe('XMLTV', () => {
  it('parses times with and without zones', () => {
    expect(parseXmltvTime('20261114180000 +0000')).toBe(Date.UTC(2026, 10, 14, 18));
    expect(parseXmltvTime('20261114110000 -0800')).toBe(Date.UTC(2026, 10, 14, 19));
    expect(parseXmltvTime('202611141800')).toBe(Date.UTC(2026, 10, 14, 18));
    expect(parseXmltvTime('soon')).toBeNull();
  });
  it('parses programmes, decodes text, sorts, and drops bad entries', () => {
    const p = parseXmltv(XMLTV);
    expect(p.map((x) => x.title)).toEqual(['Café Hour', 'Evening Report & Weather', 'Late Edition']);
    expect(p[1].desc).toBe('Headlines <live> from the desk.');
    expect(p[2].start).toBe(Date.UTC(2026, 10, 14, 19));
  });
  it('keeps only the requested window', () => {
    const p = parseXmltv(XMLTV, { from: Date.UTC(2026, 10, 14, 19), to: Date.UTC(2026, 10, 14, 20) });
    expect(p.map((x) => x.title)).toEqual(['Late Edition']);
  });
  it('finds what is on now and next', () => {
    const guide = indexGuide(parseXmltv(XMLTV));
    const at = Date.UTC(2026, 10, 14, 18, 30);
    expect(nowAndNext(guide.get('news.one'), at).now?.title).toBe('Evening Report & Weather');
    expect(nowAndNext(guide.get('news.one'), at).next?.title).toBe('Late Edition');
    expect(nowAndNext(guide.get('other'), at)).toEqual({ next: undefined });
    expect(nowAndNext(undefined, at)).toEqual({});
  });
});

describe('tuning and config', () => {
  const ch = buildChannels('s', [{ name: 'A', url: 'http://x/a' }, { name: 'B', url: 'http://x/b' }, { name: 'C', url: 'http://x/c' }], 1, 'G');

  it('steps through channels and wraps', () => {
    expect(stepChannel(ch, 's:A', 1)?.name).toBe('B');
    expect(stepChannel(ch, 's:A', -1)?.name).toBe('C');
    expect(stepChannel(ch, 's:C', 1)?.name).toBe('A');
    expect(stepChannel(ch, 'gone', 1)?.name).toBe('A');
    expect(stepChannel([], 's:A', 1)).toBeUndefined();
  });
  it('remembers the previous channel for recall', () => {
    let c = recordTune(defaultLiveTvConfig(), 's:A');
    c = recordTune(c, 's:B');
    c = recordTune(c, 's:B');
    expect([c.lastChannel, c.previousChannel]).toEqual(['s:B', 's:A']);
  });
  it('toggles favorites', () => {
    let c = toggleFavorite(defaultLiveTvConfig(), 's:A');
    expect(c.favorites).toEqual(['s:A']);
    c = toggleFavorite(c, 's:A');
    expect(c.favorites).toEqual([]);
  });
  it('adds, disables, and removes sources; the starter pack cannot be deleted', () => {
    let c = addSource(defaultLiveTvConfig(), { name: 'My List', kind: 'm3u', url: 'http://x/list.m3u' });
    c = addSource(c, { name: 'My List', kind: 'm3u', url: 'http://x/list2.m3u' });
    expect(c.sources.map((s) => s.id)).toEqual(['starter', 'my-list', 'my-list-2']);
    c = toggleFavorite(c, 'my-list:A');
    c = removeSource(c, 'my-list');
    expect(c.favorites).toEqual([]);
    c = removeSource(setSourceEnabled(c, 'starter', false), 'starter');
    expect(c.sources.find((s) => s.id === 'starter')?.enabled).toBe(false);
  });
  it('repairs malformed config', () => {
    expect(normalizeLiveTvConfig('nope')).toEqual(defaultLiveTvConfig());
    const c = normalizeLiveTvConfig({ sources: [{ id: 'x', name: 'X', kind: 'm3u' }, { id: 'y', name: 'Y', kind: 'm3u', url: 'http://y' }], favorites: [1, 'a'] });
    expect(c.sources.map((s) => s.id)).toEqual(['starter', 'y']);
    expect(c.favorites).toEqual(['a']);
  });
  it('picks a player by address', () => {
    expect(streamKind('https://x/live/master.m3u8?token=1')).toBe('hls');
    expect(streamKind('http://x:8080/live/user/pass/1234.ts')).toBe('mpegts');
    expect(streamKind('http://x:8080/user/pass/1234')).toBe('mpegts');
    expect(streamKind('https://x/clip.mp4')).toBe('native');
  });
});
