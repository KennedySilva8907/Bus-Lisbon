import { MapContainer, useMap, Polyline, CircleMarker, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useStops, useSingleVehicle, usePatternShape, type Stop, type Vehicle } from '../services/api';
import { useEffect, memo, useCallback, useState, useMemo, useRef } from 'react';
import BusMarker from './BusMarker';

// Fix for default Leaflet marker icons in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/marker-icon-2x.png',
  iconUrl: '/marker-icon.png',
  shadowUrl: '/marker-shadow.png',
});

const LISBON_CENTER: [number, number] = [38.7223, -9.1393];

const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_LIGHT = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';

// Dynamic tile layer that swaps tiles via Leaflet API
function DynamicTileLayer({ isDarkMap }: { isDarkMap: boolean }) {
  const map = useMap();
  const layerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    if (layerRef.current) map.removeLayer(layerRef.current);

    const url = isDarkMap ? TILE_DARK : TILE_LIGHT;
    const layer = L.tileLayer(url, {
      maxZoom: 20,
      subdomains: isDarkMap ? 'abcd' : 'abc',
      attribution: isDarkMap
        ? '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        : '&copy; <a href="https://www.google.com/intl/en_us/help/terms_maps/">Google Maps</a>',
    });
    layer.addTo(map);
    layer.setZIndex(0);
    layerRef.current = layer;

    return () => { if (layerRef.current) map.removeLayer(layerRef.current); };
  }, [isDarkMap, map]);

  return null;
}

const selectedStopIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div class="relative w-6 h-6 flex items-center justify-center">
    <div class="absolute w-6 h-6 bg-[#FFCC00] opacity-30 rounded-full animate-ping"></div>
    <div class="w-4 h-4 bg-[#FFCC00] rounded-full border-2 border-white shadow-lg"></div>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

interface TrackingMapProps {
  onStopSelect: (stop: Stop) => void;
  selectedVehicleId?: string | null;
  selectedPatternId?: string | null;
  selectedLineId?: string | null;
  selectedStop?: Stop | null;
  isDarkMap: boolean;
  onToggleMapTheme: () => void;
  isPanelOpen?: boolean;
  isPanelExpanded?: boolean;
}

// ── Internal map components (need useMap) ──────────────

function PatternShape({ selectedPatternId }: { selectedPatternId?: string | null }) {
  const { shape } = usePatternShape(selectedPatternId);
  if (!shape || shape.length === 0) return null;
  const positions = shape.map((coord: number[]) => [coord[1], coord[0]]) as [number, number][];
  return <Polyline positions={positions} pathOptions={{ color: '#FFCC00', weight: 4, opacity: 0.8 }} />;
}

function VehicleTracker({ vehicle, disabled }: { vehicle: Vehicle | null; disabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (disabled) return;
    if (vehicle && vehicle.lat && vehicle.lon) {
      map.flyTo([Number(vehicle.lat), Number(vehicle.lon)], 16, { animate: true });
    }
  }, [vehicle, map, disabled]);
  return null;
}

function AutoLocate() {
  const map = useMap();
  const hasLocated = useRef(false);
  useEffect(() => {
    if (hasLocated.current) return;
    hasLocated.current = true;
    if (sessionStorage.getItem('bdt-located')) return;
    map.locate({ setView: false, maxZoom: 15 });
    map.once('locationfound', (e) => {
      map.flyTo(e.latlng, 15, { animate: true, duration: 1.5 });
      sessionStorage.setItem('bdt-located', '1');
    });
    map.once('locationerror', () => {});
  }, [map]);
  return null;
}

