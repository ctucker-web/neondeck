// The action sheet for whatever is selected, the busy panel, and the toast.
import { useEffect, useRef } from 'react';
import {
  CATEGORY_LABELS, addCustomTile, findInstalledApp, isHidden, isPinned, movePinned, pin, removeCustomTile,
  resolveLaunch, setHidden, unpin,
} from '@neondeck/core';
import { useApps, type Sheet } from '../apps/store';
import { focusDefault } from '../nav/spatial';

interface Action {
  key: string;
  label: string;
  hint?: string;
  danger?: boolean;
  run: () => void;
}

interface SheetView {
  kicker: string;
  title: string;
  note?: string;
  actions: Action[];
}

function useSheetView(sheet: Sheet | null): SheetView | null {
  const a = useApps();
  if (!sheet) return null;
  const close = () => a.setSheet(null);

  if (sheet.kind === 'tile') {
    const tile = a.tiles.find((t) => t.id === sheet.id);
    if (!tile) return null;
    const plan = resolveLaunch(tile, a.config, a.startApps);
    const installed = findInstalledApp(tile, a.config, a.startApps);
    const pinned = isPinned(a.config, a.profile, tile.id);
    const hidden = isHidden(a.config, a.profile, tile.id);
    const custom = tile.category === 'custom';
    const actions: Action[] = [];

    if (plan.kind === 'app') actions.push({ key: 'open', label: 'Open', hint: 'Windows app', run: () => a.openApp(tile.name, plan.appId) });
    if (plan.kind === 'install') {
      actions.push({ key: 'install', label: 'Install', hint: `${plan.package.id} · ${plan.package.source}`, run: () => a.install(plan.package, tile.name, tile.id) });
      if (plan.fallbackUrl) actions.push({ key: 'web', label: 'Open the website instead', hint: 'Edge, fullscreen', run: () => a.openSite(tile.name, plan.fallbackUrl!) });
    }
    if (plan.kind === 'web') {
      actions.push({ key: 'web', label: 'Open', hint: 'Edge, fullscreen', run: () => a.openSite(tile.name, plan.url) });
      if (!custom) actions.push({ key: 'find', label: 'Find the Windows app', hint: 'Searches the Microsoft Store', run: () => a.findInStore(tile) });
    }
    actions.push({
      key: 'pin',
      label: pinned ? 'Unpin from Home' : 'Pin to Home',
      run: () => a.update((c) => (pinned ? unpin(c, a.profile, tile.id) : pin(c, a.profile, tile.id))),
    });
    if (pinned) {
      actions.push({ key: 'left', label: 'Move left on Home', run: () => a.update((c) => movePinned(c, a.profile, tile.id, -1)) });
      actions.push({ key: 'right', label: 'Move right on Home', run: () => a.update((c) => movePinned(c, a.profile, tile.id, 1)) });
    }
    if (!custom) {
      actions.push({
        key: 'hide',
        label: hidden ? 'Show in catalog again' : 'Hide from catalog',
        run: () => a.update((c) => setHidden(c, a.profile, tile.id, !hidden)),
      });
    }
    if (installed && tile.package) actions.push({ key: 'uninstall', label: 'Uninstall', danger: true, run: () => a.uninstall(tile.package!.id, tile.name) });
    if (custom) actions.push({ key: 'remove', label: 'Remove this tile', danger: true, run: () => { a.update((c) => removeCustomTile(c, tile.id)); close(); } });

    const order = a.config.profiles[a.profile]?.pinned ?? [];
    return {
      kicker: custom ? 'Custom tile' : CATEGORY_LABELS[tile.category as keyof typeof CATEGORY_LABELS],
      title: tile.name,
      note: [a.statusOf(tile), pinned ? `Home position ${order.indexOf(tile.id) + 1} of ${order.length}` : null, hidden ? 'Hidden' : null].filter(Boolean).join(' · '),
      actions,
    };
  }

  if (sheet.kind === 'storepick') {
    const tile = a.tiles.find((t) => t.id === sheet.tileId);
    if (!tile) return null;
    return {
      kicker: 'Microsoft Store results',
      title: `Which one is ${tile.name}?`,
      note: 'Pick the official app. If none of these is right, press Back and it will keep opening in Edge.',
      actions: sheet.results.map((p) => ({
        key: p.id,
        label: p.name,
        hint: p.id,
        run: () => a.install({ source: 'msstore', id: p.id }, p.name, tile.id),
      })),
    };
  }

  if (sheet.kind === 'package') {
    const { pkg } = sheet;
    const actions: Action[] = [];
    if (!sheet.installed && (pkg.source === 'winget' || pkg.source === 'msstore')) {
      const source = pkg.source;
      actions.push({ key: 'install', label: 'Install and add a tile', run: () => a.install({ source, id: pkg.id }, pkg.name) });
    }
    if (sheet.installed && pkg.available) actions.push({ key: 'update', label: `Update to ${pkg.available}`, run: () => a.upgrade(pkg.id, pkg.name) });
    if (sheet.installed) actions.push({ key: 'uninstall', label: 'Uninstall', danger: true, run: () => a.uninstall(pkg.id, pkg.name) });
    return {
      kicker: sheet.installed ? 'Installed package' : `From ${pkg.source === 'msstore' ? 'Microsoft Store' : 'winget'}`,
      title: pkg.name,
      note: `${pkg.id} · version ${pkg.version || 'unknown'}`,
      actions,
    };
  }

  const { app } = sheet;
  const existing = a.config.custom.some((c) => c.kind === 'program' && c.target === app.appId);
  return {
    kicker: 'On this PC',
    title: app.name,
    note: existing ? 'Already has a tile.' : undefined,
    actions: [
      { key: 'open', label: 'Open', run: () => a.openApp(app.name, app.appId) },
      ...(existing ? [] : [{
        key: 'add',
        label: 'Add as a tile and pin to Home',
        run: () => { a.update((c) => addCustomTile(c, { name: app.name, kind: 'program', target: app.appId }, a.profile)); a.notify(`${app.name} is pinned to Home.`); close(); },
      }]),
    ],
  };
}

