import { useState } from 'react';
import { pinnedTiles } from '@neondeck/core';
import { useApps } from '../apps/store';
import { AppTile, glyphOf, hueOf } from '../components/AppTile';
import { Card } from '../components/Card';
import { Hero } from '../components/Hero';
import { shelves, type Item } from '../data/mock';
import type { Route } from '../routes';

export function Home({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const [preview, setPreview] = useState<Item>(shelves[0].items[0]);
  const apps = useApps();
  const pinned = pinnedTiles(apps.config, apps.profile);

  const previewApp = (id: string, name: string, status: string, synopsis: string) =>
    setPreview({ id, title: name, subtitle: 'App', meta: [status], synopsis, hue: hueOf(name), glyph: glyphOf(name) });

  return (
    <>
      <Hero item={preview} />
      <div className="shelves">
        {shelves.map((shelf, si) =>
          shelf.id === 'apps' ? (
            <section className="shelf" key="apps" aria-label="Apps">
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
          ) : (
            <section className="shelf" key={shelf.id} aria-label={shelf.title}>
              <h2>
                {shelf.title} <span>{String(shelf.items.length).padStart(2, '0')}</span>
              </h2>
              <div className="shelf__track">
                {shelf.items.map((item, i) => (
                  <Card key={item.id} item={item} shape={shelf.shape} autoFocus={si === 0 && i === 0} onFocus={setPreview} />
                ))}
              </div>
            </section>
          ),
        )}
      </div>
    </>
  );
}
