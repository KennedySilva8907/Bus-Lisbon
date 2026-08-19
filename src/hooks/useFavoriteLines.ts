import { useCallback, useState } from 'react';

const STORAGE_KEY = 'bdt-favorite-lines';

function loadFavoriteLines(): string[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function useFavoriteLines() {
  const [favoriteLines, setFavoriteLines] = useState<string[]>(loadFavoriteLines);

  const toggle = useCallback((lineId: string) => {
    setFavoriteLines(prev => {
      const next = prev.includes(lineId) ? prev.filter(id => id !== lineId) : [...prev, lineId];

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        return next;
      }

      return next;
    });
  }, []);

  const isFavoriteLine = useCallback((lineId: string) => favoriteLines.includes(lineId), [favoriteLines]);

  return { favoriteLines, toggle, isFavoriteLine };
}
