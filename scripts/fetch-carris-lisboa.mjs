#!/usr/bin/env node
/**
 * Downloads Carris Lisboa GTFS and extracts stops + routes to JSON.
 * Run: node scripts/fetch-carris-lisboa.mjs
 */
import { createWriteStream, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { pipeline } from 'stream/promises';
import { createUnzip } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'data');
const GTFS_URL = 'https://gateway.carris.pt/gateway/gtfs/api/v2.11/GTFS';
const TMP_ZIP = join(__dirname, '..', '.carris-gtfs.zip');

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  console.log('Downloading Carris Lisboa GTFS...');
  const res = await fetch(GTFS_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  // Save zip to temp file
  const fileStream = createWriteStream(TMP_ZIP);
  await pipeline(res.body, fileStream);
  console.log('Downloaded GTFS zip.');

  // Extract using system unzip
  const tmpDir = join(__dirname, '..', '.carris-gtfs-tmp');
  execSync(`rm -rf "${tmpDir}" && mkdir -p "${tmpDir}" && unzip -o "${TMP_ZIP}" -d "${tmpDir}"`, { stdio: 'pipe' });

  // Parse stops.txt
  const stopsRaw = readFileSync(join(tmpDir, 'stops.txt'), 'utf-8');
  const stops = parseCSV(stopsRaw);
  console.log(`Parsed ${stops.length} stops.`);

  // Parse routes.txt for route list
  const routesRaw = readFileSync(join(tmpDir, 'routes.txt'), 'utf-8');
  const routes = parseCSV(routesRaw);
  console.log(`Parsed ${routes.length} routes.`);

  // Convert stops to our format
  const stopsJson = stops
    .filter(s => s.stop_lat && s.stop_lon && s.stop_name)
    .map(s => ({
      id: `CL_${s.stop_id}`,
      name: s.stop_name,
      lat: parseFloat(s.stop_lat),
      lon: parseFloat(s.stop_lon),
      operator: 'carris_lisboa',
    }));

  // Convert routes to a simple list
  const routesJson = routes.map(r => ({
    id: r.route_short_name || r.route_id,
    name: r.route_long_name || '',
  }));

  writeFileSync(
    join(OUT_DIR, 'carris-lisboa-stops.json'),
    JSON.stringify(stopsJson, null, 2)
  );
  writeFileSync(
    join(OUT_DIR, 'carris-lisboa-routes.json'),
    JSON.stringify(routesJson, null, 2)
  );

  // Cleanup
  execSync(`rm -rf "${tmpDir}" "${TMP_ZIP}"`, { stdio: 'pipe' });

  console.log(`Wrote ${stopsJson.length} stops to public/data/carris-lisboa-stops.json`);
  console.log(`Wrote ${routesJson.length} routes to public/data/carris-lisboa-routes.json`);
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  // Handle BOM
  const header = lines[0].replace(/^\uFEFF/, '').split(',').map(h => h.trim().replace(/"/g, ''));
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    header.forEach((h, i) => { obj[h] = (values[i] || '').trim().replace(/^"|"$/g, ''); });
    return obj;
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += char; }
  }
  result.push(current);
  return result;
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
