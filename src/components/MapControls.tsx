import type { CSSProperties } from 'react';
import AlertsPanel from './AlertsPanel';
import ReliabilityPanel from './ReliabilityPanel';

interface MapControlsProps {
  panelOpen: boolean;
  panelExpanded: boolean;
  isDarkMap: boolean;
  hasStop: boolean;
  onToggleMapTheme: () => void;
  onLocate: () => void;
  onBackToStop: () => void;
}

function stackBottom(panelOpen: boolean, panelExpanded: boolean): CSSProperties {
  if (!panelOpen) return { bottom: 'calc(1rem + env(safe-area-inset-bottom))' };
  if (panelExpanded) return { bottom: 'calc(55% + 1rem)' };

  return { bottom: 'calc(80px + 1rem + env(safe-area-inset-bottom))' };
}

export default function MapControls({
  panelOpen,
  panelExpanded,
  isDarkMap,
  hasStop,
  onToggleMapTheme,
  onLocate,
  onBackToStop,
}: MapControlsProps) {
  return (
    <div
      className="absolute right-4 md:right-6 z-[1001] flex flex-col gap-3 items-center pointer-events-none transition-all duration-300"
      style={stackBottom(panelOpen, panelExpanded)}
    >
      <AlertsPanel />

      <ReliabilityPanel />

      <button
        className="btn-floating-dark pointer-events-auto w-11 h-11 rounded-full flex items-center justify-center text-white/95"
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

      <button
        className="btn-floating-dark pointer-events-auto w-11 h-11 rounded-full flex items-center justify-center text-carris-yellow"
        onClick={onLocate}
        title="Ir para a minha localização"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M3 11.5l18-9.5-9.5 18-1.5-7.5z"/>
        </svg>
      </button>

      {hasStop && (
        <button
          className="btn-floating-yellow pointer-events-auto w-11 h-11 text-carris-dark rounded-full flex items-center justify-center"
          onClick={onBackToStop}
          title="Voltar à minha paragem"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z" />
            <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      )}
    </div>
  );
}
