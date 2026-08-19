import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, NavigationControl, type GeoJSONSource, type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LISBON, basemapStyle } from '../services/basemap';
import {
  SELECTED_LAYER,
  STOPS_LAYER,
  STOPS_MIN_ZOOM,
  STOPS_SOURCE,
  selectedStopRadius,
  stopRadius,
  toStopCollection,
} from '../services/stopsLayer';
import type { Stop } from '../services/api';

interface VectorMapProps {
  stops: Stop[];
  selectedStop: Stop | null;
  isDarkMap: boolean;
  onStopSelect: (stop: Stop) => void;
}

function paintStops(map: MapLibreMap, isDarkMap: boolean) {
  if (map.getLayer(STOPS_LAYER)) return;

  map.addLayer({
    id: STOPS_LAYER,
    type: 'circle',
    source: STOPS_SOURCE,
    minzoom: STOPS_MIN_ZOOM,
    paint: {
      'circle-radius': stopRadius as never,
      'circle-color': '#FFCC00',
      'circle-opacity': 0.9,
      'circle-stroke-width': ['step', ['zoom'], 1.5, 16, 2] as never,
      'circle-stroke-color': isDarkMap ? '#0d1117' : '#1A1A1A',
    },
  });

  map.addLayer({
    id: SELECTED_LAYER,
    type: 'circle',
    source: STOPS_SOURCE,
    minzoom: STOPS_MIN_ZOOM,
    filter: ['==', ['get', 'stopId'], ''],
    paint: {
      'circle-radius': selectedStopRadius as never,
      'circle-color': '#FFCC00',
      'circle-opacity': 0.25,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#FFCC00',
    },
  });
}

export default function VectorMap({ stops, selectedStop, isDarkMap, onStopSelect }: VectorMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const collection = useRef(toStopCollection(stops));
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

      paintStops(instance, startedDark.current);
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

    if (!instance || !instance.getLayer(SELECTED_LAYER)) return;

    instance.setFilter(SELECTED_LAYER, ['==', ['get', 'stopId'], selectedStop?.id ?? '']);
  }, [selectedStop]);

  return <div ref={container} className="w-full h-full" />;
}
