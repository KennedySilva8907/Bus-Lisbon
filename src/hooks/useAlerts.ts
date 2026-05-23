import { useCallback, useEffect, useState } from 'react';
import {
  type Alert,
  type CreateAlertInput,
  cancelAlert as apiCancel,
  createAlert as apiCreate,
  getCurrentSubscription,
  isPushSupported,
  listAlerts,
  notificationPermission,
  requestPushPermission,
} from '../services/push';

const LOCAL_CACHE_KEY = 'bdt-alerts-cache';

function readCache(): Alert[] {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCache(alerts: Alert[]) {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(alerts));
  } catch {
    // localStorage full or disabled — UI still works via in-memory state
  }
}

// ── Module-level singleton store ───────────────────────────
// Multiple components call useAlerts() (the bell shows the badge, the stop
// panel creates alerts). Without a shared store each one had its own copy
// and edits in one place never reached the other. Subscribers are notified
// on every mutation so every consumer re-renders together.

let storeAlerts: Alert[] = readCache();
let storeEndpoint: string | null = null;
let initialFetchStarted = false;
const subscribers = new Set<() => void>();

function notifySubscribers() {
  for (const fn of subscribers) fn();
}

function setStoreAlerts(next: Alert[]) {
  storeAlerts = next;
  writeCache(next);
  notifySubscribers();
}

async function fetchFromBackend() {
  const sub = await getCurrentSubscription();
  if (!sub) return;
  storeEndpoint = sub.endpoint;
  try {
    const remote = await listAlerts(sub.endpoint);
    setStoreAlerts(remote);
  } catch {
    // network error — keep cache
  }
}

/** Public refresh API — call before showing the alerts list. */
export async function refreshAlerts() {
  await fetchFromBackend();
}

/**
 * Listen for the service worker telling us a push notification just fired.
 * We move the matching alert out of 'pending' so the bell badge drops
 * without waiting for a backend round-trip.
 */
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    if (e.data?.type !== 'alert-fired') return;
    const { vehicleId, stopId } = e.data.payload || {};
    if (!vehicleId || !stopId) return;
    const next = storeAlerts.map(a =>
      a.vehicleId === vehicleId && a.stopId === stopId && a.status === 'pending'
        ? { ...a, status: 'fired' as const }
        : a,
    );
    setStoreAlerts(next);
  });
}

// ── Hook ───────────────────────────────────────────────────

export function useAlerts() {
  const [, setTick] = useState(0);
  const [permission, setPermission] = useState<NotificationPermission>(() => notificationPermission());
  const supported = isPushSupported();

  // Subscribe to the shared store
  useEffect(() => {
    const rerender = () => setTick(t => t + 1);
    subscribers.add(rerender);
    return () => { subscribers.delete(rerender); };
  }, []);

  // Kick off the initial fetch exactly once across the whole app
  useEffect(() => {
    if (!supported || initialFetchStarted) return;
    initialFetchStarted = true;
    fetchFromBackend();
  }, [supported]);

  /** Triggers permission flow, returns the active subscription. */
  const enable = useCallback(async (): Promise<PushSubscription> => {
    const sub = await requestPushPermission();
    storeEndpoint = sub.endpoint;
    setPermission(notificationPermission());
    return sub;
  }, []);

  const create = useCallback(async (input: CreateAlertInput): Promise<Alert> => {
    const sub = await getCurrentSubscription() || await requestPushPermission();
    storeEndpoint = sub.endpoint;
    setPermission(notificationPermission());
    const alert = await apiCreate(sub, input);
    const next = [...storeAlerts.filter(a => a.id !== alert.id), alert];
    setStoreAlerts(next);
    return alert;
  }, []);

  const cancel = useCallback(async (id: string) => {
    if (!storeEndpoint) return;
    await apiCancel(id, storeEndpoint);
    setStoreAlerts(storeAlerts.filter(a => a.id !== id));
  }, []);

  const findAlertFor = useCallback((vehicleId: string, stopId: string): Alert | undefined => {
    return storeAlerts.find(a => a.vehicleId === vehicleId && a.stopId === stopId && a.status === 'pending');
  }, []);

  return {
    alerts: storeAlerts,
    pendingCount: storeAlerts.filter(a => a.status === 'pending').length,
    permission,
    supported,
    enable,
    create,
    cancel,
    findAlertFor,
    refresh: refreshAlerts,
  };
}
