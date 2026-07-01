import { useState, useEffect } from 'react';
import TrackingMap from './components/TrackingMap';
import StopDetailsPanel from './components/StopDetailsPanel';
import SearchBar from './components/SearchBar';
import SplashScreen from './components/SplashScreen';
import { useStops } from './services/api';
import type { Stop } from './services/api';
import { useFavorites } from './hooks/useFavorites';

function App() {
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);
  const [isDarkMap, setIsDarkMap] = useState(() => {
    try {
      const saved = localStorage.getItem('bdt-dark-map');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const { favorites, toggle: toggleFavorite, isFavorite } = useFavorites();

  // Notification-click target: a stop the user came in to see. Resolved once
  // stops finish loading (we get just the id from the URL or SW message).
  const [pendingTarget, setPendingTarget] = useState<{
    stopId: string;
    vehicleId?: string | null;
    patternId?: string | null;
    lineId?: string | null;
  } | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const stopId = params.get('stop');
    if (!stopId) return null;
    return {
      stopId,
      vehicleId: params.get('vehicle'),
      patternId: params.get('pattern'),
      lineId: params.get('line'),
    };
  });

  // Splash screen
  const { isLoading: stopsLoading, stops } = useStops();
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const [minDelayPassed, setMinDelayPassed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinDelayPassed(true), 5000);
    let fadeTimer: ReturnType<typeof setTimeout>;
    const maxTimer = setTimeout(() => {
      setSplashFading(true);
      fadeTimer = setTimeout(() => setShowSplash(false), 500);
    }, 15000);
    return () => {
      clearTimeout(timer);
      clearTimeout(maxTimer);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, []);

  // Drive the splash fade once the stops are loaded and the minimum on-screen
  // duration has passed. This is the documented exception to the
  // 'no setState in effect' rule — we're reacting to an external async load.
  useEffect(() => {
    if (!stopsLoading && minDelayPassed && !splashFading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSplashFading(true);
      const fadeTimer = setTimeout(() => setShowSplash(false), 500);
      return () => clearTimeout(fadeTimer);
    }
  }, [stopsLoading, minDelayPassed, splashFading]);

  // Listen for notification clicks while the app is already open — the SW
  // posts {type:'open-alert-target', payload:{stopId, vehicleId}}.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'open-alert-target') {
        const { stopId, vehicleId, patternId, lineId } = e.data.payload || {};
        if (stopId) setPendingTarget({ stopId, vehicleId, patternId, lineId });
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // Resolve the notification target once stops are loaded — another valid
  // 'react to async data' case. We only get an id from the URL/SW; the
  // matching Stop object only exists after useStops resolves.
  useEffect(() => {
    if (!pendingTarget || stops.length === 0) return;
    const stop = stops.find(s => s.id === pendingTarget.stopId);
    if (stop) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedStop(stop);
      setSelectedVehicleId(pendingTarget.vehicleId ?? null);
      setSelectedPatternId(pendingTarget.patternId ?? null);
      setSelectedLineId(pendingTarget.lineId ?? null);
      setIsPanelExpanded(true);
    }
    setPendingTarget(null);
    // Clear the deep-link params so reloads don't re-trigger
    if (typeof window !== 'undefined' && window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [pendingTarget, stops]);

  const toggleMapTheme = () => {
    setIsDarkMap(prev => {
      const next = !prev;
      localStorage.setItem('bdt-dark-map', String(next));
      return next;
    });
  };

  // Called when a stop is selected via Map or Search
  const handleStopSelect = (stop: Stop) => {
    setSelectedStop(stop);
    setSelectedVehicleId(null);
    setSelectedPatternId(null);
    setSelectedLineId(null);
    setIsPanelExpanded(true);
  };

  return (
    <div className="w-full h-full relative bg-carris-dark overflow-hidden flex flex-col md:flex-row">

      {/* Splash Screen */}
      {showSplash && <SplashScreen fading={splashFading} />}

      {/* Search Bar Overlay */}
      <SearchBar onStopSelect={handleStopSelect} favorites={favorites} />

      {/* Main Map Area */}
      <main className="flex-1 w-full h-full z-0">
        <TrackingMap
          onStopSelect={handleStopSelect}
          selectedVehicleId={selectedVehicleId}
          selectedPatternId={selectedPatternId}
          selectedLineId={selectedLineId}
          selectedStop={selectedStop}
          isDarkMap={isDarkMap}
          onToggleMapTheme={toggleMapTheme}
          isPanelOpen={!!selectedStop}
          isPanelExpanded={isPanelExpanded}
        />
      </main>

      {/* Side/bottom panel — only mounted once a stop is selected. On desktop
          this keeps the map full-width until the user picks a stop (no empty
          rail on the right); on mobile it's a bottom sheet that stays hidden
          while idle. */}
      {selectedStop && (
        <StopDetailsPanel
          stop={selectedStop}
          isExpanded={isPanelExpanded}
          onToggleExpand={() => setIsPanelExpanded(!isPanelExpanded)}
          onClose={() => { setSelectedStop(null); setSelectedVehicleId(null); setSelectedPatternId(null); setSelectedLineId(null); }}
          selectedVehicleId={selectedVehicleId}
          selectedPatternId={selectedPatternId}
          onVehicleSelect={(vid, pid, lid) => { setSelectedVehicleId(vid); setSelectedPatternId(pid || null); setSelectedLineId(lid || null); }}
          isFavorite={selectedStop ? isFavorite(selectedStop.id) : false}
          onToggleFavorite={() => selectedStop && toggleFavorite(selectedStop.id)}
        />
      )}

    </div>
  )
}

export default App
