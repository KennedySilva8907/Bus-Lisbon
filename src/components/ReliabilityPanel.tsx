import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChartNoAxesColumn, X } from 'lucide-react';
import {
  describeAverage,
  describeFreshness,
  describeSpan,
  describeToleranceLabel,
  punctualityPercent,
  splitByFavourites,
  useLineRanking,
  type RankedLine,
} from '../services/reliability';
import { useFavoriteLines } from '../hooks/useFavoriteLines';
import FavouriteLineStar from './FavouriteLineStar';

function barColour(percent: number): string {
  if (percent >= 80) return 'bg-emerald-400';
  if (percent >= 50) return 'bg-carris-yellow';

  return 'bg-orange-400';
}

function MissingLineRow({ lineId, onToggle }: { lineId: string; onToggle: (lineId: string) => void }) {
  return (
    <li className="px-4 py-3 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2">
        <span className="shrink-0 px-2 py-1 rounded-lg bg-white/10 text-gray-300 text-xs font-black tabular-nums">
          {lineId}
        </span>
        <p className="flex-1 min-w-0 text-[11px] text-gray-500 truncate">Ainda sem passagens observadas</p>
        <FavouriteLineStar lineId={lineId} chosen onToggle={onToggle} />
      </div>
    </li>
  );
}

function LineRow({ line, chosen, onToggle }: { line: RankedLine; chosen: boolean; onToggle: (lineId: string) => void }) {
  const percent = punctualityPercent(line);

  return (
    <li className="px-4 py-3 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2">
        <span className="shrink-0 px-2 py-1 rounded-lg bg-carris-yellow text-carris-dark text-xs font-black tabular-nums">
          {line.lineId}
        </span>

        <div className="flex-1 min-w-0">
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className={`h-full ${barColour(percent)}`} style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-gray-400 truncate">
            {describeAverage(line.averageLatenessSeconds)} · {line.passages} passagens{' '}
            {describeSpan(line.firstServiceDate, line.lastServiceDate)}
          </p>
        </div>

        <span className="shrink-0 w-10 text-right text-sm font-bold text-white tabular-nums">{percent}%</span>

        <FavouriteLineStar lineId={line.lineId} chosen={chosen} onToggle={onToggle} />
      </div>
    </li>
  );
}

export default function ReliabilityPanel() {
  const [openedAtUnix, setOpenedAtUnix] = useState(0);
  const open = openedAtUnix > 0;
  const { ranking, failed, isLoading, available } = useLineRanking(open);
  const { favoriteLines, toggle, isFavoriteLine } = useFavoriteLines();
  const split = splitByFavourites(ranking?.lines ?? [], favoriteLines);

  if (!available) return null;

  return (
    <>
      <button
        onClick={() => setOpenedAtUnix(Math.floor(Date.now() / 1000))}
        className="btn-floating-dark pointer-events-auto w-11 h-11 rounded-full text-white flex items-center justify-center"
        aria-label="Pontualidade das linhas"
        title="Pontualidade das linhas"
      >
        <ChartNoAxesColumn size={18} className="text-white/95" />
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto"
          style={{
            padding:
              'max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))',
          }}
          onClick={() => setOpenedAtUnix(0)}
        >
          <div
            className="bg-carris-gray rounded-2xl border border-white/10 shadow-2xl w-full max-w-md max-h-full flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-carris-yellow/20 flex items-center justify-center">
                  <ChartNoAxesColumn size={16} className="text-carris-yellow" />
                </div>
                <h2 className="font-bold text-white">Pontualidade das linhas</h2>
              </div>
              <button
                onClick={() => setOpenedAtUnix(0)}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                aria-label="Fechar"
              >
                <X size={18} className="text-gray-300" />
              </button>
            </div>

            {ranking && ranking.lines.length > 0 && (
              <p className="px-4 py-3 text-[11px] leading-relaxed text-gray-400 border-b border-white/5">
                Uma passagem é um autocarro a passar numa das paragens que vigiamos, e uma linha serve várias —
                por isso os números sobem depressa. A percentagem é a fatia dessas passagens que chegou{' '}
                {describeToleranceLabel(ranking.toleranceSeconds)} publicado, comparando a hora a que o autocarro
                passou mesmo com a hora da tabela e não com a previsão da app.{' '}
                {describeFreshness(ranking.computedAtUnix, openedAtUnix)}.
              </p>
            )}

            <div className="flex-1 overflow-y-auto">
              {isLoading && <p className="p-6 text-center text-sm text-gray-400">A carregar…</p>}

              {failed && (
                <p className="p-6 text-center text-sm text-gray-400">
                  Não consegui ir buscar os dados. Tenta daqui a pouco.
                </p>
              )}

              {!isLoading && !failed && ranking?.lines.length === 0 && (
                <p className="p-6 text-center text-sm text-gray-400">
                  Ainda não há passagens suficientes para comparar linhas.
                </p>
              )}

              {ranking && ranking.lines.length > 0 && (
                <>
                  {(split.mine.length > 0 || split.missing.length > 0) && (
                    <>
                      <h3 className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-carris-yellow/70">
                        As minhas linhas
                      </h3>
                      <ul>
                        {split.mine.map(line => (
                          <LineRow key={line.lineId} line={line} chosen onToggle={toggle} />
                        ))}
                        {split.missing.map(lineId => (
                          <MissingLineRow key={lineId} lineId={lineId} onToggle={toggle} />
                        ))}
                      </ul>
                      <h3 className="px-4 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                        Todas as linhas
                      </h3>
                    </>
                  )}
                  <ul>
                    {split.rest.map(line => (
                      <LineRow
                        key={line.lineId}
                        line={line}
                        chosen={isFavoriteLine(line.lineId)}
                        onToggle={toggle}
                      />
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