// Exposes map instance to parent via ref
function MapRefSetter({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
}

function SelectedStopMarker({ stop }: { stop: Stop | null }) {
  if (!stop) return null;
  const lat = Number(stop.lat);
  const lon = Number(stop.lon);
  if (isNaN(lat) || isNaN(lon)) return null;
  return <Marker position={[lat, lon]} icon={selectedStopIcon} zIndexOffset={500} />;
}

// ── Canvas-based stops layer ──────────────────────────

const STOP_RENDER_LIMIT = 500;

const StopsCanvasLayer = memo(({ stops, onStopSelect, isDarkMap }: { stops: Stop[], onStopSelect: (stop: Stop) => void, isDarkMap: boolean }) => {
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const [zoom, setZoom] = useState(12);

  useMapEvents({
    moveend: (e) => { setBounds(e.target.getBounds()); setZoom(e.target.getZoom()); },
    zoomend: (e) => { setBounds(e.target.getBounds()); setZoom(e.target.getZoom()); },
  });

  const visibleStops = useMemo(() => {
    if (zoom < 13 || !bounds) return [];
    const results: Stop[] = [];
    for (const stop of stops) {
      if (results.length >= STOP_RENDER_LIMIT) break;
      const lat = Number(stop.lat);
      const lon = Number(stop.lon);
      if (!isNaN(lat) && !isNaN(lon) && bounds.contains([lat, lon])) results.push(stop);
    }
    return results;
  }, [stops, bounds, zoom]);

  if (zoom < 13) return null;

  return (
    <>
      {visibleStops.map(stop => {
        const lat = Number(stop.lat);
        const lon = Number(stop.lon);
        return (
          <CircleMarker
            key={stop.id}
            center={[lat, lon]}
            radius={5}
            pathOptions={{ fillColor: '#FFCC00', fillOpacity: 0.9, color: isDarkMap ? '#0d1117' : '#1A1A1A', weight: 1.5 }}
            eventHandlers={{ click: () => onStopSelect(stop) }}
          >
            <Popup closeButton={false}>
              <div className="text-center font-bold text-sm">{stop.name}</div>
              <div className="text-xs opacity-75 text-center mt-1">{stop.id}</div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
});

// ── Main Component ────────────────────────────────────

export default function TrackingMap({ onStopSelect, selectedVehicleId, selectedPatternId, selectedLineId, selectedStop, isDarkMap, onToggleMapTheme, isPanelOpen, isPanelExpanded }: TrackingMapProps) {
  const { stops, isLoading: isLoadingStops } = useStops();
  const { vehicle } = useSingleVehicle(selectedVehicleId || null, selectedLineId, selectedPatternId);
  const mapRef = useRef<L.Map | null>(null);
  const [userFreeNav, setUserFreeNav] = useState(false);

  // Reset free navigation when a NEW vehicle is selected
  const prevVehicleId = useRef<string | null>(null);
  useEffect(() => {
    if (selectedVehicleId && selectedVehicleId !== prevVehicleId.current) {
      setUserFreeNav(false);
    }
    prevVehicleId.current = selectedVehicleId || null;
  }, [selectedVehicleId]);

  const handleStopSelect = useCallback((stop: Stop) => {
    onStopSelect(stop);
  }, [onStopSelect]);

  const handleLocate = () => {
    setUserFreeNav(true); // user navigated away
    mapRef.current?.locate().on("locationfound", (loc) => mapRef.current?.flyTo(loc.latlng, 15));
  };

  const handleBackToStop = () => {
    if (!selectedStop) return;
    setUserFreeNav(true); // user wants freedom to navigate
    const lat = Number(selectedStop.lat);
    const lon = Number(selectedStop.lon);
    if (!isNaN(lat) && !isNaN(lon)) mapRef.current?.flyTo([lat, lon], 16, { animate: true });
  };

  // Calculate bottom offset for buttons based on panel state (mobile only)
  // Panel is 55% height. When expanded: buttons above panel. When collapsed: above 80px peek.
  const getButtonsBottom = () => {
    if (!isPanelOpen) return 'bottom-4 md:bottom-6';
    if (isPanelExpanded) return 'bottom-[calc(55%+1rem)] md:bottom-6';
    return 'bottom-[calc(80px+1rem)] md:bottom-6';
  };

  return (
    <div className={`w-full h-full relative z-0 ${isDarkMap ? 'bg-[#0d1117]' : 'bg-[#e5e3df]'}`}>
      {isLoadingStops && (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center pointer-events-none bg-carris-dark/50 backdrop-blur-sm">
          <div className="text-carris-yellow font-bold text-lg animate-pulse">A carregar paragens...</div>
        </div>
      )}

      <MapContainer
        center={LISBON_CENTER}
        zoom={12}
        className="w-full h-full"
        zoomControl={false}
        preferCanvas={true}
      >
        <MapRefSetter mapRef={mapRef} />
        <DynamicTileLayer isDarkMap={isDarkMap} />
        <AutoLocate />
        <StopsCanvasLayer stops={stops} onStopSelect={handleStopSelect} isDarkMap={isDarkMap} />
        <SelectedStopMarker stop={selectedStop || null} />
        {vehicle && <BusMarker vehicle={vehicle} isSelected={true} />}
        <PatternShape selectedPatternId={selectedPatternId} />
        <VehicleTracker vehicle={vehicle} disabled={userFreeNav} />
      </MapContainer>

      {/* All control buttons — OUTSIDE MapContainer for reliable React events */}
      <div className={`absolute ${getButtonsBottom()} right-4 md:right-6 z-[1001] flex flex-col gap-3 items-center pointer-events-none transition-all duration-300`}>
        {/* Map theme toggle */}
        <button
          className={`pointer-events-auto w-11 h-11 rounded-full shadow-lg border flex items-center justify-center active:scale-95 transition-all ${
            isDarkMap
              ? 'bg-carris-gray text-white border-white/10 hover:bg-[#2A2A2A]'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
          }`}
          onClick={onToggleMapTheme}
          title={isDarkMap ? 'Mudar para mapa claro' : 'Mudar para mapa escuro'}
        >
          {isDarkMap ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
            </svg>
          )}
        </button>

        {/* Locate me */}
        <button
          className={`pointer-events-auto w-11 h-11 rounded-full shadow-lg border flex items-center justify-center active:scale-95 transition-all ${
            isDarkMap
              ? 'bg-carris-gray text-carris-yellow border-white/10 hover:bg-[#2A2A2A]'
              : 'bg-white text-carris-dark border-gray-200 hover:bg-gray-100'
          }`}
          onClick={handleLocate}
          title="Ir para a minha localização"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M3 11.5l18-9.5-9.5 18-1.5-7.5z"/>
          </svg>
        </button>

        {/* Back to selected stop */}
        {selectedStop && (
          <button
            className="pointer-events-auto w-11 h-11 bg-carris-yellow text-carris-dark rounded-full shadow-lg border border-white/20 flex items-center justify-center hover:brightness-110 active:scale-95 transition-all"
            onClick={handleBackToStop}
            title="Voltar à minha paragem"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z" />
              <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
