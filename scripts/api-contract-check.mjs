#!/usr/bin/env node
/**
 * Carris Metropolitana API contract check.
 *
 * Hits the live API and asserts the exact response shape the app depends on.
 * The goal is early warning: when Carris changes the API (as happened when the
 * /vehicles feed started returning the whole fleet, or when /stops/:id/realtime
 * was dropped from the v2 docs), this fails loudly instead of the app silently
 * breaking in production.
 *
 * Run locally:   npm run check:api
 * In CI:         .github/workflows/api-contract.yml runs it daily.
 *
 * Exit code 0 = contract holds, 1 = something the app relies on changed.
 */

import { readFile } from 'node:fs/promises';

const STOP_ID_MAP = new URL('../backend/src/BusLisbon.Api/Schedules/stop-id-map.json', import.meta.url);
const BASE = 'https://api.carrismetropolitana.pt';
const HUB = 'https://go.tmlmobilidade.pt/hub/api/v1';
const FRESH_WINDOW_SEC = 180;
const ARRIVAL_SAMPLE = 12;

const failures = [];
const warnings = [];

function fail(check, detail) {
  failures.push({ check, detail });
}
function warn(check, detail) {
  warnings.push({ check, detail });
}

const UPSTREAM_ATTEMPTS = 3;

async function getJson(path, base = BASE) {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= UPSTREAM_ATTEMPTS; attempt++) {
    const res = await fetch(`${base}${path}`, { headers: { accept: 'application/json' } });
    if (res.ok) return res.json();

    lastStatus = res.status;
    if (res.status < 500) break;
    if (attempt < UPSTREAM_ATTEMPTS) await new Promise(r => setTimeout(r, attempt * 2000));
  }

  throw new Error(`HTTP ${lastStatus} for ${path}${lastStatus >= 500 ? ` after ${UPSTREAM_ATTEMPTS} attempts` : ''}`);
}

function isFiniteNum(v) {
  return Number.isFinite(Number(v));
}

// Holds values discovered in earlier checks so later checks can stay dynamic
// (no hardcoded stop/pattern ids that could be retired by Carris).
const discovered = { stopId: null, patternId: null, stopIds: [], network: null, networkStop: null };

function operationalDay() {
  const lisbon = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));
  if (lisbon.getHours() < 4) lisbon.setDate(lisbon.getDate() - 1);
  return `${lisbon.getFullYear()}${String(lisbon.getMonth() + 1).padStart(2, '0')}${String(lisbon.getDate()).padStart(2, '0')}`;
}

// ── 1. Vehicle positions feed (/v2/vehicles) ──────────────────────────
async function checkVehicles() {
  const name = '/v2/vehicles';
  let data;
  try {
    data = await getJson('/v2/vehicles');
  } catch (e) {
    fail(name, e.message);
    return;
  }
  if (!Array.isArray(data)) {
    fail(name, 'response is not an array');
    return;
  }
  if (data.length === 0) {
    fail(name, 'feed is empty');
    return;
  }

  const positioned = data.filter(v => v && isFiniteNum(v.lat) && isFiniteNum(v.lon) && v.id && v.id !== '|undefined');
  if (positioned.length === 0) {
    fail(name, 'no vehicle has a usable position (lat/lon) — the app cannot render any bus');
    return;
  }

  // Field shape the app reads (BusMarker + useSingleVehicle).
  const required = ['id', 'lat', 'lon', 'line_id', 'pattern_id', 'speed', 'bearing'];
  const sample = positioned[0];
  const missing = required.filter(k => !(k in sample));
  if (missing.length) fail(name, `vehicle is missing fields: ${missing.join(', ')}`);
  if (!isFiniteNum(sample.timestamp)) {
    warn(name, 'vehicle has no numeric `timestamp` — the staleness filter cannot work');
  }

  const now = Date.now() / 1000;
  const live = positioned.filter(v => isFiniteNum(v.timestamp) && now - Number(v.timestamp) <= FRESH_WINDOW_SEC);
  if (live.length === 0) {
    // Not a hard failure: at night almost nothing is moving. Still informative.
    warn(name, `no live vehicle (<${FRESH_WINDOW_SEC}s) right now — only parked buses in feed`);
  }

  // Feed pulled as JSON for a single tracked bus; keep an eye on the size.
  const positionedRatio = Math.round((positioned.length / data.length) * 100);
  warn(name, `feed has ${data.length} entries, ${positioned.length} positioned (${positionedRatio}%), ${live.length} live`);

  // Stash ids for downstream checks.
  const withPattern = positioned.find(v => typeof v.pattern_id === 'string' && v.pattern_id.length > 0);
  if (withPattern) discovered.patternId = withPattern.pattern_id;
  const withStop = positioned.find(v => v.stop_id);
  if (withStop) discovered.stopId = String(withStop.stop_id);
  discovered.stopIds = [...new Set(positioned.filter(v => v.stop_id).map(v => String(v.stop_id)))].slice(0, ARRIVAL_SAMPLE);
}

