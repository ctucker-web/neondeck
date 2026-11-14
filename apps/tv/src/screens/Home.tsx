import { useEffect, useRef, useState } from 'react';
import { nowAndNext, pinnedTiles } from '@neondeck/core';
import { useApps } from '../apps/store';
import { AppTile, glyphOf, hueOf } from '../components/AppTile';
import { Card } from '../components/Card';
import { Hero } from '../components/Hero';
import { useLiveTv } from '../livetv/store';
import { focusDefault } from '../nav/spatial';
import type { Route } from '../routes';
import type { Item } from '../types';

const WELCOME: Item = {
  id: 'welcome',
  title: 'NEONDECK',
  subtitle: 'Home',
  meta: ['Arrow keys move', 'Enter selects', 'Esc goes back'],
  synopsis: 'Pick a channel or an app below. Everything on this screen opens something.',
  hue: 190,
  glyph: 'ND',
};

export function Home({ onNavigate, onWatch }: { onNavigate: (r: Route) => void; onWatch: (channelId: string) => void }) {
  const [preview, setPreview] = useState<Item>(WELCOME);
  const apps = useApps();
  const tv = useLiveTv();
  const pinned = pinnedTiles(apps.config, apps.profile);

  const favorites = tv.channels.filter((c) => tv.config.favorites.includes(c.id));
  const liveRow = (favorites.length ? favorites : tv.channels).slice(0, 12);
  const liveItems: Item[] = liveRow.map((c) => {
    const { now, next } = nowAndNext(tv.guide.get(c.tvgId ?? ''), Date.now());
    return {
      id: c.id,
      title: c.name,
      subtitle: now?.title ?? c.group,
      meta: [`Channel ${c.number}`, c.group, ...(next ? [`Next: ${next.title}`] : [])],
      synopsis: now?.desc ?? 'Press OK to watch fullscreen.',
      hue: hueOf(c.name),
      glyph: String(c.number),
      badge: 'LIVE',
      progress: now ? (Date.now() - now.start) / (now.stop - now.start) : undefined,
    };
  });

  // Channels arrive a moment after the screen opens. If the user hasn't
  // moved yet, put focus on the first channel instead of the end of the row.
  const allChannelsTile = useRef<HTMLDivElement>(null);
  const hadChannels = useRef(liveItems.length > 0);
  useEffect(() => {
    if (hadChannels.current || liveItems.length === 0) return;
    hadChannels.current = true;
    const active = document.activeElement;
    if (active === document.body || allChannelsTile.current?.contains(active)) focusDefault();
  }, [liveItems.length]);

  const previewApp = (id: string, name: string, status: string, synopsis: string) =>
    setPreview({ id, title: name, subtitle: 'App', meta: [status], synopsis, hue: hueOf(name), glyph: glyphOf(name) });

  return (
    <>
      <Hero item={preview} />
      <div className="shelves">
        <section className="shelf" aria-label="Live TV">
          <h2>
            {favorites.length ? 'Favorite Channels' : 'Live TV'} <span>{String(tv.channels.length).padStart(2, '0')}</span>
          </h2>
          <div className="shelf__track">
            {liveItems.map((item, i) => (
              <Card key={item.id} item={item} shape="wide" autoFocus={i === 0} onFocus={setPreview} onSelect={() => onWatch(item.id)} />
            ))}
            <div ref={allChannelsTile} style={{ display: 'contents' }}>
            <AppTile
              name={tv.channels.length ? 'All Channels' : tv.loading ? 'Loading Channels' : 'Add Channels'}
              autoFocus={liveItems.length === 0}
              onSelect={() => onNavigate('live')}
              onFocus={() => previewApp('all-channels', 'Live TV', `${tv.channels.length} channels`, 'Browse every channel, mark favorites, and add your own M3U or Xtream sources.')}
            />
            </div>
          </div>
        </section>

        <section className="shelf" aria-label="Apps">
          <h2>
            Apps <span>{String(pinned.length).padStart(2, '0')}</span>
          </h2>
          <div className="shelf__track">
            {pinned.map((t) => (
              <AppTile
                key={t.id}
                name={t.name}
                onSelect={() => apps.activate(t)}
                onFocus={() => previewApp(t.id, t.name, apps.statusOf(t), 'Press OK to open. Pin, hide, and reorder tiles in the Apps section.')}
              />
            ))}
            <AppTile
              name="All Apps"
              onSelect={() => onNavigate('apps')}
              onFocus={() => previewApp('all-apps', 'All Apps', 'Catalog and store', 'Browse every service, install Windows apps, and choose what appears on this row.')}
            />
          </div>
        </section>
      </div>
    </>
  );
}
