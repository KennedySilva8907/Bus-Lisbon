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

export function describeSpan(firstServiceDate: string, lastServiceDate: string): string {
  const first = Date.parse(`${firstServiceDate}T00:00:00Z`);
  const last = Date.parse(`${lastServiceDate}T00:00:00Z`);
  const days = Math.round((last - first) / 86_400_000) + 1;

  return days === 1 ? 'num dia' : `em ${days} dias`;
}

export function describeToleranceLabel(toleranceSeconds: number): string {
  const minutes = Math.round(toleranceSeconds / 60);

  return `dentro de ${minutes} min do horário`;
}

export function describeFreshness(computedAtUnix: number, nowUnix: number): string {
  if (computedAtUnix === 0) return 'Ainda sem dados';

  const days = Math.floor((nowUnix - computedAtUnix) / 86400);

  if (days <= 0) return 'Actualizado hoje';
  if (days === 1) return 'Actualizado ontem';

  return `Actualizado há ${days} dias`;
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