// ── 2. Stop arrivals / ETAs (/stops/:id/realtime) ─────────────────
async function checkNetworkStops() {
  const name = 'hub network/stops';
  let stops;
  try {
    stops = (await getJson('/network/stops', HUB)).data;
  } catch (e) {
    fail(name, `${e.message} — every board starts by resolving the stop here`);
    return;
  }
  if (!Array.isArray(stops) || stops.length < 10000) {
    fail(name, `expected the whole network, got ${Array.isArray(stops) ? stops.length : typeof stops}`);
    return;
  }
  const probe = stops.slice(0, 500);
  const withPatterns = probe.filter(s => Array.isArray(s.pattern_ids)).length;
  if (withPatterns / probe.length < 0.9) {
    fail(name, `only ${withPatterns}/${probe.length} sampled stops list pattern_ids`);
  }
  discovered.network = new Set(stops.map(s => String(s._id)));
  discovered.networkStop = stops.find(s => Array.isArray(s.pattern_ids) && s.pattern_ids.length > 3) || stops[0];
}

async function checkStopIdMap() {
  const name = 'stop id map';
  if (!discovered.network) return;

  let map;
  try {
    map = JSON.parse(await readFile(STOP_ID_MAP, 'utf8'));
  } catch (e) {
    fail(name, `could not read the mapping the backend ships: ${e.message}`);
    return;
  }

  let appStops;
  try {
    appStops = await getJson('/stops');
  } catch {
    return;
  }

  const resolved = appStops.filter(stop => {
    const id = String(stop.id);
    const mapped = discovered.network.has(id) ? id : String(map[id] ?? '');
    return discovered.network.has(mapped);
  }).length;

  const share = resolved / appStops.length;
  if (share < 0.9) {
    fail(name, `only ${resolved} of ${appStops.length} stops on the map resolve onto the network (${(share * 100).toFixed(1)}%) — the mapping needs refreshing from carrismetropolitana/api`);
  } else {
    warn(name, `${resolved} of ${appStops.length} stops resolve onto the network (${(share * 100).toFixed(1)}%)`);
  }
}

async function checkTimetable() {
  const name = 'hub network/patterns';
  const stop = discovered.networkStop;
  if (!stop) return;

  const today = operationalDay();
  const sampled = stop.pattern_ids.slice(0, 5);
  let plansSeen = 0;
  let runningToday = 0;

  for (const patternId of sampled) {
    let plans;
    try {
      plans = (await getJson(`/network/patterns/${encodeURIComponent(patternId)}`, HUB)).data;
    } catch (e) {
      fail(name, `${e.message} — the whole arrivals board is built from this`);
      return;
    }
    if (!Array.isArray(plans)) {
      fail(name, 'a pattern no longer answers with a list of plans, which is where every plan after the first lives');
      return;
    }

    plansSeen += plans.length;
    const trips = plans.flatMap(plan => plan.trips ?? []);

    if (trips.length === 0) continue;

    const trip = trips[0];
    for (const field of ['schedule', 'trip_ids', 'valid_on']) {
      if (!Array.isArray(trip[field])) fail(name, `a trip group of ${patternId} is missing ${field}`);
    }
    const call = (trip.schedule ?? [])[0];
    if (call) {
      for (const field of ['arrival_time', 'stop_id', 'stop_sequence']) {
        if (!(field in call)) fail(name, `a schedule entry of ${patternId} is missing ${field}`);
      }
    }

    runningToday += trips.filter(t => (t.valid_on ?? []).includes(today)).length;
  }

  if (plansSeen === 0) {
    fail(name, `none of the ${sampled.length} sampled patterns carries a plan`);
    return;
  }
  if (runningToday === 0) {
    fail(name, `none of the ${sampled.length} sampled patterns has a trip valid on ${today} — the board would be empty everywhere`);
    return;
  }

  warn(name, `${plansSeen} plans across ${sampled.length} patterns, ${runningToday} trip groups running on ${today}`);
}