function SheetPanel({ view, onClose }: { view: SheetView; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Take focus on open; give it back to whatever had it on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('[data-focusable]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      setTimeout(() => (previous?.isConnected ? previous.focus() : focusDefault()), 0);
    };
  }, []);

  return (
    <div className="scrim" data-nav-modal>
      <div className="sheet panel" role="dialog" aria-label={view.title} ref={ref}>
        <p className="panel__kicker">{view.kicker}</p>
        <h1>{view.title}</h1>
        {view.note && <p className="sheet__note">{view.note}</p>}
        <ul className="sheet__actions">
          {view.actions.map((act) => (
            <li key={act.key}>
              <button className={`opt opt--action${act.danger ? ' opt--danger' : ''}`} data-focusable data-noscroll onClick={act.run}>
                <span className="opt__label">{act.label}</span>
                {act.hint && <span className="opt__value">{act.hint}</span>}
              </button>
            </li>
          ))}
          <li>
            <button className="opt opt--action" data-focusable data-noscroll onClick={onClose}>
              <span className="opt__label">Close</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}

export function Overlays() {
  const { sheet, setSheet, busy, toast } = useApps();
  const view = useSheetView(sheet);
  const busyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!busy) return;
    const previous = document.activeElement as HTMLElement | null;
    busyRef.current?.focus();
    return () => {
      setTimeout(() => (previous?.isConnected ? previous.focus() : focusDefault()), 0);
    };
  }, [busy]);

  return (
    <>
      {view && !busy && <SheetPanel view={view} onClose={() => setSheet(null)} />}
      {busy && (
        <div className="scrim" data-nav-modal>
          <div className="busy panel" role="status" tabIndex={-1} ref={busyRef}>
            <span className="busy__bar" aria-hidden="true" />
            <p>{busy}</p>
            <p className="busy__hint">Ctrl + Shift + Home returns to NEONDECK from anywhere.</p>
          </div>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
