import { useState, useRef, useEffect, useMemo } from 'react';
import { useAllStops, type Stop } from '../services/api';
import { Star } from 'lucide-react';
import { isCarrisLisboaStop } from '../utils/operatorColors';

interface SearchBarProps {
  onStopSelect: (stop: Stop) => void;
  favorites?: string[];
}

export default function SearchBar({ onStopSelect, favorites = [] }: SearchBarProps) {
  const { stops } = useAllStops();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce the query so we don't filter 12K stops on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Filter stops: Top 8 matches by name or ID (memoized)
  const filteredStops = useMemo(() => {
    if (debouncedQuery.length < 2) return [];
    const q = debouncedQuery.toLowerCase();
    const results: Stop[] = [];
    for (const stop of stops) {
      if (results.length >= 8) break;
      if (stop.name?.toLowerCase().includes(q) || stop.id.includes(debouncedQuery)) {
        results.push(stop);
      }
    }
    return results;
  }, [debouncedQuery, stops]);

  // Favorite stops (only when no search query)
  const favoriteStops = useMemo(() => {
    if (favorites.length === 0) return [];
    return stops.filter(s => favorites.includes(s.id));
  }, [stops, favorites]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showFavorites = isOpen && debouncedQuery.length < 2 && favoriteStops.length > 0;
  const showResults = isOpen && filteredStops.length > 0;
  const showEmpty = isOpen && debouncedQuery.length >= 2 && filteredStops.length === 0;

  return (
    <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-4 right-4 z-[2000] md:w-96 md:left-4" ref={containerRef}>
      <div className="bg-carris-gray/90 backdrop-blur-md rounded-xl p-4 shadow-2xl border border-white/5 border-t-white/10 flex items-center justify-between text-white transition-all hover:bg-carris-gray focus-within:ring-2 focus-within:ring-carris-yellow relative">
        <input
          type="text"
          placeholder="Pesquisar paragens, IDs ou locais..."
          className="bg-transparent border-none outline-none text-white placeholder-gray-400 w-full"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        {(query.length > 0 && isOpen) ? (
          <button onClick={() => { setQuery(''); setDebouncedQuery(''); setIsOpen(false); }} className="p-1 hover:bg-white/10 rounded-full mx-1 cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-carris-yellow flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        )}
      </div>

      {/* Favorites dropdown (when search is empty) */}
      {showFavorites && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-carris-gray/95 backdrop-blur-md rounded-xl shadow-2xl border border-white/10 overflow-hidden transform origin-top transition-all">
          <div className="px-3 pt-3 pb-1">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Star size={10} className="text-carris-yellow" />
              Favoritos
            </h3>
          </div>
          <ul className="max-h-64 overflow-y-auto custom-scrollbar">
            {favoriteStops.map(stop => (
              <li
                key={stop.id}
                onClick={() => {
                  onStopSelect(stop);
                  setIsOpen(false);
                  setQuery('');
                  setDebouncedQuery('');
                }}
                className="p-3 border-b border-white/5 hover:bg-white/5 cursor-pointer flex justify-between items-center transition-colors last:border-0"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-carris-light max-w-[200px] truncate">{stop.name}</span>
                  <span className="text-xs text-gray-400">{stop.locality || 'Unknown'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Star size={12} className={isCarrisLisboaStop(stop.id) ? 'text-carris-green' : 'text-carris-yellow'} fill="currentColor" />
                  <div className={`bg-carris-dark text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider ${
                    isCarrisLisboaStop(stop.id) ? 'text-carris-green' : 'text-carris-yellow'
                  }`}>
                    #{stop.id}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Search results dropdown */}
      {showResults && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-carris-gray/95 backdrop-blur-md rounded-xl shadow-2xl border border-white/10 overflow-hidden transform origin-top transition-all">
          <ul className="max-h-64 overflow-y-auto custom-scrollbar">
            {filteredStops.map(stop => (
              <li
                key={stop.id}
                onClick={() => {
                  onStopSelect(stop);
                  setIsOpen(false);
                  setQuery('');
                  setDebouncedQuery('');
                }}
                className="p-3 border-b border-white/5 hover:bg-white/5 cursor-pointer flex justify-between items-center transition-colors last:border-0"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-carris-light max-w-[200px] truncate">{stop.name}</span>
                  <span className="text-xs text-gray-400">
                    {stop.operator === 'carris_lisboa' ? 'Carris Lisboa' : (stop.locality || 'Unknown')}
                  </span>
                </div>
                <div className={`bg-carris-dark text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider ${
                  isCarrisLisboaStop(stop.id) ? 'text-carris-green' : 'text-carris-yellow'
                }`}>
                  #{stop.id}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No results */}
      {showEmpty && (
         <div className="absolute top-full left-0 right-0 mt-2 p-4 text-center text-gray-400 bg-carris-gray/95 backdrop-blur-md rounded-xl shadow-2xl border border-white/10">
           Nenhuma paragem encontrada.
         </div>
      )}
    </div>
  );
}
