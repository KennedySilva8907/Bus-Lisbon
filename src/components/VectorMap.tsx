import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LISBON, basemapStyle } from '../services/basemap';

interface VectorMapProps {
  isDarkMap: boolean;
  onReady?: (map: MapLibreMap) => void;
}

export default function VectorMap({ isDarkMap, onReady }: VectorMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const ready = useRef(onReady);

  useEffect(() => {
    ready.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (!container.current || map.current) return;

    const instance = new MapLibreMap({
      container: container.current,
      style: basemapStyle(isDarkMap),
      center: [LISBON.lon, LISBON.lat],
      zoom: LISBON.zoom,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });

    instance.touchZoomRotate.disableRotation();
    instance.addControl(new NavigationControl({ showCompass: false }), 'bottom-left');

    instance.on('load', () => ready.current?.(instance));

    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
    };
  }, [isDarkMap]);

  useEffect(() => {
    map.current?.setStyle(basemapStyle(isDarkMap));
  }, [isDarkMap]);

  return <div ref={container} className="w-full h-full" />;
}
