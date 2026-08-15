#!/usr/bin/env node
/**
 * Fetches Last.fm listener counts for every track in the current export and
 * writes them to enrich/obscurity.json, keyed by Spotify URI.
 *
 *   npm run obscurity            # only new tracks
 *   npm run obscurity -- --refresh   # re-fetch all (listener counts drift)
 *
 * Reads LASTFM_KEY from .env at the repo root. No secret needed for read
 * calls. The obscurity value is the raw listener count, stored alongside the
 * source and fetch date so snapshots can pin it (PLAN.md §6, invariant I7).
 *
 * Also captures duration_ms from the Last.fm response as a free side-product.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataDir = join(root, 'src/data');
const enrichDir = join(root, 'enrich');
const envPath = join(root, '.env');
const outPath = join(enrichDir, 'obscurity.json');
const durPath = join(enrichDir, 'durations.json');

const args = new Set(process.argv.slice(2));
const refresh = args.has('--refresh');

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

function fail(message) {
  console.error(`\n${c.red('✗')} ${message}`);
  process.exit(1);
}

/* --------------------------------- env --------------------------------- */

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = { ...loadEnv(envPath), ...process.env };
const apiKey = env.LASTFM_KEY ?? env.LASTFM_API_KEY;
if (!apiKey) fail('LASTFM_KEY must be set in .env or the environment.');

/* --------------------------------- csv --------------------------------- */

function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else { field += ch; }
    } else if (ch === '"') { inQuotes = true; }
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (ch !== '\r') { field += ch; }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell !== ''));
}

function loadCsv(path) {
  if (!existsSync(path)) return [];
  const rows = parseCsv(readFileSync(path, 'utf8'));
  const header = rows[0];
  return rows.slice(1).map((row) => {
    const obj = {};
    header.forEach((h, i) => { obj[h.trim()] = (row[i] ?? '').trim(); });
    return obj;
  });
}

function loadJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return {}; }
}

function saveJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

/* -------------------------------- last.fm ------------------------------ */

const LASTFM = 'https://ws.audioscrobbler.com/2.0/';
const RATE_LIMIT_MS = 250; // Last.fm allows ~5 req/s

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchTrackInfo(title, artist) {
  const url = new URL(LASTFM);
  url.searchParams.set('method', 'track.getInfo');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('artist', artist);
  url.searchParams.set('track', title);
  url.searchParams.set('autocorrect', '1');
  url.searchParams.set('format', 'json');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) return null; // track not found on Last.fm — valid, not a crash
  const track = body.track;
  return {
    listeners: track.listeners ? Number(track.listeners) : null,
    durationMs: track.duration ? Number(track.duration) : null,
  };
}

/* ---------------------------------- main -------------------------------- */

if (!existsSync(join(dataDir, 'submissions.csv'))) {
  fail('No src/data/submissions.csv — nothing to enrich. Drop an export in first.');
}

const submissions = loadCsv(join(dataDir, 'submissions.csv'));

// De-dupe by URI
const byUri = new Map();
for (const s of submissions) {
  if (s['Spotify URI'] && !byUri.has(s['Spotify URI'])) {
    byUri.set(s['Spotify URI'], { title: s.Title, artist: s['Artist(s)'] });
  }
}

const knownObscurity = loadJson(outPath);
const knownDurations = loadJson(durPath);
const today = new Date().toISOString().slice(0, 10);

const targets = refresh
  ? [...byUri.entries()]
  : [...byUri.entries()].filter(([uri]) => !(uri in knownObscurity));

console.log(`\n${c.bold('Obscurity')} ${c.dim(`${byUri.size} songs in the current export`)}`);

if (!targets.length) {
  console.log(`  ${c.dim('nothing new — use --refresh to re-fetch all')}`);
  process.exit(0);
}

console.log(`  fetching ${targets.length}${refresh ? ' (refresh)' : ''} via Last.fm`);

let resolved = 0;
let durResolved = 0;
const unresolved = [];

for (const [uri, { title, artist }] of targets) {
  process.stdout.write('.');
  try {
    const info = await fetchTrackInfo(title, artist);
    if (info?.listeners != null) {
      knownObscurity[uri] = { value: info.listeners, source: 'lastfm-listeners', fetchedAt: today };
      resolved += 1;
    } else {
      unresolved.push({ uri, title, artist });
    }
    if (info?.durationMs != null && !(uri in knownDurations)) {
      knownDurations[uri] = info.durationMs;
      durResolved += 1;
    }
  } catch {
    unresolved.push({ uri, title, artist });
  }
  await sleep(RATE_LIMIT_MS);
}

saveJson(outPath, knownObscurity);
saveJson(durPath, knownDurations);

console.log(`\n  ${c.green('✓')} ${resolved} obscurity values resolved`);
if (durResolved) console.log(`  ${c.green('✓')} ${durResolved} durations captured → enrich/durations.json`);
if (unresolved.length) {
  console.log(`  ${c.yellow('!')} ${unresolved.length} not found on Last.fm:`);
  for (const t of unresolved) console.log(`    ${c.dim(`"${t.title}" — ${t.artist}`)}`);
}
