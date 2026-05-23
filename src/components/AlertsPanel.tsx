import { useState } from 'react';
import { Bell, X, Trash2 } from 'lucide-react';
import { useAlerts } from '../hooks/useAlerts';

export default function AlertsPanel() {
  const [open, setOpen] = useState(false);
  const { alerts, pendingCount, cancel, refresh } = useAlerts();
  const pending = alerts.filter(a => a.status === 'pending');

  const handleOpen = () => {
    setOpen(true);
    // Pull from backend so we never show an alert that already fired
    refresh();
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="btn-floating-dark pointer-events-auto relative w-11 h-11 rounded-full text-white flex items-center justify-center"
        aria-label="Alertas agendados"
        title="Alertas agendados"
      >
        <Bell size={18} className="text-white/95" />
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-carris-yellow text-carris-dark text-[10px] font-black flex items-center justify-center shadow-[0_2px_6px_-1px_rgba(0,0,0,0.6)] ring-2 ring-[#121212]">
            {pendingCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto"
          style={{
            padding:
              'max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))',
          }}
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-carris-gray rounded-2xl border border-white/10 shadow-2xl w-full max-w-md max-h-full flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-carris-yellow/20 flex items-center justify-center">
                  <Bell size={16} className="text-carris-yellow" />
                </div>
                <h2 className="font-bold text-white">Alertas agendados</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                aria-label="Fechar"
              >
                <X size={18} className="text-gray-300" />
              </button>
            </div>

            <div className="overflow-y-auto custom-scrollbar p-3 space-y-2 flex-1">
              {pending.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-[13px]">
                  Nenhum alerta agendado.
                  <div className="text-[11px] text-gray-500 mt-2">
                    Toca no sino de um autocarro para agendar.
                  </div>
                </div>
              ) : (
                pending.map(alert => (
                  <div
                    key={alert.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5"
                  >
                    <div className="flex-shrink-0">
                      <div className="font-black text-sm px-2 py-1.5 rounded-lg bg-carris-yellow text-carris-dark">
                        {alert.lineId}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-white truncate">{alert.stopName}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        Avisar {alert.thresholdMinutes}min antes
                      </div>
                    </div>
                    <button
                      onClick={() => cancel(alert.id)}
                      className="p-2 rounded-full hover:bg-red-500/20 text-gray-400 hover:text-red-300 transition-colors"
                      aria-label="Cancelar alerta"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
