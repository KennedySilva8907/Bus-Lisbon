import { MapContainer, useMap, Polyline, CircleMarker, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useStops, useSingleVehicle, usePatternShape, type Stop, type Vehicle } from '../services/api';
import { useEffect, memo, useCallback, useState, useMemo, useRef } from 'react';
import BusMarker from './BusMarker';
import { getOperatorColor, isCarrisLisboa } from '../utils/operatorColors';

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

function getSelectedStopIcon(lineId?: string | null) {
  const color = getOperatorColor(lineId);
  return new L.DivIcon({
    className: 'bg-transparent',
    html: `<div class="relative w-6 h-6 flex items-center justify-center">
    <div class="absolute w-6 h-6 opacity-30 rounded-full animate-ping" style="background-color: ${color}"></div>
    <div class="w-4 h-4 rounded-full border-2 border-white shadow-lg" style="background-color: ${color}"></div>
  </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

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

function PatternShape({ selectedPatternId, selectedLineId }: { selectedPatternId?: string | null; selectedLineId?: string | null }) {
  const { shape } = usePatternShape(selectedPatternId);
  if (!shape || shape.length === 0) return null;
  const positions = shape.map((coord: number[]) => [coord[1], coord[0]]) as [number, number][];
  const color = getOperatorColor(selectedLineId);
  return <Polyline positions={positions} pathOptions={{ color, weight: 4, opacity: 0.8 }} />;
}

function VehicleTracker({ vehicle, disabled, isPanelOpen, isPanelExpanded }: { vehicle: Vehicle | null; disabled: boolean; isPanelOpen?: boolean; isPanelExpanded?: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (disabled) return;
    if (vehicle && vehicle.lat && vehicle.lon) {
      const lat = Number(vehicle.lat);
      const lon = Number(vehicle.lon);
      // Compensate for panel height on mobile so the bus stays visible above the panel
      if (typeof window !== 'undefined' && window.innerWidth < 768 && isPanelOpen) {
        const panelPx = isPanelExpanded ? window.innerHeight * 0.55 : 80;
        const targetPoint = map.project(L.latLng(lat, lon), 16);
        const offsetPoint = L.point(targetPoint.x, targetPoint.y + panelPx / 2);
        const offsetLatLng = map.unproject(offsetPoint, 16);
        map.flyTo(offsetLatLng, 16, { animate: true });
      } else {
        map.flyTo([lat, lon], 16, { animate: true });
      }
    }
  }, [vehicle, map, disabled, isPanelOpen, isPanelExpanded]);
  return null;
}

// Blue user location marker icon
const userLocationIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div class="relative w-8 h-8 flex items-center justify-center">
    <div class="absolute w-8 h-8 bg-blue-500 opacity-20 rounded-full animate-ping"></div>
    <div class="absolute w-5 h-5 bg-blue-400/20 rounded-full"></div>
    <div class="w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow-lg"></div>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function UserLocationLayer({ onLocationFound }: { onLocationFound?: (latlng: L.LatLng) => void }) {
  const map = useMap();
  const [position, setPosition] = useState<L.LatLng | null>(null);
  const hasInitialLocate = useRef(false);

  useEffect(() => {
    // Start watching position continuously
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
        setPosition(latlng);
        onLocationFound?.(latlng);

        // Auto-fly to user on first locate (once per session)
        if (!hasInitialLocate.current) {
          hasInitialLocate.current = true;
          if (!sessionStorage.getItem('bdt-located')) {
            map.flyTo(latlng, 15, { animate: true, duration: 1.5 });
            sessionStorage.setItem('bdt-located', '1');
          }
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [map, onLocationFound]);

  if (!position) return null;
  return <Marker position={position} icon={userLocationIcon} zIndexOffset={400} />;
}

// Exposes map instance to parent via ref
function MapRefSetter({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
}

function SelectedStopMarker({ stop, selectedLineId }: { stop: Stop | null; selectedLineId?: string | null }) {
  if (!stop) return null;
  const lat = Number(stop.lat);
  const lon = Number(stop.lon);
  if (isNaN(lat) || isNaN(lon)) return null;
  return <Marker position={[lat, lon]} icon={getSelectedStopIcon(selectedLineId)} zIndexOffset={500} />;
}

// ── Canvas-based stops layer ──────────────────────────

const STOP_RENDER_LIMIT = 500;

const StopsCanvasLayer = memo(({ stops, onStopSelect, isDarkMap, selectedLineId }: { stops: Stop[], onStopSelect: (stop: Stop) => void, isDarkMap: boolean, selectedLineId?: string | null }) => {
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const [zoom, setZoom] = useState(12);

  useMapEvents({
    moveend: (e) => { setBounds(e.target.getBounds()); setZoom(e.target.getZoom()); },
    zoomend: (e) => { setBounds(e.target.getBounds()); setZoom(e.target.getZoom()); },
  });

  // Scale marker radius with zoom level so stops stay visible when zooming in
  const markerRadius = useMemo(() => {
    if (zoom <= 13) return 5;
    if (zoom <= 14) return 6;
    if (zoom <= 15) return 8;
    if (zoom <= 16) return 10;
    return 12;
  }, [zoom]);

  const borderWeight = zoom >= 16 ? 2 : 1.5;

  const stopColor = getOperatorColor(selectedLineId);

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
            radius={markerRadius}
            pathOptions={{ fillColor: stopColor, fillOpacity: 0.9, color: isDarkMap ? '#0d1117' : '#1A1A1A', weight: borderWeight }}
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
  const userLocationRef = useRef<L.LatLng | null>(null);

  const handleUserLocationFound = useCallback((latlng: L.LatLng) => {
    userLocationRef.current = latlng;
  }, []);

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

  // Calculate vertical offset to center above the panel on mobile
  const getPanelOffset = (): [number, number] => {
    if (typeof window === 'undefined' || window.innerWidth >= 768) return [0, 0]; // desktop: no offset
    if (!isPanelOpen) return [0, 0];
    // Panel takes 55% when expanded, 80px when collapsed — shift map center up by half the panel height
    const panelPx = isPanelExpanded ? window.innerHeight * 0.55 : 80;
    return [0, panelPx / 2];
  };

  const handleLocate = () => {
    setUserFreeNav(true);
    const offset = getPanelOffset();
    if (userLocationRef.current && mapRef.current) {
      const targetPoint = mapRef.current.project(userLocationRef.current, 15);
      const offsetPoint = L.point(targetPoint.x - offset[0], targetPoint.y + offset[1]);
      const offsetLatLng = mapRef.current.unproject(offsetPoint, 15);
      mapRef.current.flyTo(offsetLatLng, 15, { animate: true });
    } else {
      mapRef.current?.locate().on("locationfound", (loc) => mapRef.current?.flyTo(loc.latlng, 15));
    }
  };

  const handleBackToStop = () => {
    if (!selectedStop || !mapRef.current) return;
    setUserFreeNav(true);
    const lat = Number(selectedStop.lat);
    const lon = Number(selectedStop.lon);
    if (isNaN(lat) || isNaN(lon)) return;
    const offset = getPanelOffset();
    const targetPoint = mapRef.current.project(L.latLng(lat, lon), 16);
    const offsetPoint = L.point(targetPoint.x - offset[0], targetPoint.y + offset[1]);
    const offsetLatLng = mapRef.current.unproject(offsetPoint, 16);
    mapRef.current.flyTo(offsetLatLng, 16, { animate: true });
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
        <UserLocationLayer onLocationFound={handleUserLocationFound} />
        <StopsCanvasLayer stops={stops} onStopSelect={handleStopSelect} isDarkMap={isDarkMap} selectedLineId={selectedLineId} />
        <SelectedStopMarker stop={selectedStop || null} selectedLineId={selectedLineId} />
        {vehicle && <BusMarker vehicle={vehicle} isSelected={true} />}
        <PatternShape selectedPatternId={selectedPatternId} selectedLineId={selectedLineId} />
        <VehicleTracker vehicle={vehicle} disabled={userFreeNav} isPanelOpen={isPanelOpen} isPanelExpanded={isPanelExpanded} />
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
            className={`pointer-events-auto w-11 h-11 rounded-full shadow-lg border border-white/20 flex items-center justify-center hover:brightness-110 active:scale-95 transition-all ${
              isCarrisLisboa(selectedLineId) ? 'bg-carris-green text-white' : 'bg-carris-yellow text-carris-dark'
            }`}
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
