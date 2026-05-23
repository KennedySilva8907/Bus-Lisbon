import { Bell, BellRing } from 'lucide-react';

interface NotificationBellProps {
  isActive: boolean;
  onClick: (e: React.MouseEvent) => void;
  variant?: 'inline' | 'overlay';
  title?: string;
}

/**
 * Reusable bell trigger. Two visual variants:
 *  - inline:  fits next to other icons in lists/cards (e.g. ETA rows)
 *  - overlay: floats over a map marker (absolutely positioned by parent)
 */
export default function NotificationBell({ isActive, onClick, variant = 'inline', title }: NotificationBellProps) {
  const Icon = isActive ? BellRing : Bell;
  const base = 'flex items-center justify-center rounded-full transition-all active:scale-95';
  const styles =
    variant === 'overlay'
      ? `w-7 h-7 shadow-lg border ${
          isActive
            ? 'bg-carris-yellow text-carris-dark border-carris-yellow'
            : 'bg-white/90 text-gray-700 border-white hover:bg-carris-yellow hover:text-carris-dark'
        }`
      : `w-8 h-8 ${
          isActive
            ? 'bg-carris-yellow/20 text-carris-yellow'
            : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
        }`;

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className={`${base} ${styles}`}
      aria-label={isActive ? 'Cancelar alerta' : 'Agendar alerta'}
      title={title || (isActive ? 'Alerta ativo — toca para cancelar' : 'Agendar alerta')}
    >
      <Icon size={variant === 'overlay' ? 14 : 16} />
    </button>
  );
}
