import { useCallback, useEffect, useRef, useState } from 'react';
import { Hud } from './components/Hud';
import { Rail } from './components/Rail';
import { focusDefault, installSpatialNav } from './nav/spatial';
import { routes, type Route } from './routes';
import { AppsProvider } from './apps/store';
import { Overlays } from './components/Overlays';
import { AppsScreen } from './screens/Apps';
import { LiveTvProvider, useLiveTv } from './livetv/store';
import { GuideScreen } from './screens/Guide';
import { Home } from './screens/Home';
import { LiveTvScreen } from './screens/LiveTv';
import { Placeholder } from './screens/Placeholder';
import { SettingsScreen } from './screens/Settings';
import { useSettings } from './state/settings';

export function App() {
  return (
    <AppsProvider>
      <LiveTvProvider>
        <Shell />
      </LiveTvProvider>
    </AppsProvider>
  );
}

function Shell() {
  const tv = useLiveTv();
  const { settings, update } = useSettings();
  const [route, setRoute] = useState<Route>('home');
  const routeRef = useRef(route);
  routeRef.current = route;
  const motionRef = useRef(settings.motion);
  motionRef.current = settings.motion;

  const goHome = useCallback(() => setRoute('home'), []);

  useEffect(
    () =>
      installSpatialNav({
        smooth: () => motionRef.current === 'full',
        onBack: () => {
          if (routeRef.current !== 'home') setRoute('home');
          else document.querySelector<HTMLElement>('.rail [aria-current="page"]')?.focus();
        },
      }),
    [],
  );

  // Each screen marks its own entry point with data-autofocus.
  useEffect(() => {
    focusDefault();
  }, [route]);

  const def = routes.find((r) => r.id === route)!;

  const watch = (channelId: string) => {
    tv.tune(channelId, true);
    setRoute('live');
  };

  return (
    <div className="shell">
      <Rail current={route} onSelect={setRoute} />
      <div className="stage">
        <Hud section={def.label} />
        <main className="screen" key={route}>
          {route === 'home' && <Home onNavigate={setRoute} onWatch={watch} />}
          {route === 'live' && <LiveTvScreen />}
          {route === 'guide' && <GuideScreen onWatch={watch} />}
          {route === 'apps' && <AppsScreen />}
          {route === 'settings' && <SettingsScreen settings={settings} update={update} />}
          {def.milestone !== undefined && <Placeholder def={def} onBack={goHome} />}
        </main>
      </div>
      <Overlays />
      <div className="overlay-scanlines" aria-hidden="true" />
    </div>
  );
}
