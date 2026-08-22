#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

const BASE = 'https://api.carrismetropolitana.pt';
const HUB = 'https://go.tmlmobilidade.pt/hub/api/v1';
const SHAPE_FILE = new URL('./api-shape.json', import.meta.url);

const SAMPLE = 40;
const COMMON_ENOUGH = 0.5;

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });

  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);

  return response.json();
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';

  return typeof value;
}

function shapeOf(objects) {
  const seen = new Map();
  const sampled = objects.slice(0, SAMPLE);

  for (const object of sampled) {
    if (object === null || typeof object !== 'object') continue;

    for (const [field, value] of Object.entries(object)) {
      const entry = seen.get(field) ?? { count: 0, types: new Set() };

      entry.count++;
      if (value !== null) entry.types.add(typeOf(value));
      seen.set(field, entry);
    }
  }

  const shape = {};

  for (const [field, entry] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
    if (entry.count / sampled.length < COMMON_ENOUGH) continue;

    shape[field] = [...entry.types].sort().join('|') || 'null';
  }

  return shape;
}

const HEAVY = ['carris /stops', 'hub network/stops'];

const PROBE_PATTERN = '1523_0_1';
const PROBE_AGENCY_PATTERN = '[BNA17]2769_0_1';
const PROBE_STOPS = ['110591', '110785', '120399', '020516', '060005', '170727'];

async function readShapes({ skipHeavy = false } = {}) {
  const shapes = {};

  const vehicles = await getJson(`${BASE}/v2/vehicles`);
  const positions = (await getJson(`${HUB}/realtime/vehicles/positions`)).data;

  if (!skipHeavy) {
    shapes['carris /stops'] = shapeOf(await getJson(`${BASE}/stops`));
    shapes['hub network/stops'] = shapeOf((await getJson(`${HUB}/network/stops`)).data);
  }

  const pattern = await getJson(`${BASE}/patterns/${encodeURIComponent(PROBE_PATTERN)}`);
  const shape = pattern.shape_id ? await getJson(`${BASE}/shapes/${pattern.shape_id}`) : {};
  const plans = (await getJson(`${HUB}/network/patterns/${encodeURIComponent(PROBE_AGENCY_PATTERN)}`)).data;
  const trips = plans.flatMap(plan => plan.trips ?? []);
  const calls = trips.flatMap(trip => trip.schedule ?? []);

  const etas = [];

  for (const stopId of PROBE_STOPS) {
    etas.push(...((await getJson(`${HUB}/realtime/eta/by-stop/${stopId}`)).data ?? []));
  }

  shapes['carris /v2/vehicles'] = shapeOf(vehicles.filter(bus => bus.lat));
  shapes['carris /patterns/{id}'] = shapeOf([pattern]);
  shapes['carris /shapes/{id}'] = shapeOf([shape]);
  shapes['hub network/patterns/{id}'] = shapeOf(plans);
  shapes['hub network/patterns trips'] = shapeOf(trips);
  shapes['hub network/patterns schedule'] = shapeOf(calls);
  shapes['hub realtime/vehicles/positions'] = shapeOf(positions);
  shapes['hub realtime/eta/by-stop/{id}'] = shapeOf(etas);

  return shapes;
}

export function compare(recorded, live) {
  const changes = [];

  for (const endpoint of Object.keys(recorded)) {
    const before = recorded[endpoint];
    const after = live[endpoint];

    if (!after || Object.keys(after).length === 0) {
      changes.push({ endpoint, kind: 'silent', detail: 'answered with nothing to read' });
      continue;
    }

    for (const [field, type] of Object.entries(before)) {
      if (!(field in after)) {
        changes.push({ endpoint, kind: 'gone', detail: `${field} (${type})` });
      } else if (after[field] !== type) {
        changes.push({ endpoint, kind: 'retyped', detail: `${field}: ${type} -> ${after[field]}` });
      }
    }

    for (const field of Object.keys(after)) {
      if (!(field in before)) {
        changes.push({ endpoint, kind: 'new', detail: `${field} (${after[field]})` });
      }
    }
  }

  for (const endpoint of Object.keys(live)) {
    if (!(endpoint in recorded)) {
      changes.push({ endpoint, kind: 'unwatched', detail: 'not in the recorded shape yet' });
    }
  }

  return changes;
}

async function main() {
  const skipHeavy = process.argv.includes('--light');
  const live = await readShapes({ skipHeavy });

  if (process.argv.includes('--record')) {
    await writeFile(SHAPE_FILE, JSON.stringify(live, null, 2) + '\n');
    console.log(`Recorded ${Object.keys(live).length} endpoints into api-shape.json`);

    return;
  }

  const all = JSON.parse(await readFile(SHAPE_FILE, 'utf8'));
  const recorded = skipHeavy
    ? Object.fromEntries(Object.entries(all).filter(([endpoint]) => !HEAVY.includes(endpoint)))
    : all;
  const changes = compare(recorded, live);

  console.log('Carris API shape check —', new Date().toISOString());
  console.log('='.repeat(60));

  if (changes.length === 0) {
    console.log(`\n✓ ${Object.keys(recorded).length} endpoints still look the way they were recorded.`);

    return;
  }

  console.log('\nWHAT CHANGED:');

  for (const change of changes) {
    console.log(`  ${change.kind.padEnd(9)} [${change.endpoint}] ${change.detail}`);
  }

  console.log(`\n${changes.length} difference(s). Run "npm run record:api" once the app handles them.`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('api-shape.mjs')) {
  main().catch(error => {
    console.error('Shape check crashed:', error.message);
    process.exit(1);
  });
}
