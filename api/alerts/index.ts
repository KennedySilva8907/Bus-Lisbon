import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { kv } from '../_lib/kv.js';
import {
  type Alert,
  type SubscriptionPayload,
  PENDING_KEY,
  alertKey,
  endpointAlerts,
  subKey,
} from '../_lib/types.js';

interface CreateBody {
  subscription: SubscriptionPayload;
  vehicleId: string;
  lineId: string;
  patternId: string;
  stopId: string;
  stopName: string;
  thresholdMinutes: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') return create(req, res);
  if (req.method === 'GET')  return list(req, res);
  res.setHeader('Allow', 'POST, GET');
  return res.status(405).json({ error: 'method not allowed' });
}

async function create(req: VercelRequest, res: VercelResponse) {
  const body = req.body as CreateBody;
  if (!body?.subscription?.endpoint || !body.vehicleId || !body.stopId || !body.thresholdMinutes) {
    return res.status(400).json({ error: 'campos em falta' });
  }
  if (body.thresholdMinutes < 1 || body.thresholdMinutes > 60) {
    return res.status(400).json({ error: 'thresholdMinutes deve estar entre 1 e 60' });
  }

  const endpoint = body.subscription.endpoint;

  // Block duplicates: same vehicle + stop + threshold from same endpoint
  const existingIds = await kv.smembers(endpointAlerts(endpoint));
  for (const id of existingIds) {
    const existing = await kv.get<Alert>(alertKey(id));
    if (
      existing &&
      existing.status === 'pending' &&
      existing.vehicleId === body.vehicleId &&
      existing.stopId === body.stopId &&
      existing.thresholdMinutes === body.thresholdMinutes
    ) {
      return res.status(200).json(existing);
    }
  }

  const alert: Alert = {
    id: randomUUID(),
    endpoint,
    vehicleId: body.vehicleId,
    lineId: body.lineId,
    patternId: body.patternId,
    stopId: body.stopId,
    stopName: body.stopName,
    thresholdMinutes: body.thresholdMinutes,
    createdAt: Date.now(),
    status: 'pending',
  };

  await Promise.all([
    kv.set(alertKey(alert.id), alert),
    kv.set(subKey(endpoint), body.subscription),
    kv.sadd(endpointAlerts(endpoint), alert.id),
    kv.sadd(PENDING_KEY, alert.id),
  ]);

  return res.status(201).json(alert);
}

async function list(req: VercelRequest, res: VercelResponse) {
  const endpoint = req.query.endpoint as string | undefined;
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });

  const ids = await kv.smembers(endpointAlerts(endpoint));
  if (!ids.length) return res.status(200).json([]);

  const alerts = await Promise.all(ids.map(id => kv.get<Alert>(alertKey(id))));
  return res.status(200).json(alerts.filter(Boolean));
}
