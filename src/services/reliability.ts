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

export interface SplitRanking {
  mine: RankedLine[];
  missing: string[];
  rest: RankedLine[];
}

export function splitByFavourites(lines: RankedLine[], favourites: string[]): SplitRanking {
  const chosen = new Set(favourites);

  return {
    mine: lines.filter(line => chosen.has(line.lineId)),
    missing: favourites.filter(id => !lines.some(line => line.lineId === id)),
    rest: lines.filter(line => !chosen.has(line.lineId)),
  };
}

export function punctualityPercent(line: RankedLine): number {
  return line.passages === 0 ? 0 : Math.round((line.withinTolerance / line.passages) * 100);
}

export type TrustLevel = 'high' | 'good' | 'uneven' | 'low';

export interface Trust {
  level: TrustLevel;
  label: string;
}

export function describeTrust(percent: number): Trust {
  if (percent >= 90) return { level: 'high', label: 'Muito fiável' };
  if (percent >= 70) return { level: 'good', label: 'Fiável' };
  if (percent >= 50) return { level: 'uneven', label: 'Irregular' };

  return { level: 'low', label: 'Pouco fiável' };
}

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export function describeServiceWindow(firstServiceDate: string, lastServiceDate: string): string {
  const [, firstMonth, firstDay] = firstServiceDate.split('-').map(Number);
  const [, lastMonth, lastDay] = lastServiceDate.split('-').map(Number);

  if (firstServiceDate === lastServiceDate) return `${firstDay} de ${MONTHS[firstMonth - 1]}`;
  if (firstMonth === lastMonth) return `${firstDay} a ${lastDay} de ${MONTHS[lastMonth - 1]}`;

  return `${firstDay} de ${MONTHS[firstMonth - 1]} a ${lastDay} de ${MONTHS[lastMonth - 1]}`;
}

export const THIN_EVIDENCE = 50;

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
