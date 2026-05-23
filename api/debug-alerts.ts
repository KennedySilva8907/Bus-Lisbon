import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from './_lib/kv.js';
import { type Alert, PENDING_KEY, alertKey } from './_lib/types.js';

/**
 * Debug-only endpoint. Returns the full set of pending and recent alerts in
 * the store so we can see why alerts are or aren't firing. Gated by the
 * CRON_SECRET because it exposes user push endpoints.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  const expected = process.env.CRON_SECRET;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const pendingIds = await kv.smembers(PENDING_KEY);
  const pending = await Promise.all(pendingIds.map(id => kv.get<Alert>(alertKey(id))));

  // Also scan recent fired/expired by listing all `alert:*` keys
  let allKeys: string[] = [];
  try {
    let cursor: string | number = 0;
    do {
      const result = await kv.scan(cursor, { match: 'alert:*', count: 100 });
      cursor = result[0];
      allKeys = allKeys.concat(result[1] as string[]);
    } while (cursor !== '0' && cursor !== 0);
  } catch (e) {
    return res.status(200).json({
      pending_ids: pendingIds,
      pending,
      error_scanning_all: String(e),
    });
  }

  const allAlerts = await Promise.all(allKeys.map(k => kv.get<Alert>(k)));
  const summary = {
    pending_count: pendingIds.length,
    pending_ids: pendingIds,
    pending,
    all_count: allKeys.length,
    by_status: {
      pending: allAlerts.filter(a => a?.status === 'pending').length,
      fired: allAlerts.filter(a => a?.status === 'fired').length,
      expired: allAlerts.filter(a => a?.status === 'expired').length,
      cancelled: allAlerts.filter(a => a?.status === 'cancelled').length,
    },
    recent: allAlerts
      .filter((a): a is Alert => !!a)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map(a => ({
        id: a.id,
        status: a.status,
        line: a.lineId,
        stop: a.stopName,
        vehicle: a.vehicleId,
        threshold: a.thresholdMinutes,
        missCount: a.missCount,
        createdAgo: Math.round((Date.now() - a.createdAt) / 1000) + 's',
        endpointTail: a.endpoint.slice(-20),
      })),
  };

  return res.status(200).json(summary);
}
