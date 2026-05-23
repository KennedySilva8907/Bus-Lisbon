import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import { kv } from './_lib/kv.js';
import {
  type Alert,
  type SubscriptionPayload,
  PENDING_KEY,
  alertKey,
  endpointAlerts,
  subKey,
} from './_lib/types.js';

const CARRIS_BASE = 'https://api.carrismetropolitana.pt';
const MAX_MISSES = 5; // after ~5 cron cycles without seeing the bus, expire

interface CarrisETA {
  line_id: string;
  estimated_arrival_unix: number;
  scheduled_arrival_unix: number;
  observed_arrival_unix?: number | null;
  vehicle_id: string;
  pattern_id: string;
}

function configureWebPush() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:noreply@bus-lisbon.local';
  if (!pub || !priv) throw new Error('VAPID keys missing in env');
  webpush.setVapidDetails(subject, pub, priv);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron sends a Bearer token if CRON_SECRET is configured.
  // Without this guard the endpoint is publicly callable, which would let
  // anyone drain credits by triggering it.
  const authHeader = req.headers.authorization;
  const expected = process.env.CRON_SECRET;
  if (expected && authHeader !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  configureWebPush();

  const pendingIds = await kv.smembers(PENDING_KEY);
  if (!pendingIds.length) return res.status(200).json({ processed: 0 });

  // Load all alerts in parallel, then group by stop to minimize Carris calls
  const alerts = (await Promise.all(pendingIds.map(id => kv.get<Alert>(alertKey(id))))).filter(
    (a): a is Alert => !!a && a.status === 'pending',
  );

  const byStop = new Map<string, Alert[]>();
  for (const a of alerts) {
    const arr = byStop.get(a.stopId) || [];
    arr.push(a);
    byStop.set(a.stopId, arr);
  }

  let fired = 0;
  let expired = 0;

  await Promise.all(
    Array.from(byStop.entries()).map(async ([stopId, group]) => {
      let etas: CarrisETA[] = [];
      try {
        const resp = await fetch(`${CARRIS_BASE}/stops/${stopId}/realtime`);
        const json = await resp.json();
        etas = Array.isArray(json) ? json : (json.data || json.value || []);
      } catch {
        return; // skip this stop on transient errors; cron will retry next tick
      }

      const nowSec = Math.floor(Date.now() / 1000);
      for (const alert of group) {
        // Carris returns every passage of the day, including buses that have
        // already arrived (observed_arrival_unix populated). We want the next
        // future passage of the requested vehicle at this stop.
        const eta = etas
          .filter(e => e.vehicle_id === alert.vehicleId)
          .filter(e => {
            if (e.observed_arrival_unix && e.observed_arrival_unix < nowSec) return false;
            const t = e.estimated_arrival_unix || e.scheduled_arrival_unix;
            return t > nowSec - 60; // allow up to 1min in the past so we still fire just-arrived buses
          })
          .sort((a, b) => {
            const ta = a.estimated_arrival_unix || a.scheduled_arrival_unix;
            const tb = b.estimated_arrival_unix || b.scheduled_arrival_unix;
            return ta - tb;
          })[0];

        if (!eta) {
          // Bus not in feed — increment miss counter, expire after MAX_MISSES
          const miss = (alert.missCount ?? 0) + 1;
          console.log(`[cron] alert=${alert.id} line=${alert.lineId} vehicle=${alert.vehicleId} stop=${alert.stopId} MISS (${miss}/${MAX_MISSES}). Feed had ${etas.length} ETAs, vehicle_ids=${etas.map(e => e.vehicle_id).slice(0,5).join(',')}`);
          if (miss >= MAX_MISSES) {
            const updated: Alert = { ...alert, status: 'expired', missCount: miss };
            await Promise.all([
              kv.set(alertKey(alert.id), updated),
              kv.srem(PENDING_KEY, alert.id),
            ]);
            expired++;
          } else {
            await kv.set(alertKey(alert.id), { ...alert, missCount: miss });
          }
          continue;
        }

        const arrivalUnix = eta.estimated_arrival_unix || eta.scheduled_arrival_unix;
        const minutesAway = (arrivalUnix - Math.floor(Date.now() / 1000)) / 60;
        console.log(`[cron] alert=${alert.id} line=${alert.lineId} vehicle=${alert.vehicleId} stop=${alert.stopId} minutesAway=${minutesAway.toFixed(2)} threshold=${alert.thresholdMinutes}`);

        // Cron ticks every ~60s. Without this tolerance we'd skip the user's
        // configured minute (e.g. they wanted 10min but cron saw the bus at
        // 10.7min, then 9.7min on the next tick — notification arrives a
        // minute late). Firing slightly early is the lesser evil.
        if (minutesAway <= alert.thresholdMinutes + 1 && minutesAway > -2) {
          // Send push and retire the alert
          const sub = await kv.get<SubscriptionPayload>(subKey(alert.endpoint));
          if (!sub) {
            console.error(`[cron] alert=${alert.id} FIRING but subscription missing for endpoint`);
          } else {
            try {
              // Show the user's threshold when we caught the bus within the
              // tolerance window (it's their intent). Only show a lower value
              // when we fired late — being transparent about the delay.
              const actualMin = Math.max(1, Math.round(minutesAway));
              const displayedMin = Math.min(alert.thresholdMinutes, actualMin);
              await webpush.sendNotification(
                sub,
                JSON.stringify({
                  title: `🚌 ${alert.lineId}`,
                  body: `Chega à ${alert.stopName} em ~${displayedMin} min`,
                  tag: `bus-${alert.vehicleId}-${alert.stopId}`,
                  stopId: alert.stopId,
                  vehicleId: alert.vehicleId,
                  lineId: alert.lineId,
                  patternId: alert.patternId,
                  url: `/?stop=${alert.stopId}&vehicle=${alert.vehicleId}&pattern=${alert.patternId}&line=${alert.lineId}`,
                }),
              );
              console.log(`[cron] alert=${alert.id} FIRED OK`);
              fired++;
            } catch (err) {
              const status = (err as { statusCode?: number; body?: string }).statusCode;
              const body = (err as { body?: string }).body;
              console.error(`[cron] alert=${alert.id} PUSH FAILED status=${status} body=${body}`);
              if (status === 404 || status === 410) {
                await kv.del(subKey(alert.endpoint));
              }
            }
          }

          const updated: Alert = { ...alert, status: 'fired' };
          await Promise.all([
            kv.set(alertKey(alert.id), updated),
            kv.srem(PENDING_KEY, alert.id),
          ]);
        } else if (minutesAway < -2) {
          // Bus passed without firing in time — mark expired
          const updated: Alert = { ...alert, status: 'expired' };
          await Promise.all([
            kv.set(alertKey(alert.id), updated),
            kv.srem(PENDING_KEY, alert.id),
          ]);
          expired++;
        } else if (alert.missCount) {
          // Reset miss counter — bus is back in feed
          await kv.set(alertKey(alert.id), { ...alert, missCount: 0 });
        }
      }
    }),
  );

  return res.status(200).json({ processed: alerts.length, fired, expired });
}

// Avoid unused import warning in environments that don't validate at runtime
void endpointAlerts;
