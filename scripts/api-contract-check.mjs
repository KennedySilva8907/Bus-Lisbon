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

const BASE = 'https://api.carrismetropolitana.pt';
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

async function getJson(path) {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= UPSTREAM_ATTEMPTS; attempt++) {
    const res = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
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
const discovered = { stopId: null, patternId: null, stopIds: [] };

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
async function checkArrivals() {
  const name = '/stops/:id/realtime';
  const stopIds = discovered.stopIds.length ? discovered.stopIds : ['170453'];
  const answers = [];

  for (const stopId of stopIds) {
    try {
      const data = await getJson(`/stops/${stopId}/realtime`);
      if (!Array.isArray(data)) {
        fail(name, `response for stop ${stopId} is not an array`);
        return;
      }
      answers.push({ stopId, data });
    } catch (e) {
      fail(name, `${e.message} (this endpoint powers the ETA panel, the alerts and the daily collection)`);
      return;
    }
  }

  const withArrivals = answers.filter(a => a.data.length > 0);

  if (withArrivals.length === 0) {
    fail(
      name,
      `all ${answers.length} sampled stops returned an empty array — the feed is drained, ` +
      'so the ETA panel, the alerts and the daily collection have nothing to work with ' +
      `(stops tried: ${answers.map(a => a.stopId).join(', ')})`
    );
    return;
  }

  warn(name, `${withArrivals.length} of ${answers.length} sampled stops carry arrivals`);

  const required = ['line_id', 'headsign', 'estimated_arrival_unix', 'scheduled_arrival_unix', 'vehicle_id', 'pattern_id'];
  const sample = withArrivals[0].data[0];
  const missing = required.filter(k => !(k in sample));
  if (missing.length) fail(name, `arrival is missing fields: ${missing.join(', ')}`);

  const observed = withArrivals.some(a => a.data.some(x => isFiniteNum(x.observed_arrival_unix)));
  if (!observed) {
    warn(name, 'no sampled passage carries observed_arrival_unix right now — the daily collection would store nothing');
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
  await Promise.all([checkArrivals(), checkStops(), checkPatternShape(), checkV2StopsReadiness(), checkV2ArrivalsReadiness()]);

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
