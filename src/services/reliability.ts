import useSWR from 'swr';
import { GATEWAY_BASE } from './gateway';

export interface RankedLine {
  lineId: string;
  passages: number;
  withinTolerance: number;
  late: number;
  early: number;
  averageLatenessSeconds: number;
  firstServiceDate: string;
  lastServiceDate: string;
}

export interface LineRanking {
  computedAtUnix: number;
  toleranceSeconds: number;
  lines: RankedLine[];
}

export function punctualityPercent(line: RankedLine): number {
  return line.passages === 0 ? 0 : Math.round((line.withinTolerance / line.passages) * 100);
}

export function describeAverage(averageLatenessSeconds: number): string {
  const minutes = Math.round(Math.abs(averageLatenessSeconds) / 60);

  if (minutes === 0) return 'à tabela';

  return averageLatenessSeconds > 0 ? `${minutes} min atrasada` : `${minutes} min adiantada`;
}

export function describeToleranceLabel(toleranceSeconds: number): string {
  const minutes = Math.round(toleranceSeconds / 60);

  return `dentro de ${minutes} min do horário`;
}

export function describeFreshness(computedAtUnix: number, nowUnix: number): string {
  if (computedAtUnix === 0) return 'ainda sem dados';

  const days = Math.floor((nowUnix - computedAtUnix) / 86400);

  if (days <= 0) return 'actualizado hoje';
  if (days === 1) return 'actualizado ontem';

  return `actualizado há ${days} dias`;
}

const fetcher = (url: string) => fetch(url).then(response => response.json() as Promise<LineRanking>);

export function useLineRanking(enabled: boolean) {
  const url = GATEWAY_BASE.length > 0 && enabled ? `${GATEWAY_BASE}/api/lines/reliability` : null;
  const { data, error, isLoading } = useSWR<LineRanking>(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60 * 60 * 1000,
  });

  return {
    ranking: data ?? null,
    failed: !!error,
    isLoading: isLoading && enabled,
    available: GATEWAY_BASE.length > 0,
  };
}
