import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_LABELS, addCustomTile, isHidden, isPinned, normalizeUrl, pinnedTiles, type Category, type WingetPackage } from '@neondeck/core';
import { useApps } from '../apps/store';
import { AppTile } from '../components/AppTile';
import { Osk } from '../components/Osk';

type Tab = 'home' | 'all' | Category | 'hidden' | 'pc' | 'manage' | 'search' | 'custom';

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home Row' },
  { id: 'all', label: 'All' },
  ...(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => ({ id: c as Tab, label: CATEGORY_LABELS[c] })),
  { id: 'hidden', label: 'Hidden' },
  { id: 'pc', label: 'On This PC' },
  { id: 'manage', label: 'Updates' },
  { id: 'search', label: 'Store Search' },
  { id: 'custom', label: 'Add Web Tile' },
];

function PackageRow({ pkg, onSelect }: { pkg: WingetPackage; onSelect: () => void }) {
  return (
    <button className="opt opt--row" data-focusable onClick={onSelect}>
      <span className="opt__label">{pkg.name}</span>
      <span className="opt__hint">{pkg.id}</span>
      <span className="opt__value">{pkg.available ? `${pkg.version} → ${pkg.available}` : pkg.source === 'msstore' ? 'Microsoft Store' : pkg.version}</span>
    </button>
  );
}

export function AppsScreen() {
  const a = useApps();
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WingetPackage[] | 'loading' | null>(null);
  const [field, setField] = useState<'name' | 'url'>('name');
  const [form, setForm] = useState({ name: '', url: '' });

  useEffect(() => {
    if (tab === 'manage') a.loadPackages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const grid = useMemo(() => {
    if (tab === 'home') return pinnedTiles(a.config, a.profile);
    if (tab === 'hidden') return a.tiles.filter((t) => isHidden(a.config, a.profile, t.id));
    const visible = a.tiles.filter((t) => !isHidden(a.config, a.profile, t.id));
    return tab === 'all' ? visible : visible.filter((t) => t.category === tab);
  }, [tab, a.tiles, a.config, a.profile]);

  const runSearch = () => {
    if (!query.trim()) return;
    setResults('loading');
    a.search(query).then(setResults, () => setResults([]));
  };

  // When results arrive, jump to the first one so a remote user doesn't have to hunt for it.
  const resultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (Array.isArray(results)) resultsRef.current?.querySelector<HTMLElement>('[data-focusable]')?.focus();
  }, [results]);

  const addWebTile = () => {
    const url = normalizeUrl(form.url);
    if (!form.name.trim()) return a.notify('Give the tile a name first.');
    if (!url) return a.notify('That address does not look like a web link. Example: example.com/watch');
    a.update((c) => addCustomTile(c, { name: form.name.trim(), kind: 'url', target: url }, a.profile));
    a.notify(`${form.name.trim()} is pinned to Home.`);
    setForm({ name: '', url: '' });
    setTab('home');
  };

  const isGrid = !['pc', 'manage', 'search', 'custom'].includes(tab);
  const updates = (a.packages ?? []).filter((p) => p.available);

  return (
    <div className="apps">
      <div className="tabs" role="tablist">
        {TABS.map((t, i) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="tab" data-focusable data-noscroll data-autofocus={i === 1 ? '' : undefined} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {a.demo && <p className="apps__demo">Demo mode: running in a browser, so nothing is really installed or launched. App lists are sample data.</p>}

      <div className="apps__body">
        {isGrid && (
          <>
            <div className="grid">
              {grid.map((t) => (
                <AppTile
                  key={t.id}
                  name={t.name}
                  status={a.statusOf(t)}
                  badge={isPinned(a.config, a.profile, t.id) ? 'HOME' : undefined}
                  onSelect={() => a.setSheet({ kind: 'tile', id: t.id })}
                />
              ))}
            </div>
            {grid.length === 0 && (
              <p className="apps__empty">
                {tab === 'home' ? 'Nothing is pinned. Open any tile and choose “Pin to Home”.' : tab === 'hidden' ? 'No hidden tiles.' : 'Nothing here yet.'}
              </p>
            )}
          </>
        )}

        {tab === 'pc' && (
          <div className="grid">
            {a.startApps.map((app) => (
              <AppTile key={app.appId} name={app.name} onSelect={() => a.setSheet({ kind: 'startapp', app })} />
            ))}
          </div>
        )}

        {tab === 'manage' && (
          <div className="rows">
            {a.packages === null && <p className="apps__empty">Reading installed packages…</p>}
            {a.packages && updates.length > 0 && <h2 className="rows__head">Updates available <span>{updates.length}</span></h2>}
            {updates.map((p) => (
              <PackageRow key={`u-${p.id}`} pkg={p} onSelect={() => a.setSheet({ kind: 'package', pkg: p, installed: true })} />
            ))}
            {a.packages && <h2 className="rows__head">Installed <span>{a.packages.length}</span></h2>}
            {a.packages?.filter((p) => !p.available).map((p) => (
              <PackageRow key={p.id} pkg={p} onSelect={() => a.setSheet({ kind: 'package', pkg: p, installed: true })} />
            ))}
          </div>
        )}

        {tab === 'search' && (
          <div className="split">
            <div>
              <p className="field field--active">{query || <span>Search the Microsoft Store and winget</span>}</p>
              <Osk value={query} onChange={setQuery} onSubmit={runSearch} submitLabel="Search" />
            </div>
            <div className="rows" ref={resultsRef}>
              {results === 'loading' && <p className="apps__empty">Searching…</p>}
              {results === null && <p className="apps__empty">Type a name, then choose Search.</p>}
              {Array.isArray(results) && results.length === 0 && <p className="apps__empty">No apps found for “{query}”.</p>}
              {Array.isArray(results) && results.map((p) => (
                <PackageRow key={`${p.source}-${p.id}`} pkg={p} onSelect={() => a.setSheet({ kind: 'package', pkg: p, installed: false })} />
              ))}
            </div>
          </div>
        )}

        {tab === 'custom' && (
          <div className="split">
            <div>
              <button className={`field${field === 'name' ? ' field--active' : ''}`} data-focusable onClick={() => setField('name')}>
                <b>Name</b> {form.name || <span>My tile</span>}
              </button>
              <button className={`field${field === 'url' ? ' field--active' : ''}`} data-focusable onClick={() => setField('url')}>
                <b>Address</b> {form.url || <span>example.com</span>}
              </button>
              <Osk value={form[field]} onChange={(v) => setForm((f) => ({ ...f, [field]: v }))} onSubmit={addWebTile} submitLabel="Add tile" />
            </div>
            <div className="apps__help">
              <p>Web tiles open fullscreen in Microsoft Edge.</p>
              <p>To make a tile for a program already on this PC, use the <b>On This PC</b> tab instead.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
