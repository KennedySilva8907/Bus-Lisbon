import { useStopETA, type Stop, type ETA } from '../services/api';
import { describeArrival, describePassage, describePunctuality, wentByAt, type PunctualityTone } from '../services/arrivals';
import { fromUnixTime } from 'date-fns';
import { X, Star, ChevronUp } from 'lucide-react';
import { useRef, useEffect, useState, useMemo } from 'react';
import { useAlerts } from '../hooks/useAlerts';
import { useFavoriteLines } from '../hooks/useFavoriteLines';
import NotificationBell from './NotificationBell';
import FavouriteLineStar from './FavouriteLineStar';
import AlertSetupModal from './AlertSetupModal';
import { PANEL_ELEMENT_ID } from '../services/framing';

const PunctualityColour: Record<PunctualityTone, string> = {
  early: 'text-blue-400',
  late: 'text-orange-400',
  onTime: 'text-green-400',
  running: 'text-carris-yellow',
  finished: 'text-gray-400',
};

const PunctualityBackground: Record<PunctualityTone, string> = {
  early: 'bg-blue-400/10',
  late: 'bg-orange-400/10',
  onTime: 'bg-green-400/10',
  running: 'bg-carris-yellow/10',
  finished: 'bg-gray-400/10',
};

interface StopDetailsPanelProps {
  stop: Stop | null;
  onClose: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  selectedVehicleId?: string | null;
  onVehicleSelect?: (vehicleId: string | null, patternId?: string, lineId?: string, tripId?: string) => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

export default function StopDetailsPanel({ stop, onClose, isExpanded, onToggleExpand, selectedVehicleId, onVehicleSelect, isFavorite, onToggleFavorite }: StopDetailsPanelProps) {
  const { etas, lastUpdated, isLoading } = useStopETA(stop?.id || null);
  const panelRef = useRef<HTMLElement>(null);
  const touchRef = useRef({ startY: 0, isDragging: false, isOnHandle: false });
  const [pastExpandedForStop, setPastExpandedForStop] = useState<string | null>(null);
  const showAllPast = pastExpandedForStop === stop?.id;
  const { findAlertFor, create: createAlert, cancel: cancelAlert } = useAlerts();
  const { toggle: toggleFavoriteLine, isFavoriteLine } = useFavoriteLines();
  const [alertModalEta, setAlertModalEta] = useState<ETA | null>(null);

  // Tick "now" every 5s so countdowns drop smoothly instead of waiting on the
  // 8s SWR refresh. Also resync immediately when the page becomes visible
  // again (iOS Safari throttles background timers).
  const [nowUnix, setNowUnix] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const tick = () => setNowUnix(Math.floor(Date.now() / 1000));
    const interval = setInterval(tick, 5000);
    const onVisibility = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const dataAgeSec = lastUpdated ? Math.max(0, nowUnix - Math.floor(lastUpdated / 1000)) : 0;
  const isStale = dataAgeSec > 30;

  // Split into past and future arrivals (memoized to avoid re-renders)
  const { pastEtas, futureEtas, recentPast, olderPast } = useMemo(() => {
    const past = [...etas]
      .filter(eta => (wentByAt(eta) ?? Infinity) < nowUnix)
      .sort((a, b) => ((wentByAt(b) ?? 0) - (wentByAt(a) ?? 0)));

    const future = [...etas]
      .filter(eta => {
        if ((wentByAt(eta) ?? Infinity) < nowUnix) return false;
        const time = eta.estimated_arrival_unix || eta.scheduled_arrival_unix;
        // Tightened from -120s to -60s: the bus has either arrived or its
        // prediction is stale enough that the user is better off seeing the
        // next one.
        if (time < nowUnix - 60 && !eta.trip_running) return false;
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

  // When the operator's realtime pipeline is down for an area (as during the
  // Carris/TML GO Hub migration), the feed still returns the day's schedule but
  // every passage comes without a vehicle and without a live estimate. Detect
  // that so we can tell the user it's an upstream gap, not a broken app.
  const hasRealtime = etas.some(
    e => !!e.vehicle_id || (e.estimated_arrival_unix != null && e.estimated_arrival_unix !== e.scheduled_arrival_unix),
  );

  if (!stop) return null;

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
      id={PANEL_ELEMENT_ID}
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

      <div
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 text-white custom-scrollbar flex flex-col"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
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
              {isStale && (
                <span
                  className="text-[10px] text-orange-300/80 bg-orange-400/10 border border-orange-400/20 px-1.5 py-0.5 rounded-full flex-shrink-0"
                  title={`Última atualização há ${dataAgeSec}s`}
                >
                  ↻ há {dataAgeSec < 60 ? `${dataAgeSec}s` : `${Math.floor(dataAgeSec / 60)}min`}
                </span>
              )}
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
              {/* Realtime outage banner — the arrivals feed only has schedule
                  data for this stop (no vehicle, no live estimate). Makes it
                  clear the gap is on the operator's side. */}
              {!hasRealtime && etas.length > 0 && (
                <div className="flex items-start gap-2 mb-1 px-3 py-2.5 rounded-xl bg-orange-400/10 border border-orange-400/20 text-orange-200/90 text-[12px] leading-snug">
                  <span className="mt-0.5 flex-shrink-0">⚠️</span>
                  <span>Tempo real indisponível nesta zona neste momento. A mostrar apenas o horário planeado.</span>
                </div>
              )}

              {/* ── Past Arrivals Section ── */}
              {pastEtas.length > 0 && (
                <>
                  {/* "Ver passagens anteriores" expand button */}
                  {olderPast.length > 0 && (
                    <button
                      onClick={() => setPastExpandedForStop(showAllPast ? null : stop.id)}
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
                        const wentBy = wentByAt(eta) ?? 0;
                        const pastMin = Math.round((nowUnix - wentBy) / 60);
                        const punctuality = describePunctuality(eta) ?? describePassage(eta);
                        const directionLabel = punctuality.label;
                        const directionColor = PunctualityColour[punctuality.tone];
                        const directionBg = PunctualityBackground[punctuality.tone];

                        const canTrack = !!eta.vehicle_id;
                        const isSelected = canTrack && selectedVehicleId === eta.vehicle_id;

                        return (
                          <div
                            key={`past-old-${eta.vehicle_id || eta.line_id}-${i}`}
                            onClick={canTrack && onVehicleSelect ? () => onVehicleSelect(eta.vehicle_id, eta.pattern_id, eta.line_id, eta.trip_id) : undefined}
                            className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                              isSelected
                                ? 'bg-carris-yellow/10 border-carris-yellow/40 ring-1 ring-carris-yellow/30 opacity-90'
                                : canTrack
                                  ? 'bg-white/[0.015] border-white/[0.03] opacity-40 hover:opacity-70 cursor-pointer active:scale-[0.98]'
                                  : 'bg-white/[0.015] border-white/[0.03] opacity-40'
                            }`}
                          >
                            <div className="flex-shrink-0 w-14 text-center">
                              <div className="font-black text-sm px-2 py-1.5 rounded-lg bg-carris-yellow/20 text-carris-yellow/60">{eta.line_id}</div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-[13px] truncate leading-tight text-gray-400">{eta.headsign}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {directionLabel && <span className={`text-[10px] ${directionColor} ${directionBg} px-1.5 py-0.5 rounded-full flex-shrink-0`}>{directionLabel}</span>}
                                {canTrack && <span className="text-[10px] text-gray-400/70">· toca para ver no mapa</span>}
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-right pl-2">
                              <div className="font-bold text-[15px] leading-tight text-gray-500">Há {pastMin}min</div>
                              <div className="text-[10px] text-gray-500 font-mono leading-tight mt-0.5">
                                {fromUnixTime(wentBy).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Last 2 recent past arrivals (always visible) */}
                  {recentPast.map((eta, i) => {
                    const wentBy = wentByAt(eta) ?? 0;
                    const pastMin = Math.round((nowUnix - wentBy) / 60);
                    const punctuality = describePunctuality(eta) ?? describePassage(eta);
                    const directionLabel = punctuality.label;
                    const directionColor = PunctualityColour[punctuality.tone];
                    const directionBg = PunctualityBackground[punctuality.tone];

                    const canTrack = !!eta.vehicle_id;
                    const isSelected = canTrack && selectedVehicleId === eta.vehicle_id;

                    return (
                      <div
                        key={`past-recent-${eta.vehicle_id || eta.line_id}-${i}`}
                        onClick={canTrack && onVehicleSelect ? () => onVehicleSelect(eta.vehicle_id, eta.pattern_id, eta.line_id, eta.trip_id) : undefined}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-carris-yellow/10 border-carris-yellow/40 ring-1 ring-carris-yellow/30 opacity-90'
                            : canTrack
                              ? 'bg-white/[0.015] border-white/[0.03] opacity-50 hover:opacity-80 cursor-pointer active:scale-[0.98]'
                              : 'bg-white/[0.015] border-white/[0.03] opacity-50'
                        }`}
                      >
                        <div className="flex-shrink-0 w-14 text-center">
                          <div className="font-black text-sm px-2 py-1.5 rounded-lg bg-carris-yellow/20 text-carris-yellow/60">{eta.line_id}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[13px] truncate leading-tight text-gray-400">{eta.headsign}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {directionLabel && <span className={`text-[10px] ${directionColor} ${directionBg} px-1.5 py-0.5 rounded-full flex-shrink-0`}>{directionLabel}</span>}
                            {canTrack && <span className="text-[10px] text-gray-400/70">· toca para ver no mapa</span>}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right pl-2">
                          <div className="font-bold text-[15px] leading-tight text-gray-500">Há {pastMin}min</div>
                          <div className="text-[10px] text-gray-500 font-mono leading-tight mt-0.5">
                            {fromUnixTime(wentBy).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
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
                  const diffSec = time - nowUnix;
                  // Align the countdown with the clock time shown below it: the
                  // absolute time uses HH:mm (seconds truncated), so the user
                  // computes "arrival_min − current_min". Matching that math
                  // here keeps both numbers consistent — see #ETA-display.
                  const diffMinutes = Math.floor(time / 60) - Math.floor(nowUnix / 60);
                  const arrival = describeArrival(eta);
                  const hasVehicle = arrival.trackable;
                  const isTracked = arrival.state !== 'scheduled';
                  const isSelected = hasVehicle && selectedVehicleId === eta.vehicle_id;

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
                  if (diffSec < -60) {
                    displayTime = '';
                  } else if (diffSec <= 30) {
                    displayTime = 'Agora';
                  } else if (diffMinutes <= 0) {
                    // Same clock minute as "now" but still 31–59s away
                    displayTime = '<1min';
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
                      onClick={hasVehicle && onVehicleSelect
                        ? () => onVehicleSelect(eta.vehicle_id, eta.pattern_id, eta.line_id, eta.trip_id)
                        : undefined}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all ${
                        hasVehicle ? 'cursor-pointer active:scale-[0.98]' : ''
                      } ${
                        isSelected
                          ? 'bg-carris-yellow/10 border-carris-yellow/40 ring-1 ring-carris-yellow/30'
                          : hasVehicle
                            ? 'bg-white/[0.03] hover:bg-white/[0.06] border-white/5'
                            : 'bg-white/[0.02] border-white/[0.03]'
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
                          {arrival.state === 'boarding' ? (
                            <>
                              <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full flex-shrink-0"></span>
                              <span className="text-[11px] text-gray-400 truncate">{arrival.label}</span>
                            </>
                          ) : arrival.state === 'predicted' ? (
                            <>
                              <span className="inline-block w-1.5 h-1.5 bg-carris-yellow rounded-full flex-shrink-0"></span>
                              <span className="text-[11px] text-carris-yellow/70 truncate">{arrival.label}</span>
                            </>
                          ) : (
                            <>
                              <span className="inline-block w-1.5 h-1.5 bg-gray-500 rounded-full flex-shrink-0"></span>
                              <span className="text-[11px] text-gray-500 truncate">{arrival.label}</span>
                            </>
                          )}
                          {directionLabel && (
                            <span className={`text-[10px] ${directionColor} ${directionBg} px-1.5 py-0.5 rounded-full flex-shrink-0`}>
                              {directionLabel}
                            </span>
                          )}
                        </div>
                      </div>
                      <FavouriteLineStar
                        lineId={eta.line_id}
                        chosen={isFavoriteLine(eta.line_id)}
                        onToggle={toggleFavoriteLine}
                      />

                      {hasVehicle && stop && (() => {
                        const existing = findAlertFor(eta.vehicle_id, stop.id);
                        return (
                          <NotificationBell
                            isActive={!!existing}
                            onClick={() => {
                              if (existing) {
                                cancelAlert(existing.id);
                              } else {
                                setAlertModalEta(eta);
                              }
                            }}
                          />
                        );
                      })()}
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

      <AlertSetupModal
        open={!!alertModalEta}
        context={alertModalEta ? {
          lineId: alertModalEta.line_id,
          stopName: stop.name,
          arrivalUnix: alertModalEta.estimated_arrival_unix || alertModalEta.scheduled_arrival_unix,
        } : null}
        onClose={() => setAlertModalEta(null)}
        onConfirm={async (thresholdMinutes) => {
          if (!alertModalEta) return;
          await createAlert({
            vehicleId: alertModalEta.vehicle_id,
            lineId: alertModalEta.line_id,
            patternId: alertModalEta.pattern_id,
            stopId: stop.id,
            stopName: stop.name,
            thresholdMinutes,
          });
        }}
      />
    </aside>
  );
}
