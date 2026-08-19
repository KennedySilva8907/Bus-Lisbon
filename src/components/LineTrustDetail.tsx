import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  THIN_EVIDENCE,
  describeAverage,
  describeServiceWindow,
  describeToleranceLabel,
  describeTrust,
  punctualityPercent,
  type RankedLine,
} from '../services/reliability';

const TRUST_TEXT: Record<string, string> = {
  high: 'text-emerald-400',
  good: 'text-emerald-300',
  uneven: 'text-carris-yellow',
  low: 'text-orange-400',
};

function Count({ value, of, children }: { value: number; of: number; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-2 py-1.5">
      <span className="w-12 shrink-0 text-right text-sm font-bold text-white tabular-nums">{value}</span>
      <span className="text-[12px] leading-snug text-gray-400">
        {children}
        {of > 0 && value > 0 && <span className="text-gray-600"> · {Math.round((value / of) * 100)}%</span>}
      </span>
    </li>
  );
}

interface LineTrustDetailProps {
  line: RankedLine;
  toleranceSeconds: number;
  onClose: () => void;
}

export default function LineTrustDetail({ line, toleranceSeconds, onClose }: LineTrustDetailProps) {
  const percent = punctualityPercent(line);
  const trust = describeTrust(percent);
  const tolerance = describeToleranceLabel(toleranceSeconds);
  const minutes = Math.round(toleranceSeconds / 60);

  return createPortal(
    <div
      className="fixed inset-0 z-[2100] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm"
      style={{
        padding:
          'max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))',
      }}
      onClick={onClose}
    >
      <div
        className="bg-carris-gray rounded-2xl border border-white/10 shadow-2xl w-full max-w-md my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-white/5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="shrink-0 px-2.5 py-1.5 rounded-lg bg-carris-yellow text-carris-dark text-sm font-black tabular-nums">
              {line.lineId}
            </span>
            <div className="min-w-0">
              <p className={`text-sm font-bold ${TRUST_TEXT[trust.level]}`}>{trust.label}</p>
              <p className="text-[11px] text-gray-400">{percent}% {tolerance}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Fechar"
          >
            <X size={18} className="text-gray-300" />
          </button>
        </div>

        <div className="p-4">
          <p className="text-[12px] text-gray-300">
            {line.passages} passagens observadas · {describeServiceWindow(line.firstServiceDate, line.lastServiceDate)}
          </p>

          <ul className="mt-2 border-t border-white/5 pt-1">
            <Count value={line.withinTolerance} of={line.passages}>chegaram {tolerance}</Count>
            <Count value={line.late} of={line.passages}>chegaram mais de {minutes} min atrasadas</Count>
            <Count value={line.early} of={line.passages}>passaram mais de {minutes} min adiantadas</Count>
          </ul>

          <p className="mt-3 pt-3 border-t border-white/5 text-[12px] text-gray-300">
            Em média, {describeAverage(line.averageLatenessSeconds)}.
          </p>

          {line.passages < THIN_EVIDENCE && (
            <p className="mt-3 text-[11px] leading-relaxed text-carris-yellow/80">
              Ainda são poucas passagens. Com mais dias, este número pode mudar bastante.
            </p>
          )}

          <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
            Uma passagem é este autocarro a passar numa das paragens que vigiamos. Comparamos a hora a que passou
            mesmo com a hora da tabela publicada, não com a previsão da app.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