async function checkLiveEtas() {
  const name = 'hub realtime/eta/by-stop';
  if (!discovered.network) return;

  const sample = [...discovered.network].slice(0, ARRIVAL_SAMPLE * 20).filter((_, i) => i % 20 === 0);
  const rows = [];

  for (const stopId of sample) {
    try {
      const data = (await getJson(`/realtime/eta/by-stop/${stopId}`, HUB)).data;
      if (!Array.isArray(data)) {
        fail(name, `stop ${stopId} did not answer with a list`);
        return;
      }
      rows.push(...data);
    } catch (e) {
      fail(name, `${e.message} — this is the only live arrival time we have`);
      return;
    }
  }

  if (rows.length === 0) {
    warn(name, `no live arrival across ${sample.length} stops right now — normal at night, a problem in the middle of the day`);
    return;
  }

  warn(name, `${rows.length} live arrivals across ${sample.length} stops`);

  for (const field of ['trip_id', 'eta_at']) {
    if (rows.every(row => row[field] == null)) {
      fail(name, `no arrival carries ${field}`);
    }
  }

  const stamped = rows.filter(row => Number(row.eta_at) > 1e12).length;
  if (stamped === 0) {
    fail(name, 'eta_at stopped being a millisecond stamp — every arrival time would be wrong by a factor of a thousand');
  }
}

async function checkPositionsReadiness() {
  const name = 'hub realtime/vehicles/positions (migration readiness)';
  let now;
  let next;

  try {
    now = await getJson('/v2/vehicles');
    next = (await getJson('/realtime/vehicles/positions', HUB)).data;
  } catch {
    return;
  }
  if (!Array.isArray(now) || !Array.isArray(next)) return;

  const positioned = now.filter(v => isFiniteNum(v.lat) && isFiniteNum(v.lon)).length;
  const carried = next.filter(v => isFiniteNum(v.latitude) && isFiniteNum(v.longitude)).length;
  const withSpeed = next.filter(v => v.speed !== null && v.speed !== undefined).length;
  const withBearing = next.filter(v => v.bearing !== null && v.bearing !== undefined).length;

  const share = positioned ? carried / positioned : 0;
  const ready = share > 0.9 && withSpeed > 0 && withBearing / Math.max(carried, 1) > 0.9;

  if (ready) {
    warn(name, `the new feed carries ${carried} positioned vehicles against ${positioned} on the old one, with speed and bearing — the map can move over (#159)`);
  } else {
    warn(name, `not ready: ${carried} positioned against ${positioned} (${(share * 100).toFixed(0)}%), ${withSpeed} with speed, ${withBearing} with bearing`);
  }
}

async function checkDrainedArrivals() {
  const name = '/stops/:id/realtime (drained since 2026-08-21)';
  const stopId = discovered.stopId || '170453';
  try {
    const data = await getJson(`/stops/${stopId}/realtime`);
    if (Array.isArray(data) && data.length) {
      warn(name, `the old arrivals endpoint is answering again (${data.length} rows) — worth comparing against the hub`);
    }
  } catch {
    // it is expected to be dead
  }
}

// ── 2b. Is /v2/arrivals/by_stop usable again? (migration readiness) ──
async function checkV2ArrivalsReadiness() {
  const name = '/v2/arrivals/by_stop (migration readiness)';
  const stopId = discovered.stopId || '170453';
  try {
    const data = await getJson(`/v2/arrivals/by_stop/${stopId}`);
    if (Array.isArray(data) && data.length) {
      const prefixed = data.filter(a => typeof a.line_id === 'string' && a.line_id.startsWith('[')).length;
      const withEstimate = data.filter(a => isFiniteNum(a.estimated_arrival_unix)).length;
      if (prefixed === 0 && withEstimate > 0) {
        warn(name, `v2 arrivals answered with clean line ids and ${withEstimate} live estimates — worth re-testing the migration`);
      }
    }
  } catch {
    // non-critical
  }
}

