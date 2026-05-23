import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '../_lib/kv.js';
import {
  type Alert,
  PENDING_KEY,
  alertKey,
  endpointAlerts,
} from '../_lib/types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const id = req.query.id as string;
  const endpoint = req.query.endpoint as string | undefined;
  if (!id || !endpoint) return res.status(400).json({ error: 'id and endpoint required' });

  const alert = await kv.get<Alert>(alertKey(id));
  // Hardening: only allow deletion by the original endpoint owner. Without this
  // any caller who learns an id could cancel someone else's alert.
  if (!alert) return res.status(404).json({ error: 'not found' });
  if (alert.endpoint !== endpoint) return res.status(403).json({ error: 'forbidden' });

  await Promise.all([
    kv.del(alertKey(id)),
    kv.srem(endpointAlerts(endpoint), id),
    kv.srem(PENDING_KEY, id),
  ]);

  return res.status(204).end();
}
