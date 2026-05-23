import { useEffect, useState } from 'react';
import { Bell, Smartphone, X } from 'lucide-react';
import { needsHomeScreenInstall, notificationPermission } from '../services/push';

interface AlertSetupModalProps {
  open: boolean;
  context: { lineId: string; stopName: string; arrivalUnix: number } | null;
  initialThreshold?: number;
  onConfirm: (thresholdMinutes: number) => Promise<void>;
  onClose: () => void;
}

const PRESET_MINUTES = [3, 5, 10, 15];
const MIN_BUFFER_MIN = 1; // never let threshold land within the next cron tick

export default function AlertSetupModal({ open, context, initialThreshold = 10, onConfirm, onClose }: AlertSetupModalProps) {
  const [threshold, setThreshold] = useState<number>(initialThreshold);
  const [customInput, setCustomInput] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iosBlock = needsHomeScreenInstall();
  const permission = notificationPermission();
  const permissionDenied = permission === 'denied';

  // Compute "how long until the bus arrives" once per render; the user picks
  // a threshold and we need to know what's still reachable.
  const currentMinutesAway = context
    ? Math.floor((context.arrivalUnix * 1000 - Date.now()) / 60000)
    : Infinity;
  const maxUsableThreshold = Math.max(0, currentMinutesAway - MIN_BUFFER_MIN);
  const tooClose = Number.isFinite(currentMinutesAway) && maxUsableThreshold < 1;

  useEffect(() => {
    if (!open) return;
    // Pick a default that's actually reachable. Walk down the presets to find
    // the largest one the bus's current ETA still allows.
    const fittingPreset = [...PRESET_MINUTES].reverse().find(p => p <= maxUsableThreshold);
    const initial = fittingPreset ?? Math.min(initialThreshold, Math.max(1, maxUsableThreshold));
    setThreshold(initial);
    setCustomInput('');
    setError(null);
    // currentMinutesAway intentionally not in deps — we only re-pick on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialThreshold]);

  const isCustomInvalid = customInput !== '' && (parseInt(customInput, 10) > maxUsableThreshold || isNaN(parseInt(customInput, 10)));
  const isThresholdInvalid = threshold > maxUsableThreshold;

  if (!open) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(threshold);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCustomChange = (val: string) => {
    setCustomInput(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1 && n <= 60) {
      setThreshold(n);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      style={{
        padding:
          'max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))',
      }}
      onClick={onClose}
    >
      <div
        className="bg-carris-gray rounded-2xl border border-white/10 shadow-2xl max-w-md w-full max-h-full overflow-y-auto overflow-x-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-carris-yellow/20 flex items-center justify-center">
              <Bell size={16} className="text-carris-yellow" />
            </div>
            <h2 className="font-bold text-white">Agendar notificação</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Fechar"
          >
            <X size={18} className="text-gray-300" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {iosBlock && (
            <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 p-3 text-[13px] text-blue-200">
              <div className="flex items-center gap-2 font-semibold mb-1">
                <Smartphone size={14} /> Adiciona à Tela Inicial primeiro
              </div>
              No iPhone, as notificações só funcionam se a app estiver instalada:
              toca em <strong>Partilhar</strong> (📤) e depois <strong>Adicionar à Tela Inicial</strong>.
            </div>
          )}

          {permissionDenied && !iosBlock && (
            <div className="rounded-xl bg-orange-500/10 border border-orange-500/30 p-3 text-[13px] text-orange-200">
              Notificações estão bloqueadas no browser. Ativa nas definições do telemóvel para esta app.
            </div>
          )}

          {context && (
            <div className="rounded-xl bg-white/[0.03] p-3">
              <div className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">A agendar</div>
              <div className="text-white font-semibold">
                <span className="bg-carris-yellow text-carris-dark px-1.5 py-0.5 rounded-md font-black mr-2">{context.lineId}</span>
                {context.stopName}
              </div>
            </div>
          )}

          {tooClose && (
            <div className="rounded-xl bg-orange-500/10 border border-orange-500/30 p-3 text-[13px] text-orange-200">
              O autocarro está a chegar em ~{currentMinutesAway}min. Demasiado perto para agendar um aviso.
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[13px] text-gray-300">Avisar quantos minutos antes?</div>
              {Number.isFinite(currentMinutesAway) && (
                <div className="text-[10px] text-gray-500">
                  Bus a chegar em ~{currentMinutesAway}min
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESET_MINUTES.map(m => {
                const disabled = m > maxUsableThreshold;
                return (
                  <button
                    key={m}
                    disabled={disabled}
                    onClick={() => { setThreshold(m); setCustomInput(''); }}
                    className={`px-3 py-2 rounded-lg text-[13px] font-semibold transition-all ${
                      disabled
                        ? 'bg-white/[0.02] text-gray-600 cursor-not-allowed line-through'
                        : threshold === m && !customInput
                          ? 'bg-carris-yellow text-carris-dark'
                          : 'bg-white/[0.05] text-gray-200 hover:bg-white/[0.1]'
                    }`}
                    title={disabled ? `O autocarro chega antes de ${m}min` : undefined}
                  >
                    {m} min
                  </button>
                );
              })}
              <input
                type="number"
                min={1}
                max={Math.min(60, maxUsableThreshold || 60)}
                placeholder="Outro"
                value={customInput}
                onChange={(e) => handleCustomChange(e.target.value)}
                className={`w-20 px-3 py-2 rounded-lg text-[13px] font-semibold bg-white/[0.05] text-gray-200 placeholder-gray-500 outline-none focus:bg-white/[0.1] ${
                  isCustomInvalid ? 'ring-2 ring-red-400' : customInput ? 'ring-2 ring-carris-yellow' : ''
                }`}
              />
            </div>
            <div className={`text-[11px] mt-2 ${isThresholdInvalid ? 'text-red-400' : 'text-gray-500'}`}>
              {isThresholdInvalid
                ? `Não dá: o autocarro chega em ${currentMinutesAway}min, mais cedo que o aviso pedido.`
                : `Receberás uma notificação quando o autocarro estiver a ~${threshold}min da paragem.`}
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-[12px] text-red-200">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg bg-white/[0.05] text-gray-200 font-semibold hover:bg-white/[0.1] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting || iosBlock || permissionDenied || isThresholdInvalid || isCustomInvalid || tooClose}
              className="flex-1 py-2.5 rounded-lg bg-carris-yellow text-carris-dark font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-carris-yellow/90 transition-colors"
            >
              {submitting ? 'A guardar…' : 'Ativar alerta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
