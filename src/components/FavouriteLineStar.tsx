import { Star } from 'lucide-react';

interface FavouriteLineStarProps {
  lineId: string;
  chosen: boolean;
  onToggle: (lineId: string) => void;
}

export default function FavouriteLineStar({ lineId, chosen, onToggle }: FavouriteLineStarProps) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(lineId); }}
      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full transition-colors hover:bg-white/10 active:scale-95"
      aria-label={chosen ? `Tirar a linha ${lineId} das minhas` : `Juntar a linha ${lineId} às minhas`}
      title={chosen ? 'Nas minhas linhas — toca para tirar' : 'Juntar às minhas linhas'}
    >
      <Star size={15} className={chosen ? 'fill-carris-yellow text-carris-yellow' : 'text-gray-500'} />
    </button>
  );
}
