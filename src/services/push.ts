/**
 * Web Push helpers — subscription lifecycle and API client for the alerts
 * backend. No account/login required; the PushSubscription endpoint IS the
 * device identity.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const API_BASE = import.meta.env.VITE_API_BASE || ''; // same origin in production

export type AlertStatus = 'pending' | 'fired' | 'expired' | 'cancelled';

export interface Alert {
  id: string;
  endpoint: string;
  vehicleId: string;
  lineId: string;
  patternId: string;
  stopId: string;
  stopName: string;
  thresholdMinutes: number;
  createdAt: number;
  status: AlertStatus;
}

// ── Platform detection ─────────────────────────────────────

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS legacy
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  // Modern
  const modern = window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || modern;
}

/** iOS only sends pushes when the PWA is installed to the Home Screen. */
export function needsHomeScreenInstall(): boolean {
  return isIOS() && !isStandalone();
}

export function notificationPermission(): NotificationPermission {
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission;
}

// ── Subscription lifecycle ─────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buf);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.ready;
  return reg;
}

/**
 * Requests permission (if not already granted) and creates a PushSubscription.
 * Returns the subscription, ready to send to the backend.
 */
export async function requestPushPermission(): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new Error('Push notifications não suportadas neste browser.');
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('VAPID public key não configurada (VITE_VAPID_PUBLIC_KEY).');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permissão de notificações recusada.');
  }

  const reg = await getRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  return sub;
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await getRegistration();
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

// ── API client ─────────────────────────────────────────────

interface SubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function serializeSubscription(sub: PushSubscription): SubscriptionPayload {
  const json = sub.toJSON();
  return {
    endpoint: json.endpoint!,
    keys: {
      p256dh: json.keys!.p256dh!,
      auth: json.keys!.auth!,
    },
  };
}

export interface CreateAlertInput {
  vehicleId: string;
  lineId: string;
  patternId: string;
  stopId: string;
  stopName: string;
  thresholdMinutes: number;
}

export async function createAlert(sub: PushSubscription, input: CreateAlertInput): Promise<Alert> {
  const res = await fetch(`${API_BASE}/api/alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: serializeSubscription(sub), ...input }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao criar alerta (${res.status}): ${body}`);
  }
  return res.json();
}

export async function listAlerts(endpoint: string): Promise<Alert[]> {
  const res = await fetch(`${API_BASE}/api/alerts?endpoint=${encodeURIComponent(endpoint)}`);
  if (!res.ok) return [];
  return res.json();
}

export async function cancelAlert(id: string, endpoint: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/alerts/${id}?endpoint=${encodeURIComponent(endpoint)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Falha ao cancelar alerta (${res.status})`);
  }
}