// ── 3. Stops (/stops) — the app needs populated names ──────────────────
async function checkStops() {
  const name = '/stops';
  let data;
  try {
    data = await getJson('/stops');
  } catch (e) {
    fail(name, e.message);
    return;
  }
  if (!Array.isArray(data) || data.length < 1000) {
    fail(name, `expected a large array of stops, got ${Array.isArray(data) ? data.length : typeof data}`);
    return;
  }
  const probe = data.slice(0, 500);
  const named = probe.filter(s => typeof s.name === 'string' && s.name.trim().length > 0).length;
  const located = probe.filter(s => isFiniteNum(s.lat) && isFiniteNum(s.lon)).length;
  if (named / probe.length < 0.9) {
    fail(name, `only ${named}/${probe.length} sampled stops have a name — names went missing (do NOT migrate to /v2/stops, it ships empty names)`);
  }
  if (located / probe.length < 0.9) {
    fail(name, `only ${located}/${probe.length} sampled stops have valid coordinates`);
  }
}

// ── 4. Pattern + shape (route line on the map) ─────────────────────────
async function checkPatternShape() {
  const name = '/patterns/:id + /shapes/:id';
  const patternId = discovered.patternId || '1523_0_1';
  let pattern;
  try {
    pattern = await getJson(`/patterns/${patternId}`);
  } catch (e) {
    fail(name, `pattern fetch failed: ${e.message}`);
    return;
  }
  const shapeId = pattern && pattern.shape_id;
  if (typeof shapeId !== 'string' || shapeId.length === 0) {
    fail(name, `pattern.shape_id missing or not a string (got ${JSON.stringify(shapeId)})`);
    return;
  }
  // The v2 pattern returns a compound shape_id like "[KDTF6]142 [07MSC]142"
  // which is NOT a valid /shapes/:id key. Guard against the app accidentally
  // moving onto that shape (it would 404 every route line).
  if (/\s/.test(shapeId) || shapeId.includes('[')) {
    fail(name, `pattern.shape_id has an unexpected compound format: "${shapeId}"`);
    return;
  }
  let shape;
  try {
    shape = await getJson(`/shapes/${shapeId}`);
  } catch (e) {
    fail(name, `shape fetch failed for ${shapeId}: ${e.message}`);
    return;
  }
  const coords = shape && shape.geojson && shape.geojson.geometry && shape.geojson.geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    fail(name, 'shape.geojson.geometry.coordinates is empty — route lines would not draw');
  }
}

// ── 5. Forward-looking: is /v2/stops fixed yet? (deprecation tracker) ──
async function checkV2StopsReadiness() {
  const name = '/v2/stops (migration readiness)';
  try {
    const data = await getJson('/v2/stops');
    if (Array.isArray(data) && data.length) {
      const named = data.slice(0, 500).filter(s => typeof s.name === 'string' && s.name.trim().length > 0).length;
      if (named > 0) {
        warn(name, `v2/stops now returns names (${named}/500 sampled) — the v1 → v2 stops migration may finally be possible`);
      }
    }
  } catch {
    // non-critical
  }
}

async function main() {
  await checkVehicles();
  await checkNetworkStops();
  await Promise.all([
    checkStopIdMap(),
    checkTimetable(),
    checkLiveEtas(),
    checkStops(),
    checkPatternShape(),
    checkV2StopsReadiness(),
    checkV2ArrivalsReadiness(),
    checkDrainedArrivals(),
    checkPositionsReadiness(),
  ]);

  console.log('\nCarris API contract check —', new Date().toISOString());
  console.log('='.repeat(60));
  if (warnings.length) {
    console.log('\nNotes:');
    for (const w of warnings) console.log(`  • [${w.check}] ${w.detail}`);
  }
  if (failures.length) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log(`  ✗ [${f.check}] ${f.detail}`);
    console.log(`\n${failures.length} check(s) failed — the Carris API likely changed.`);
    process.exit(1);
  }
  console.log('\n✓ All contract checks passed.');
}

main().catch(err => {
  console.error('Contract check crashed:', err);
  process.exit(1);
});
