import { useEffect, useState } from 'react';
import { useApps } from '../apps/store';
import { isDemo, platform } from '../platform/bridge';
import type { Settings } from '../state/settings';
import { themes } from '../theme';

// Verified in the winget community repository.
const JELLYFIN = { source: 'winget', id: 'Jellyfin.Server' } as const;

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export function SettingsScreen({ settings, update }: Props) {
  const [autostart, setAutostart] = useState(false);
  useEffect(() => {
    platform.getAutostart().then(setAutostart, () => {});
  }, []);
  const toggleAutostart = () => {
    const next = !autostart;
    platform.setAutostart(next).then(() => setAutostart(next), () => {});
  };

  // Jellyfin is the media server for library and DVR. It is installed with
  // its own native Windows installer, fetched through winget.
  const apps = useApps();
  const [jellyfin, setJellyfin] = useState<'checking' | 'installed' | 'missing'>('checking');
  const checkJellyfin = () =>
    platform.wingetList().then(
      (list) => setJellyfin(list.some((p) => p.id === JELLYFIN.id) ? 'installed' : 'missing'),
      () => setJellyfin('missing'),
    );
  useEffect(() => {
    void checkJellyfin();
  }, []);
  const installJellyfin = () => {
    if (jellyfin !== 'missing') return;
    apps.runTask('Installing Jellyfin Server. This can take a few minutes.', async () => {
      await platform.install(JELLYFIN);
      await checkJellyfin();
      return 'Jellyfin Server is installed. Library and DVR screens connect to it in a later milestone.';
    });
  };

  const themeIndex = Math.max(0, themes.findIndex((t) => t.id === settings.theme));
  const rows = [
    {
      label: 'Theme',
      value: themes[themeIndex].name,
      hint: 'Swaps every color, font, and corner style.',
      action: () => update({ theme: themes[(themeIndex + 1) % themes.length].id }),
    },
    {
      label: 'Motion',
      value: settings.motion === 'full' ? 'Full' : 'Reduced',
      hint: 'Reduced turns off glitch transitions and smooth scrolling.',
      action: () => update({ motion: settings.motion === 'full' ? 'reduced' : 'full' }),
    },
    {
      label: 'Scanlines',
      value: settings.scanlines ? 'On' : 'Off',
      hint: 'The thin CRT line texture over the whole screen.',
      action: () => update({ scanlines: !settings.scanlines }),
    },
    {
      label: 'Start at sign-in',
      value: autostart ? 'On' : 'Off',
      hint: isDemo ? 'Opens NEONDECK fullscreen when you sign in to Windows. (Demo mode: not saved.)' : 'Opens NEONDECK fullscreen when you sign in to Windows.',
      action: toggleAutostart,
    },
    {
      label: 'Media server',
      value: jellyfin === 'checking' ? 'Checking…' : jellyfin === 'installed' ? 'Jellyfin installed' : 'Install Jellyfin',
      hint: 'Jellyfin runs on this PC and powers the library and DVR.',
      action: installJellyfin,
    },
    {
      label: 'Exit',
      value: 'To desktop',
      hint: 'Closes NEONDECK and returns to Windows.',
      action: () => void platform.quit(),
    },
  ];

  return (
    <div className="settings">
      <div className="panel">
        <p className="panel__kicker">Appearance and startup</p>
        <h1>Settings</h1>
        <ul className="optlist">
          {rows.map((row, i) => (
            <li key={row.label}>
              <button className="opt" data-focusable data-autofocus={i === 0 ? '' : undefined} onClick={row.action}>
                <span className="opt__label">{row.label}</span>
                <span className="opt__hint">{row.hint}</span>
                <span className="opt__value">{row.value}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="settings__note">Press OK to change a setting. F11 toggles fullscreen. Sources, profiles, and parental controls arrive in later milestones.</p>
      </div>
      <aside className="panel panel--side">
        <p className="panel__kicker">About</p>
        <dl className="about">
          <dt>Version</dt>
          <dd>0.2.0 · Windows preview</dd>
          <dt>License</dt>
          <dd>Not chosen yet</dd>
          <dt>Sign-ins</dt>
          <dd>Stay inside each app. Never stored here.</dd>
          <dt>Accounts</dt>
          <dd>None</dd>
          <dt>Telemetry</dt>
          <dd>None</dd>
        </dl>
      </aside>
    </div>
  );
}
