import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, NavigationControl, type GeoJSONSource, type MapGeoJSONFeature } from 'maplibre-gl';
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
import type { Stop } from '../services/api';

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
  isDarkMap: boolean;
  onStopSelect: (stop: Stop) => void;
}

function firstLabelLayer(map: MapLibreMap): string | undefined {
  return map.getStyle().layers.find(layer => layer.type === 'symbol')?.id;
}

function loadPin(map: MapLibreMap) {
  if (map.hasImage(SELECTED_PIN_IMAGE)) return;

  const pin = new Image(96, 124);

  pin.onload = () => {
    if (!map.hasImage(SELECTED_PIN_IMAGE)) map.addImage(SELECTED_PIN_IMAGE, pin);
  };

  pin.src = SELECTED_PIN_URL;
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

export default function VectorMap({ stops, selectedStop, route, isDarkMap, onStopSelect }: VectorMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const collection = useRef(toStopCollection(stops));
  const shape = useRef(toRouteCollection(route.shape));
  const waypoints = useRef(toWaypointCollection(route.stops));
  const known = useRef(stops);
  const select = useRef(onStopSelect);
  const startedDark = useRef(isDarkMap);

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

    if (instance.getLayer(ROUTE_LINE_LAYER)) {
      instance.setPaintProperty(ROUTE_LINE_LAYER, 'line-color', route.colour);
    }

    if (instance.getLayer(WAYPOINTS_LAYER)) {
      instance.setPaintProperty(WAYPOINTS_LAYER, 'circle-color', route.textColour);
      instance.setPaintProperty(WAYPOINTS_LAYER, 'circle-stroke-color', route.colour);
    }

    lightenRoadNames(instance, following);

    if (instance.getLayer(STOPS_LAYER)) {
      instance.setPaintProperty(STOPS_LAYER, 'circle-radius', (following ? mutedStopRadius : stopRadius) as never);
      instance.setPaintProperty(
        STOPS_LAYER,
        'circle-stroke-width',
        (following ? mutedStopStrokeWidth : stopStrokeWidth) as never
      );
    }
  }, [route]);

  useEffect(() => {
    if (!container.current || map.current) return;

    const instance = new MapLibreMap({
      container: container.current,
      style: basemapStyle(startedDark.current),
      center: [LISBON.lon, LISBON.lat],
      zoom: LISBON.zoom,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });

    instance.touchZoomRotate.disableRotation();
    instance.addControl(new NavigationControl({ showCompass: false }), 'bottom-left');

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

      loadPin(instance);

      const before = firstLabelLayer(instance);

      paintRoute(instance, before);
      paintStops(instance, startedDark.current, before);
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

    if (!instance) return;

    instance.setStyle(basemapStyle(isDarkMap));

    if (instance.getLayer(STOPS_LAYER)) {
      instance.setPaintProperty(STOPS_LAYER, 'circle-stroke-color', isDarkMap ? '#0d1117' : '#1A1A1A');
    }
  }, [isDarkMap]);

  useEffect(() => {
    const instance = map.current;

    if (!instance || !instance.getLayer(SELECTED_LAYER)) return;

    const chosen = ['==', ['get', 'stopId'], selectedStop?.id ?? ''] as never;

    instance.setFilter(SELECTED_LAYER, chosen);
    instance.setFilter(SELECTED_DOT_LAYER, chosen);
  }, [selectedStop]);

  return <div ref={container} className="w-full h-full" />;
}
