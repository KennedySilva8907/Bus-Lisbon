import { useCallback, useEffect, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'bdt-favorite-lines';

function loadFavoriteLines(): string[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

let lines: string[] = loadFavoriteLines();
const subscribers = new Set<() => void>();

function subscribe(onChange: () => void) {
  subscribers.add(onChange);

  return () => { subscribers.delete(onChange); };
}

function setLines(next: string[]) {
  lines = next;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // the list still works for this session
  }

  for (const notify of subscribers) notify();
}

export function useFavoriteLines() {
  const favoriteLines = useSyncExternalStore(subscribe, () => lines, () => lines);

  useEffect(() => {
    const reload = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        lines = loadFavoriteLines();
        for (const notify of subscribers) notify();
      }
    };

    window.addEventListener('storage', reload);

    return () => { window.removeEventListener('storage', reload); };
  }, []);

  const toggle = useCallback((lineId: string) => {
    setLines(lines.includes(lineId) ? lines.filter(id => id !== lineId) : [...lines, lineId]);
  }, []);

  const isFavoriteLine = useCallback(
    (lineId: string) => favoriteLines.includes(lineId),
    [favoriteLines]
  );

  return { favoriteLines, toggle, isFavoriteLine };
}
