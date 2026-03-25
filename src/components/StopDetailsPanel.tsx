import { useStopETA, type Stop } from '../services/api';
import { fromUnixTime } from 'date-fns';
import { X, Star, ChevronUp } from 'lucide-react';
import { useRef, useEffect, useState, useMemo } from 'react';
import { recordDeviation } from '../services/history';

interface StopDetailsPanelProps {
  stop: Stop | null;
  onClose: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  selectedVehicleId?: string | null;
  selectedPatternId?: string | null;
  onVehicleSelect?: (vehicleId: string | null, patternId?: string, lineId?: string) => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

export default function StopDetailsPanel({ stop, onClose, isExpanded, onToggleExpand, selectedVehicleId, selectedPatternId, onVehicleSelect, isFavorite, onToggleFavorite }: StopDetailsPanelProps) {
  const { etas, isLoading } = useStopETA(stop?.id || null);
  const panelRef = useRef<HTMLElement>(null);
  const touchRef = useRef({ startY: 0, isDragging: false, isOnHandle: false });
  const [showAllPast, setShowAllPast] = useState(false);

  // Reset showAllPast when stop changes
  useEffect(() => {
    setShowAllPast(false);
  }, [stop?.id]);

  if (!stop) return null;

  const nowUnix = Math.floor(Date.now() / 1000);

  // Split into past and future arrivals (memoized to avoid re-renders)
  const { pastEtas, futureEtas, recentPast, olderPast } = useMemo(() => {
    const past = [...etas]
      .filter(eta => eta.observed_arrival_unix != null && eta.observed_arrival_unix < nowUnix)
      .sort((a, b) => ((b.observed_arrival_unix ?? 0) - (a.observed_arrival_unix ?? 0)));

    const future = [...etas]
      .filter(eta => {
        if (eta.observed_arrival_unix != null && eta.observed_arrival_unix < nowUnix) return false;
        const time = eta.estimated_arrival_unix || eta.scheduled_arrival_unix;
        // Skip stale entries whose arrival time is more than 2 minutes in the past
        if (time < nowUnix - 120) return false;
        return time < nowUnix + 7200;
      })
      .sort((a, b) => {
        const timeA = a.estimated_arrival_unix || a.scheduled_arrival_unix;
        const timeB = b.estimated_arrival_unix || b.scheduled_arrival_unix;
        return timeA - timeB;
      })
      .slice(0, 20);

    return {
      pastEtas: past,
      futureEtas: future,
      recentPast: past.slice(0, 2),
      olderPast: past.slice(2),
    };
  }, [etas, nowUnix]);

  // Record deviations for history tracking
  const futureEtaKeys = futureEtas.map(e => `${e.line_id}-${e.scheduled_arrival_unix}`).join(',');
  useEffect(() => {
    if (!stop || futureEtas.length === 0) return;
    for (const eta of futureEtas) {
      if (eta.estimated_arrival_unix && eta.scheduled_arrival_unix) {
        recordDeviation(eta.line_id, stop.id, eta.estimated_arrival_unix, eta.scheduled_arrival_unix);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [futureEtaKeys, stop?.id]);

  // ── Touch swipe handlers (only on drag handle area, not scrollable content) ──
  const handleHandleTouchStart = (e: React.TouchEvent) => {
    touchRef.current.startY = e.touches[0].clientY;
    touchRef.current.isDragging = true;
    touchRef.current.isOnHandle = true;
    if (panelRef.current) {
      panelRef.current.style.transition = 'none';
    }
  };

  const handleHandleTouchMove = (e: React.TouchEvent) => {
    if (!touchRef.current.isOnHandle || !touchRef.current.isDragging || !panelRef.current) return;
    e.preventDefault(); // prevent scroll while dragging handle
    const deltaY = e.touches[0].clientY - touchRef.current.startY;

    if (isExpanded && deltaY > 0) {
      panelRef.current.style.transform = `translateY(${deltaY}px)`;
    } else if (!isExpanded && deltaY < 0) {
      const clampedDelta = Math.max(deltaY, -(window.innerHeight * 0.55 - 80));
      panelRef.current.style.transform = `translateY(calc(100% - 80px + ${clampedDelta}px))`;
    }
  };

  const handleHandleTouchEnd = (e: React.TouchEvent) => {
    if (!touchRef.current.isOnHandle || !panelRef.current) {
      touchRef.current.isOnHandle = false;
      touchRef.current.isDragging = false;
      return;
    }
    const deltaY = e.changedTouches[0].clientY - touchRef.current.startY;
    touchRef.current.isDragging = false;
    touchRef.current.isOnHandle = false;

    panelRef.current.style.transition = '';
    panelRef.current.style.transform = '';

    if (Math.abs(deltaY) > 50) {
      if (deltaY > 0 && isExpanded) onToggleExpand();
      if (deltaY < 0 && !isExpanded) onToggleExpand();
    }
  };

  return (
    <aside
      ref={panelRef}
      className={`absolute bottom-0 w-full md:relative md:h-full md:w-96 bg-carris-gray z-[1000] shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex-shrink-0 flex flex-col rounded-t-3xl md:rounded-l-3xl md:rounded-tr-none transition-transform duration-300 ease-in-out ${
        isExpanded ? 'h-[55%] translate-y-0' : 'h-[55%] translate-y-[calc(100%-80px)] md:translate-y-0'
      }`}
    >

      {/* Drag handle for mobile swiping — touch gestures only here */}
      <div
        className="w-full flex justify-center pt-3 pb-1 md:hidden cursor-grab active:cursor-grabbing touch-none"
        onClick={onToggleExpand}
        onTouchStart={handleHandleTouchStart}
        onTouchMove={handleHandleTouchMove}
        onTouchEnd={handleHandleTouchEnd}
      >
        <div className="w-10 h-1 bg-gray-500 rounded-full"></div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 text-white custom-scrollbar flex flex-col">
        {/* Header */}
        <div
          className="flex justify-between items-center mb-3"
          onClick={() => !isExpanded && onToggleExpand()}
          onTouchStart={handleHandleTouchStart}
          onTouchMove={handleHandleTouchMove}
          onTouchEnd={handleHandleTouchEnd}
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold tracking-tight text-carris-light leading-tight truncate">{stop.name}</h2>
            <div className="text-carris-yellow text-xs font-medium mt-0.5 flex items-center gap-2">
              <span className="bg-carris-yellow/10 px-1.5 py-0.5 rounded text-[11px] text-carris-yellow border border-carris-yellow/20">
                #{stop.id}
              </span>
              {stop.locality && <span className="opacity-70 text-gray-300 text-[12px] truncate">{stop.locality}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {/* Favorite button */}
            {onToggleFavorite && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
                className={`p-2 rounded-full transition-colors ${isFavorite ? 'bg-carris-yellow/20 text-carris-yellow' : 'bg-white/5 hover:bg-white/10 text-gray-400'}`}
                aria-label={isFavorite ? 'Remover favorito' : 'Adicionar favorito'}
              >
                <Star size={16} fill={isFavorite ? 'currentColor' : 'none'} />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
              aria-label="Close panel"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ETA List */}
        <div className="flex-1 space-y-1.5">

          {isLoading ? (
            <div className="flex justify-center items-center py-10 opacity-50">
               <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-carris-yellow"></div>
            </div>
          ) : (
            <>
              {/* ── Past Arrivals Section ── */}
              {pastEtas.length > 0 && (
                <>
                  {/* "Ver passagens anteriores" expand button */}
                  {olderPast.length > 0 && (
                    <button
                      onClick={() => setShowAllPast(!showAllPast)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-carris-yellow/60 hover:text-carris-yellow/80 transition-colors text-[12px]"
                    >
                      <ChevronUp size={14} className={`transition-transform duration-300 ${showAllPast ? 'rotate-180' : ''}`} />
                      Ver passagens anteriores
                    </button>
                  )}

                  {/* Expanded older past arrivals */}
                  {showAllPast && olderPast.length > 0 && (
                    <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1.5">
                      {olderPast.map((eta, i) => {
                        const pastMin = Math.round((nowUnix - (eta.observed_arrival_unix ?? 0)) / 60);
                        const delaySec = (eta.observed_arrival_unix ?? 0) - eta.scheduled_arrival_unix;
                        let directionLabel = '';
                        let directionColor = 'text-gray-400';
                        let directionBg = 'bg-gray-400/10';
                        if (delaySec < -60) { directionLabel = 'Adiantado'; directionColor = 'text-blue-400'; directionBg = 'bg-blue-400/10'; }
                        else if (delaySec > 120) { directionLabel = `+${Math.round(delaySec / 60)}min`; directionColor = 'text-orange-400'; directionBg = 'bg-orange-400/10'; }
                        else { directionLabel = 'Pontual'; directionColor = 'text-green-400'; directionBg = 'bg-green-400/10'; }

                        return (
                          <div key={`past-old-${eta.vehicle_id || eta.line_id}-${i}`} className="flex items-center gap-3 p-2.5 rounded-xl border bg-white/[0.015] border-white/[0.03] opacity-40">
                            <div className="flex-shrink-0 w-14 text-center">
                              <div className="font-black text-sm px-2 py-1.5 rounded-lg bg-carris-yellow/20 text-carris-yellow/60">{eta.line_id}</div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-[13px] truncate leading-tight text-gray-400">{eta.headsign}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {directionLabel && <span className={`text-[10px] ${directionColor} ${directionBg} px-1.5 py-0.5 rounded-full flex-shrink-0`}>{directionLabel}</span>}
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-right pl-2">
                              <div className="font-bold text-[15px] leading-tight text-gray-500">Há {pastMin}min</div>
                              <div className="text-[10px] text-gray-500 font-mono leading-tight mt-0.5">
                                {fromUnixTime((eta.observed_arrival_unix ?? 0)).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Last 2 recent past arrivals (always visible) */}
                  {recentPast.map((eta, i) => {
                    const pastMin = Math.round((nowUnix - (eta.observed_arrival_unix ?? 0)) / 60);
                    const delaySec = (eta.observed_arrival_unix ?? 0) - eta.scheduled_arrival_unix;
                    let directionLabel = '';
                    let directionColor = 'text-gray-400';
                    let directionBg = 'bg-gray-400/10';
                    if (delaySec < -60) { directionLabel = 'Adiantado'; directionColor = 'text-blue-400'; directionBg = 'bg-blue-400/10'; }
                    else if (delaySec > 120) { directionLabel = `+${Math.round(delaySec / 60)}min`; directionColor = 'text-orange-400'; directionBg = 'bg-orange-400/10'; }
                    else { directionLabel = 'Pontual'; directionColor = 'text-green-400'; directionBg = 'bg-green-400/10'; }

                    return (
                      <div key={`past-recent-${eta.vehicle_id || eta.line_id}-${i}`} className="flex items-center gap-3 p-2.5 rounded-xl border bg-white/[0.015] border-white/[0.03] opacity-50">
                        <div className="flex-shrink-0 w-14 text-center">
                          <div className="font-black text-sm px-2 py-1.5 rounded-lg bg-carris-yellow/20 text-carris-yellow/60">{eta.line_id}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[13px] truncate leading-tight text-gray-400">{eta.headsign}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {directionLabel && <span className={`text-[10px] ${directionColor} ${directionBg} px-1.5 py-0.5 rounded-full flex-shrink-0`}>{directionLabel}</span>}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right pl-2">
                          <div className="font-bold text-[15px] leading-tight text-gray-500">Há {pastMin}min</div>
                          <div className="text-[10px] text-gray-500 font-mono leading-tight mt-0.5">
                            {fromUnixTime((eta.observed_arrival_unix ?? 0)).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Separator */}
                  <div className="border-t border-white/[0.08] my-2"></div>
                </>
              )}

              {/* ── Future Arrivals Section ── */}
              <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-white/5 pb-1.5">
                Próximas Chegadas
              </h3>

              {futureEtas.length === 0 ? (
                <div className="text-center py-10 text-gray-400 bg-white/5 rounded-xl border border-white/5">
                  Sem chegadas nos próximos 120 minutos.
                </div>
              ) : (
                futureEtas.map((eta, i) => {
                  const time = eta.estimated_arrival_unix || eta.scheduled_arrival_unix;
                  const diffMinutes = Math.round((time - nowUnix) / 60);
                  const hasVehicle = !!eta.vehicle_id;
                  const hasEstimate = !hasVehicle && !!eta.estimated_arrival_unix && eta.estimated_arrival_unix !== eta.scheduled_arrival_unix;
                  const isTracked = hasVehicle || hasEstimate;
                  const isSelected = hasVehicle
                    ? selectedVehicleId === eta.vehicle_id
                    : !selectedVehicleId && selectedPatternId === eta.pattern_id;

                  let directionLabel = '';
                  let directionColor = 'text-gray-400';
                  let directionBg = 'bg-gray-400/10';
                  if (eta.estimated_arrival_unix && eta.scheduled_arrival_unix) {
                    const delaySec = eta.estimated_arrival_unix - eta.scheduled_arrival_unix;
                    if (delaySec < -60) { directionLabel = 'Adiantado'; directionColor = 'text-blue-400'; directionBg = 'bg-blue-400/10'; }
                    else if (delaySec > 120) { directionLabel = `+${Math.round(delaySec / 60)}min`; directionColor = 'text-orange-400'; directionBg = 'bg-orange-400/10'; }
                    else { directionLabel = 'Pontual'; directionColor = 'text-green-400'; directionBg = 'bg-green-400/10'; }
                  }

                  let displayTime: string;
                  if (diffMinutes <= 0) {
                    displayTime = 'Agora';
                  } else if (diffMinutes < 60) {
                    displayTime = `${diffMinutes}min`;
                  } else {
                    const hours = Math.floor(diffMinutes / 60);
                    const mins = diffMinutes % 60;
                    displayTime = `${hours}h${mins > 0 ? String(mins).padStart(2, '0') : ''}`;
                  }

                  return (
                    <div
                      key={`future-${eta.vehicle_id || eta.line_id}-${i}`}
                      onClick={() => {
                        if (onVehicleSelect) {
                          onVehicleSelect(eta.vehicle_id || null, eta.pattern_id, eta.line_id);
                        }
                      }}
                      className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer active:scale-[0.98] ${
                        isSelected
                          ? 'bg-carris-yellow/10 border-carris-yellow/40 ring-1 ring-carris-yellow/30'
                          : isTracked
                            ? 'bg-white/[0.03] hover:bg-white/[0.06] border-white/5'
                            : 'bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.03]'
                      }`}
                    >
                      <div className="flex-shrink-0 w-14 text-center">
                        <div className={`font-black text-sm px-2 py-1.5 rounded-lg ${
                          isSelected
                            ? 'bg-carris-yellow text-carris-dark'
                            : isTracked
                              ? 'bg-carris-yellow text-carris-dark'
                              : 'bg-carris-yellow/30 text-carris-yellow/80'
                        }`}>
                          {eta.line_id}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[13px] truncate leading-tight">{eta.headsign}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {hasVehicle ? (
                            <>
                              <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full flex-shrink-0"></span>
                              <span className="text-[11px] text-gray-400 truncate">Em viagem</span>
                            </>
                          ) : hasEstimate ? (
                            <>
                              <span className="inline-block w-1.5 h-1.5 bg-carris-yellow rounded-full flex-shrink-0"></span>
                              <span className="text-[11px] text-carris-yellow/70 truncate">Previsto</span>
                            </>
                          ) : (
                            <>
                              <span className="inline-block w-1.5 h-1.5 bg-gray-500 rounded-full flex-shrink-0"></span>
                              <span className="text-[11px] text-gray-500">Agendado</span>
                            </>
                          )}
                          {directionLabel && (
                            <span className={`text-[10px] ${directionColor} ${directionBg} px-1.5 py-0.5 rounded-full flex-shrink-0`}>
                              {directionLabel}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right pl-2">
                        <div className={`font-bold text-[15px] leading-tight ${
                          diffMinutes <= 0 ? 'text-green-400 animate-pulse'
                          : diffMinutes <= 3 && isTracked ? 'text-green-400 animate-pulse'
                          : diffMinutes <= 10 ? 'text-carris-yellow'
                          : !isTracked ? 'text-gray-300'
                          : 'text-white'
                        }`}>
                          {displayTime}
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono leading-tight mt-0.5">
                          {fromUnixTime(time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
