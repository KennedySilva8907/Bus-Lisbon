import { useState, useCallback } from 'react';

const STORAGE_KEY = 'bdt-favorites';

function loadFavorites(): string[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);

  const toggle = useCallback((stopId: string) => {
    setFavorites(prev => {
      const next = prev.includes(stopId)
        ? prev.filter(id => id !== stopId)
        : [...prev, stopId];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isFavorite = useCallback((stopId: string) => {
    return favorites.includes(stopId);
  }, [favorites]);

  return { favorites, toggle, isFavorite };
}
