import { useCallback, useEffect, useRef } from 'react';
import { AttributionControl, Map as MapLibreMap, type GeoJSONSource, type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LISBON, basemapStyle } from '../services/basemap';
import {
  SELECTED_DOT_LAYER,
  SELECTED_LAYER,
  SELECTED_PIN_IMAGE,
  SELECTED_PIN_URL,
  STOPS_LAYER,
  STOPS_SOURCE,
  mutedStopRadius,
  mutedStopStrokeWidth,
  selectedDotRadius,
  selectedPinSize,
  stopRadius,
  stopStrokeWidth,
  toStopCollection,
} from '../services/stopsLayer';
import {
  ROUTE_ARROWS_LAYER,
  ROUTE_ARROW_IMAGE,
  ROUTE_CASING_LAYER,
  ROUTE_LINE_LAYER,
  ROAD_LABEL_LAYERS,
  ROUTE_SOURCE,
  WAYPOINTS_LAYER,
  WAYPOINTS_SOURCE,
  arrowImage,
  routeArrowSize,
  routeArrowSpacing,
  routeCasingWidth,
  routeLineWidth,
  toRouteCollection,
  toWaypointCollection,
  waypointRadius,
  waypointStrokeWidth,
} from '../services/routeLayer';
import {
  SLIDE_MS,
  VEHICLE_GLOW_LAYER,
  VEHICLE_IMAGE,
  VEHICLE_IMAGE_HEIGHT,
  VEHICLE_IMAGE_RATIO,
  VEHICLE_IMAGE_URL,
  VEHICLE_IMAGE_WIDTH,
  VEHICLE_LAYER,
  VEHICLE_SOURCE,
  placeVehicle,
  slideBetween,
  tooFarToSlide,
  toVehicleCollection,
  vehicleGlowRadius,
  vehicleSize,
  type Placed,
} from '../services/vehicleLayer';
import {
  FRAME_MAX_ZOOM,
  FRAME_STOP_ZOOM,
  PANEL_ELEMENT_ID,
  PANEL_SETTLE_MS,
  coveredHeight,
  frameAround,
  framePadding,
} from '../services/framing';
import {
  LOCATED_ONCE_KEY,
  LOCATION_DOT_LAYER,
  LOCATION_DOT_RADIUS,
  LOCATION_HALO_LAYER,
  LOCATION_HALO_RADIUS,
  LOCATION_SOURCE,
  LOCATION_ZOOM,
  readFix,
  toLocationCollection,
  type Fix,
} from '../services/userLocation';
import MapControls from './MapControls';
import type { Stop, Vehicle } from '../services/api';

export interface SelectedRoute {
  shape: number[][];
  colour: string;
  textColour: string;
  stops: Stop[];
}

interface VectorMapProps {
  stops: Stop[];
  selectedStop: Stop | null;
  route: SelectedRoute;
  vehicle: Vehicle | null;
  panelOpen: boolean;
  panelExpanded: boolean;
  isDarkMap: boolean;
  loadingStops: boolean;
  onStopSelect: (stop: Stop) => void;
  onToggleMapTheme: () => void;
}

function firstLabelLayer(map: MapLibreMap): string | undefined {
  const layers = map.getStyle().layers;
  let lastGround = -1;

  layers.forEach((layer, index) => {
    if (layer.type === 'line' || layer.type === 'fill' || layer.type === 'fill-extrusion') lastGround = index;
  });

  return layers.find((layer, index) => index > lastGround && layer.type === 'symbol')?.id;
}

function loadImageFile(
  map: MapLibreMap,
  name: string,
  url: string,
  width: number,
  height: number,
  ratio = 1
) {
  if (map.hasImage(name)) return;

  const picture = new Image(width * ratio, height * ratio);

  picture.onload = () => {
    if (!map.hasImage(name)) map.addImage(name, picture, { pixelRatio: ratio });
  };

  picture.src = url;
}

const VEHICLE_LAYERS = [VEHICLE_GLOW_LAYER, VEHICLE_LAYER];

