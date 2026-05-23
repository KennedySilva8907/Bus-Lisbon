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
  missCount?: number;
}

export interface SubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// ── KV key helpers ──
export const alertKey       = (id: string) => `alert:${id}`;
export const subKey         = (endpoint: string) => `subscription:${endpoint}`;
export const endpointAlerts = (endpoint: string) => `endpoint_alerts:${endpoint}`;
export const PENDING_KEY    = 'pending_alerts';
