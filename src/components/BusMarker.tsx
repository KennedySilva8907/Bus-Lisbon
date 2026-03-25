import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { memo, useEffect, useRef } from 'react';
import type { Vehicle } from '../services/api';

// ── Icon cache — reuse DivIcon instances by rounded heading + selected state ──
const iconCache = new Map<string, L.DivIcon>();

function getCachedBusIcon(heading: number, isSelected?: boolean): L.DivIcon {
  // Top-down SVG points up (0°=North) — rotate directly by bearing
  const rounded = Math.round(heading / 10) * 10;
  const key = `${rounded}_${isSelected ? '1' : '0'}`;

  let icon = iconCache.get(key);
  if (icon) return icon;

  // Simple top-down bus: yellow rounded rect + dark windshield + dark outline
  const busSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 34" width="14" height="34">
    <rect x="0" y="0" width="14" height="34" rx="4" fill="#1a1a1a" opacity="0.5"/>
    <rect x="1" y="1" width="12" height="32" rx="3" fill="#FFCC00"/>
    <rect x="2.5" y="2.5" width="9" height="6" rx="2" fill="#1a1a2e" opacity="0.7"/>
  </svg>`;

  const shadow = isSelected
    ? 'filter:drop-shadow(0 0 8px rgba(255,204,0,0.6)) drop-shadow(0 0 3px rgba(0,0,0,0.8))'
    : 'filter:drop-shadow(0 0 3px rgba(0,0,0,0.8)) drop-shadow(0 1px 2px rgba(0,0,0,0.6))';

  icon = new L.DivIcon({
    className: 'bg-transparent',
    html: `
      <div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;position:relative;">
        ${isSelected ? '<div style="position:absolute;width:44px;height:44px;border-radius:50%;background:rgba(255,204,0,0.4);animation:bus-pulse 1.5s ease-in-out infinite;"></div>' : ''}
        <div style="position:absolute;width:32px;height:32px;border-radius:50%;background:rgba(255,204,0,0.3);animation:bus-ping 1.5s ease-out infinite;"></div>
        <div style="position:relative;z-index:2;transform:rotate(${rounded}deg);${shadow}">
          ${busSvg}
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });

  iconCache.set(key, icon);
  return icon;
}

// ── Smooth animation — interpolate marker position over ~1s ──
function animateMarker(marker: L.Marker, from: L.LatLng, to: L.LatLng, duration = 1000) {
  const start = performance.now();
  const fromLat = from.lat;
  const fromLng = from.lng;
  const dLat = to.lat - fromLat;
  const dLng = to.lng - fromLng;

  function step(now: number) {
    const elapsed = now - start;
    const t = Math.min(elapsed / duration, 1);
    // Ease-out cubic for natural deceleration
    const ease = 1 - Math.pow(1 - t, 3);
    marker.setLatLng([fromLat + dLat * ease, fromLng + dLng * ease]);
    if (t < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

interface BusMarkerProps {
  vehicle: Vehicle;
  isSelected?: boolean;
}

const BusMarker = memo(function BusMarker({ vehicle, isSelected }: BusMarkerProps) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);
  const prevPosRef = useRef<L.LatLng | null>(null);

  const lat = Number(vehicle.lat);
  const lon = Number(vehicle.lon);
  const validPos = !isNaN(lat) && !isNaN(lon);

  useEffect(() => {
    if (!validPos) return;

    const newPos = L.latLng(lat, lon);
    const icon = getCachedBusIcon(vehicle.bearing || vehicle.heading || 0, isSelected);

    if (!markerRef.current) {
      // First render — create marker
      markerRef.current = L.marker(newPos, {
        icon,
        zIndexOffset: isSelected ? 1000 : 100,
      }).addTo(map);

      // Popup
      markerRef.current.bindPopup(
        `<div class="font-bold text-center">Bus ${vehicle.id}</div>
         <div class="text-xs opacity-80 text-center mt-1">Line ${vehicle.line_id}</div>
         <div class="text-xs opacity-80 text-center mt-1">Speed: ${Math.round(vehicle.speed * 3.6)} km/h</div>`,
        { className: 'bus-popup' }
      );

      prevPosRef.current = newPos;
    } else {
      // Update icon (cached, so same object if heading didn't change)
      markerRef.current.setIcon(icon);
      markerRef.current.setZIndexOffset(isSelected ? 1000 : 100);

      // Update popup content
      markerRef.current.setPopupContent(
        `<div class="font-bold text-center">Bus ${vehicle.id}</div>
         <div class="text-xs opacity-80 text-center mt-1">Line ${vehicle.line_id}</div>
         <div class="text-xs opacity-80 text-center mt-1">Speed: ${Math.round(vehicle.speed * 3.6)} km/h</div>`
      );

      // Smooth animate to new position
      const prev = prevPosRef.current;
      if (prev && prev.distanceTo(newPos) > 5) {
        animateMarker(markerRef.current, prev, newPos, 1000);
      } else if (!prev) {
        markerRef.current.setLatLng(newPos);
      }
      prevPosRef.current = newPos;
    }

    return undefined;
  }, [lat, lon, vehicle.bearing, vehicle.heading, vehicle.id, vehicle.line_id, vehicle.speed, isSelected, map, validPos]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    };
  }, []);

  return null;
});

export default BusMarker;