function paintUserLocation(map: MapLibreMap) {
  if (map.getLayer(LOCATION_HALO_LAYER)) return;

  map.addLayer({
    id: LOCATION_HALO_LAYER,
    type: 'circle',
    source: LOCATION_SOURCE,
    paint: {
      'circle-radius': LOCATION_HALO_RADIUS,
      'circle-color': '#3b82f6',
      'circle-opacity': 0.22,
    },
  });

  map.addLayer({
    id: LOCATION_DOT_LAYER,
    type: 'circle',
    source: LOCATION_SOURCE,
    paint: {
      'circle-radius': LOCATION_DOT_RADIUS,
      'circle-color': '#3b82f6',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  });
}

function paintVehicle(map: MapLibreMap) {
  if (map.getLayer(VEHICLE_LAYER)) return;

  map.addLayer({
    id: VEHICLE_GLOW_LAYER,
    type: 'circle',
    source: VEHICLE_SOURCE,
    paint: {
      'circle-radius': vehicleGlowRadius as never,
      'circle-color': '#FFCC00',
      'circle-opacity': 0.32,
      'circle-blur': 1,
    },
  });

  map.addLayer({
    id: VEHICLE_LAYER,
    type: 'symbol',
    source: VEHICLE_SOURCE,
    layout: {
      'icon-image': VEHICLE_IMAGE,
      'icon-size': vehicleSize as never,
      'icon-rotate': ['get', 'bearing'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
}

function showChosenStop(map: MapLibreMap, stopId: string) {
  if (!map.getLayer(SELECTED_LAYER)) return;

  const chosen = ['==', ['get', 'stopId'], stopId] as never;

  map.setFilter(SELECTED_LAYER, chosen);
  map.setFilter(SELECTED_DOT_LAYER, chosen);
}

function colourRoute(map: MapLibreMap, route: SelectedRoute) {
  if (map.getLayer(ROUTE_LINE_LAYER)) {
    map.setPaintProperty(ROUTE_LINE_LAYER, 'line-color', route.colour);
  }

  if (map.getLayer(WAYPOINTS_LAYER)) {
    map.setPaintProperty(WAYPOINTS_LAYER, 'circle-color', route.textColour);
    map.setPaintProperty(WAYPOINTS_LAYER, 'circle-stroke-color', route.colour);
  }
}

function mutePassingStops(map: MapLibreMap, following: boolean) {
  if (!map.getLayer(STOPS_LAYER)) return;

  map.setPaintProperty(STOPS_LAYER, 'circle-radius', (following ? mutedStopRadius : stopRadius) as never);
  map.setPaintProperty(
    STOPS_LAYER,
    'circle-stroke-width',
    (following ? mutedStopStrokeWidth : stopStrokeWidth) as never
  );
}

function lightenRoadNames(map: MapLibreMap, over: boolean) {
  for (const id of ROAD_LABEL_LAYERS) {
    if (!map.getLayer(id)) continue;

    map.setPaintProperty(id, 'text-color', over ? '#ffffff' : '#a8a8a8');
    map.setPaintProperty(id, 'text-halo-color', over ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.4)');
    map.setPaintProperty(id, 'text-halo-width', over ? 1.4 : 1);
  }
}

function paintRoute(map: MapLibreMap, before?: string) {
  if (map.getLayer(ROUTE_CASING_LAYER)) return;

  if (!map.hasImage(ROUTE_ARROW_IMAGE)) {
    map.addImage(ROUTE_ARROW_IMAGE, arrowImage(), { sdf: true });
  }

  map.addLayer({
    id: ROUTE_CASING_LAYER,
    type: 'line',
    source: ROUTE_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': routeCasingWidth as never },
  }, before);

  map.addLayer({
    id: ROUTE_LINE_LAYER,
    type: 'line',
    source: ROUTE_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#E53935', 'line-width': routeLineWidth as never },
  }, before);

  map.addLayer({
    id: ROUTE_ARROWS_LAYER,
    type: 'symbol',
    source: ROUTE_SOURCE,
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': routeArrowSpacing as never,
      'icon-image': ROUTE_ARROW_IMAGE,
      'icon-size': routeArrowSize as never,
      'icon-anchor': 'center',
      'icon-rotation-alignment': 'map',
      'icon-keep-upright': false,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-color': '#ffffff', 'icon-opacity': 0.8 },
  }, before);
}

function paintStops(map: MapLibreMap, isDarkMap: boolean, before?: string) {
  if (map.getLayer(STOPS_LAYER)) return;

  map.addLayer({
    id: STOPS_LAYER,
    type: 'circle',
    source: STOPS_SOURCE,
    paint: {
      'circle-radius': stopRadius as never,
      'circle-color': '#FFCC00',
      'circle-opacity': 0.9,
      'circle-stroke-width': stopStrokeWidth as never,
      'circle-stroke-color': isDarkMap ? '#0d1117' : '#1A1A1A',
    },
  }, before);

  map.addLayer({
    id: WAYPOINTS_LAYER,
    type: 'circle',
    source: WAYPOINTS_SOURCE,
    paint: {
      'circle-radius': waypointRadius as never,
      'circle-color': '#ffffff',
      'circle-stroke-width': waypointStrokeWidth as never,
      'circle-stroke-color': '#E53935',
    },
  }, before);

  map.addLayer({
    id: SELECTED_DOT_LAYER,
    type: 'circle',
    source: STOPS_SOURCE,
    filter: ['==', ['get', 'stopId'], ''],
    paint: {
      'circle-radius': selectedDotRadius as never,
      'circle-color': '#ffffff',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#1A1A1A',
    },
  });

  map.addLayer({
    id: SELECTED_LAYER,
    type: 'symbol',
    source: STOPS_SOURCE,
    filter: ['==', ['get', 'stopId'], ''],
    layout: {
      'icon-image': SELECTED_PIN_IMAGE,
      'icon-size': selectedPinSize as never,
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
}

export default function VectorMap({
  stops,
  selectedStop,
  route,
  vehicle,
  panelOpen,
  panelExpanded,
  isDarkMap,
  loadingStops,
  onStopSelect,
  onToggleMapTheme,
}: VectorMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const collection = useRef(toStopCollection(stops));
  const shape = useRef(toRouteCollection(route.shape));
  const waypoints = useRef(toWaypointCollection(route.stops));
  const known = useRef(stops);
  const select = useRef(onStopSelect);
  const dark = useRef(isDarkMap);
  const drawnAt = useRef<Placed | null>(placeVehicle(vehicle));
  const latest = useRef({ vehicle, selectedStop, route });
  const sliding = useRef(0);
  const fix = useRef<Fix | null>(null);

  useEffect(() => {
    latest.current = { vehicle, selectedStop, route };
  });

  useEffect(() => {
    select.current = onStopSelect;
  }, [onStopSelect]);

  useEffect(() => {
    collection.current = toStopCollection(stops);
    known.current = stops;

    const source = map.current?.getSource(STOPS_SOURCE) as GeoJSONSource | undefined;

    source?.setData(collection.current as never);
  }, [stops]);

  useEffect(() => {
    const instance = map.current;

    shape.current = toRouteCollection(route.shape);
    waypoints.current = toWaypointCollection(route.stops);

    (instance?.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined)?.setData(shape.current as never);
    (instance?.getSource(WAYPOINTS_SOURCE) as GeoJSONSource | undefined)?.setData(waypoints.current as never);

    if (!instance) return;

    const following = shape.current.features.length > 0;

    colourRoute(instance, route);
    lightenRoadNames(instance, following);
    mutePassingStops(instance, following);
  }, [route]);

  useEffect(() => {
    const instance = map.current;
    const target = placeVehicle(vehicle);
    const source = instance?.getSource(VEHICLE_SOURCE) as GeoJSONSource | undefined;

    cancelAnimationFrame(sliding.current);

    if (!target || !drawnAt.current || tooFarToSlide(drawnAt.current, target)) {
      drawnAt.current = target;
      source?.setData(toVehicleCollection(target) as never);

      return;
    }

    const from = drawnAt.current;
    const started = performance.now();

    const step = () => {
      const fraction = (performance.now() - started) / SLIDE_MS;
      const now = slideBetween(from, target, fraction);

      drawnAt.current = now;
      source?.setData(toVehicleCollection(now) as never);

      if (fraction < 1) sliding.current = requestAnimationFrame(step);
    };

    sliding.current = requestAnimationFrame(step);

    return () => cancelAnimationFrame(sliding.current);
  }, [vehicle]);

  const easeToPoint = useCallback((point: Fix, zoom: number) => {
    const instance = map.current;
    const box = container.current?.getBoundingClientRect();

    if (!instance || !box) return;

    const panel = document.getElementById(PANEL_ELEMENT_ID)?.getBoundingClientRect() ?? null;

    instance.easeTo({
      center: [point.lon, point.lat],
      zoom,
      padding: framePadding(box.width, box.height, coveredHeight(box, panel)),
      duration: 900,
    });
  }, []);

  const locateMe = useCallback(() => {
    if (fix.current) {
      easeToPoint(fix.current, LOCATION_ZOOM);

      return;
    }

    navigator.geolocation.getCurrentPosition(position => {
      const found = readFix(position);

      if (found) easeToPoint(found, LOCATION_ZOOM);
    }, () => {}, { enableHighAccuracy: true, timeout: 5000 });
  }, [easeToPoint]);

  const backToStop = useCallback(() => {
    const chosen = latest.current.selectedStop;
    const lon = Number(chosen?.lon);
    const lat = Number(chosen?.lat);

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;

    easeToPoint({ lon, lat }, 16);
  }, [easeToPoint]);

  useEffect(() => {
    const watch = navigator.geolocation.watchPosition(
      position => {
        const found = readFix(position);

        if (!found) return;

        fix.current = found;

        const source = map.current?.getSource(LOCATION_SOURCE) as GeoJSONSource | undefined;

        source?.setData(toLocationCollection(found) as never);

        if (!sessionStorage.getItem(LOCATED_ONCE_KEY)) {
          sessionStorage.setItem(LOCATED_ONCE_KEY, '1');
          easeToPoint(found, LOCATION_ZOOM);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watch);
  }, [easeToPoint]);

  const fitToVehicle = useCallback(() => {
    const instance = map.current;
    const box = container.current?.getBoundingClientRect();
    const bus = placeVehicle(latest.current.vehicle);
    const chosen = latest.current.selectedStop;
    const lon = Number(chosen?.lon);
    const lat = Number(chosen?.lat);
    const stop = Number.isFinite(lon) && Number.isFinite(lat) ? { lon, lat } : null;

    if (!instance || !box) return;

    if (!bus) {
      if (stop) easeToPoint(stop, FRAME_STOP_ZOOM);

      return;
    }

    const frame = frameAround(stop ? [stop, bus] : [bus]);

    if (!frame) return;

    const panel = document.getElementById(PANEL_ELEMENT_ID)?.getBoundingClientRect() ?? null;
    const padding = framePadding(box.width, box.height, coveredHeight(box, panel));
    const bounds: [[number, number], [number, number]] = [
      [frame.southWest.lon, frame.southWest.lat],
      [frame.northEast.lon, frame.northEast.lat],
    ];

    instance.fitBounds(bounds, { padding, duration: 900, maxZoom: FRAME_MAX_ZOOM });
  }, [easeToPoint]);

  useEffect(() => {
    fitToVehicle();
  }, [vehicle, selectedStop, fitToVehicle]);

  useEffect(() => {
    const timer = setTimeout(fitToVehicle, PANEL_SETTLE_MS);

    return () => clearTimeout(timer);
  }, [panelOpen, panelExpanded, fitToVehicle]);

  useEffect(() => {
    if (!container.current || map.current) return;

    const instance = new MapLibreMap({
      container: container.current,
      style: basemapStyle(dark.current),
      center: [LISBON.lon, LISBON.lat],
      zoom: LISBON.zoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });

    instance.touchZoomRotate.disableRotation();
    instance.addControl(new AttributionControl({ compact: true }), 'bottom-right');

    const dress = () => {
      if (!instance.getSource(STOPS_SOURCE)) {
        instance.addSource(STOPS_SOURCE, { type: 'geojson', data: collection.current as never });
      }

      if (!instance.getSource(ROUTE_SOURCE)) {
        instance.addSource(ROUTE_SOURCE, { type: 'geojson', data: shape.current as never });
      }

      if (!instance.getSource(WAYPOINTS_SOURCE)) {
        instance.addSource(WAYPOINTS_SOURCE, { type: 'geojson', data: waypoints.current as never });
      }

      if (!instance.getSource(LOCATION_SOURCE)) {
        instance.addSource(LOCATION_SOURCE, {
          type: 'geojson',
          data: toLocationCollection(fix.current) as never,
        });
      }

      if (!instance.getSource(VEHICLE_SOURCE)) {
        instance.addSource(VEHICLE_SOURCE, {
          type: 'geojson',
          data: toVehicleCollection(drawnAt.current) as never,
        });
      }

      loadImageFile(instance, SELECTED_PIN_IMAGE, SELECTED_PIN_URL, 96, 124);
      loadImageFile(
        instance,
        VEHICLE_IMAGE,
        VEHICLE_IMAGE_URL,
        VEHICLE_IMAGE_WIDTH,
        VEHICLE_IMAGE_HEIGHT,
        VEHICLE_IMAGE_RATIO
      );

      const before = firstLabelLayer(instance);

      paintRoute(instance, before);
      paintStops(instance, dark.current, before);
      paintUserLocation(instance);
      paintVehicle(instance);

      colourRoute(instance, latest.current.route);
      mutePassingStops(instance, shape.current.features.length > 0);
      showChosenStop(instance, latest.current.selectedStop?.id ?? '');

      for (const id of VEHICLE_LAYERS) {
        if (instance.getLayer(id)) instance.moveLayer(id);
      }

      lightenRoadNames(instance, shape.current.features.length > 0);
    };

    instance.on('load', dress);
    instance.on('style.load', dress);

    instance.on('click', STOPS_LAYER, event => {
      const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
      const stopId = feature?.properties?.stopId as string | undefined;
      const stop = stopId ? known.current.find(candidate => candidate.id === stopId) : undefined;

      if (stop) select.current(stop);
    });

    instance.on('mouseenter', STOPS_LAYER, () => {
      instance.getCanvas().style.cursor = 'pointer';
    });

    instance.on('mouseleave', STOPS_LAYER, () => {
      instance.getCanvas().style.cursor = '';
    });

    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;

    dark.current = isDarkMap;

    instance?.setStyle(basemapStyle(isDarkMap));
  }, [isDarkMap]);

  useEffect(() => {
    const instance = map.current;

    if (!instance) return;

    showChosenStop(instance, selectedStop?.id ?? '');
  }, [selectedStop]);

  return (
    <div className={`w-full h-full relative ${isDarkMap ? 'bg-[#0d1117]' : 'bg-[#e5e3df]'}`}>
      {loadingStops && (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center pointer-events-none bg-carris-dark/50 backdrop-blur-sm">
          <div className="text-carris-yellow font-bold text-lg animate-pulse">A carregar paragens...</div>
        </div>
      )}

      <div ref={container} className="w-full h-full" />

      <MapControls
        panelOpen={panelOpen}
        panelExpanded={panelExpanded}
        isDarkMap={isDarkMap}
        hasStop={!!selectedStop}
        onToggleMapTheme={onToggleMapTheme}
        onLocate={locateMe}
        onBackToStop={backToStop}
      />
    </div>
  );
}
