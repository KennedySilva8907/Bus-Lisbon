/**
 * Picks the stops the daily collection reads.
 *
 * Two stops per line, chosen greedily so every line is covered with as few
 * stops as possible. One stop per line would only measure punctuality at that
 * one point, and a bus can be on time at the start of a route and late at the
 * end.
 *
 * The result is committed rather than recomputed on every run: if the sample
 * moved on its own, the series would stop being comparable over time.
 *
 * Usage: node scripts/pick-sample-stops.mjs > backend/src/BusLisbon.Api/Observations/sample-stops.json
 */

const BASE = 'https://api.carrismetropolitana.pt';

const [stops, lines] = await Promise.all([
  fetch(`${BASE}/stops`).then(r => r.json()),
  fetch(`${BASE}/lines`).then(r => r.json()),
]);

const withLines = stops.filter(s => Array.isArray(s.lines) && s.lines.length);
const wanted = new Map(lines.map(l => [l.id ?? l.line_id, 2]));

const chosen = [];
const pool = [...withLines];

const gain = stop => stop.lines.filter(l => (wanted.get(l) ?? 0) > 0).length;

while (pool.length) {
  pool.sort((a, b) => gain(b) - gain(a));
  const best = pool.shift();
  if (gain(best) === 0) break;
  for (const line of best.lines) {
    const left = wanted.get(line);
    if (left > 0) wanted.set(line, left - 1);
  }
  chosen.push(best.id);
}

const uncovered = [...wanted.entries()].filter(([, left]) => left === 2).length;
const partial = [...wanted.entries()].filter(([, left]) => left === 1).length;

process.stderr.write(`${chosen.length} stops, ${lines.length} lines, ${uncovered} uncovered, ${partial} with one stop only\n`);
process.stdout.write(JSON.stringify(chosen.sort(), null, 2) + '\n');
