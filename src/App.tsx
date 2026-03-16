import { useState } from 'react';
import TrackingMap from './components/TrackingMap';
import StopDetailsPanel from './components/StopDetailsPanel';
import SearchBar from './components/SearchBar';
import type { Stop } from './services/api';
import { useFavorites } from './hooks/useFavorites';

function App() {
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);
  const [isDarkMap, setIsDarkMap] = useState(() => {
    const saved = localStorage.getItem('bdt-dark-map');
    return saved !== null ? saved === 'true' : true; // default dark
  });
  const { favorites, toggle: toggleFavorite, isFavorite } = useFavorites();

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
    <div className="w-screen h-screen relative bg-carris-dark overflow-hidden flex flex-col md:flex-row">

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

      {/* Bottom/Side Panel */}
      {selectedStop ? (
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
      ) : (
        <aside className="absolute bottom-0 w-full h-1/3 md:relative md:h-full md:w-96 bg-carris-gray z-[1000] shadow-2xl flex-shrink-0 flex flex-col rounded-t-3xl md:rounded-l-3xl md:rounded-tr-none transform transition-transform duration-300 translate-y-full md:translate-y-0 md:translate-x-full">
           <div className="p-6 flex-1 text-white flex flex-col justify-center items-center text-center opacity-50">
             <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-carris-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z" />
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
               </svg>
             </div>
             <h2 className="text-xl font-bold mb-2">Selecione uma Paragem</h2>
             <p className="text-sm text-gray-400 max-w-[200px]">Clique numa paragem no mapa ou pesquise acima para ver chegadas em tempo real.</p>
           </div>
        </aside>
      )}

    </div>
  )
}

export default App
