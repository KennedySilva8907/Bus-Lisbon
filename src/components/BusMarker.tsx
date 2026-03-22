import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { memo } from 'react';
import type { Vehicle } from '../services/api';
import { getOperatorColor } from '../utils/operatorColors';

// Generates a bus icon with a directional arrow
const getBusIcon = (heading: number, isSelected?: boolean, lineId?: string) => {
  const color = getOperatorColor(lineId);
  return new L.DivIcon({
    className: 'bg-transparent',
    html: `
    <div class="relative w-8 h-8 flex items-center justify-center">
      ${isSelected ? `<div class="absolute w-12 h-12 rounded-full animate-pulse z-0" style="background-color: ${color}; opacity: 0.5;"></div>` : ''}
      <div class="absolute w-8 h-8 rounded-full animate-ping z-0" style="background-color: ${color}; opacity: 0.4;"></div>
      <div
        class="absolute w-6 h-6 border-2 rounded-full flex items-center justify-center shadow-lg pointer-events-none z-20"
        style="border-color: ${isSelected ? 'white' : '#121212'}; background-color: ${isSelected ? color : '#F5F5F5'};"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-carris-dark">
          <path d="M4 6 5.8 3.3a2 2 0 0 1 1.6-.8h9.2a2 2 0 0 1 1.6.8L20 6c.9 1.5 1 3.5 1 5.5v5a2 2 0 0 1-2 2h-1v-1a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v1H5a2 2 0 0 1-2-2v-5C3 9.5 3.1 7.5 4 6ZM4 11h16"/>
          <path d="M8 15h.01"/>
          <path d="M16 15h.01"/>
        </svg>
      </div>
      <div
        class="absolute inset-0 z-10 opacity-40 rounded-full"
        style="transform: rotate(${heading}deg); border-top: 4px solid ${isSelected ? '#FFFFFF' : color}; border-right: 4px solid transparent; border-left: 4px solid transparent; border-radius: 50%;"
      ></div>
    </div>
  `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

interface BusMarkerProps {
  vehicle: Vehicle;
  isSelected?: boolean;
}

const BusMarker = memo(function BusMarker({ vehicle, isSelected }: BusMarkerProps) {
  const lat = Number(vehicle.lat);
  const lon = Number(vehicle.lon);

  if (isNaN(lat) || isNaN(lon)) return null;

  return (
    <Marker
      position={[lat, lon]}
      icon={getBusIcon(vehicle.bearing || vehicle.heading || 0, isSelected, vehicle.line_id)}
      zIndexOffset={isSelected ? 1000 : 100} // make sure selected buses are on top
    >
      <Popup className="bus-popup">
        <div className="font-bold text-center">Bus {vehicle.id}</div>
        <div className="text-xs opacity-80 text-center mt-1">Line {vehicle.line_id}</div>
        <div className="text-xs opacity-80 text-center mt-1">Speed: {Math.round(vehicle.speed * 3.6)} km/h</div>
      </Popup>
    </Marker>
  );
});

export default BusMarker;
