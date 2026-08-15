#!/usr/bin/env node
/**
 * Enriches the current export incrementally.
 *
 *   npm run enrich
 *
 * Diffs src/data/submissions.csv against enrich/years.json (and covers /
 * facts) and fetches years only for tracks not already known — so a round-7
 * run costs a dozen MusicBrainz lookups, not sixty-eight.
 *
 * Years are fetched automatically. Covers, Wikipedia facts and round
 * semantics need a person (or an LLM working from search results) to judge,
 * so this prints a worklist for those instead of guessing — see PLAN.md §9
 * for why each one resists automation.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchYears } from './years.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataDir = join(root, 'src/data');
const enrichDir = join(root, 'enrich');

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

function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell !== ''));
}

function loadCsv(path) {
  if (!existsSync(path)) return [];
  const rows = parseCsv(readFileSync(path, 'utf8'));
  const header = rows[0];
  return rows.slice(1).map((row) => {
    const obj = {};
    header.forEach((h, i) => {
      obj[h.trim()] = (row[i] ?? '').trim();
    });
    return obj;
  });
}

function loadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function saveJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

if (!existsSync(join(dataDir, 'submissions.csv'))) {
  fail('No src/data/submissions.csv — nothing to enrich. Drop an export in first.');
}

const submissions = loadCsv(join(dataDir, 'submissions.csv'));
const tracks = submissions
  .filter((s) => s['Spotify URI'])
  .map((s) => ({ uri: s['Spotify URI'], title: s.Title, artist: s['Artist(s)'], roundId: s['Round ID'] }));

// De-dupe by URI: a song can be shared across rounds in unusual exports.
const byUri = new Map(tracks.map((t) => [t.uri, t]));
const uniqueTracks = [...byUri.values()];

console.log(`\n${c.bold('Enrich')} ${c.dim(`${uniqueTracks.length} songs in the current export`)}`);

/* --------------------------------- years --------------------------------- */

const yearsPath = join(enrichDir, 'years.json');
const knownYears = loadJson(yearsPath);
const newForYears = uniqueTracks.filter((t) => !(t.uri in knownYears));

if (newForYears.length) {
  process.stdout.write(`\n${c.bold('Years')}\n  fetching ${newForYears.length} new tracks `);
  let done = 0;
  const result = await fetchYears(
    newForYears.map((t) => ({ uri: t.uri, title: t.title, artist: t.artist })),
    {
      cachePath: join(root, '.cache/years.json'),
      onProgress: () => {
        done += 1;
        if (done % 5 === 0) process.stdout.write('.');
      },
    },
  );
  Object.assign(knownYears, result.years);
  saveJson(yearsPath, knownYears);
  console.log(
    `\n  ${c.green('✓')} ${result.resolved} resolved ${c.dim(`(${result.fromCache} cached)`)}`,
  );
  if (result.unresolved.length) {
    console.log(`  ${c.yellow('!')} ${result.unresolved.length} unresolved:`);
    for (const t of result.unresolved) console.log(`    ${c.dim(`"${t.title}" — ${t.artist}`)}`);
  }
} else {
  console.log(`\n${c.bold('Years')}\n  ${c.dim('nothing new')}`);
}

/* ------------------------------ human worklist ----------------------------- */

const coversPath = join(enrichDir, 'covers.json');
const factsPath = join(enrichDir, 'facts.json');
const roundsPath = join(enrichDir, 'rounds.json');
const knownCovers = loadJson(coversPath);
const knownFacts = loadJson(factsPath);
const knownRounds = loadJson(roundsPath);

const roundIds = [...new Set(uniqueTracks.map((t) => t.roundId))];
const newRounds = roundIds.filter((id) => !(id in knownRounds));

console.log(`\n${c.bold('Needs a human (or an LLM working from search results)')}`);

if (newRounds.length) {
  console.log(`  ${c.yellow('!')} ${newRounds.length} round(s) with no declared kind in enrich/rounds.json:`);
  for (const id of newRounds) console.log(`    ${c.dim(id)}  ${c.dim('— covers? remix? none?')}`);
} else {
  console.log(`  ${c.dim('round semantics: all declared')}`);
}

const coverRoundIds = new Set(
  Object.entries(knownRounds)
    .filter(([, meta]) => meta.kind === 'covers' || meta.kind === 'remix')
    .map(([id]) => id),
);
const newRoundsNeedingCovers = newRounds; // can't know yet — flagged above too
const tracksInCoverRounds = uniqueTracks.filter((t) => coverRoundIds.has(t.roundId));
const missingCovers = tracksInCoverRounds.filter((t) => !(t.uri in knownCovers));
if (missingCovers.length) {
  console.log(`  ${c.yellow('!')} ${missingCovers.length} song(s) in a covers/remix round need their original:`);
  for (const t of missingCovers) console.log(`    ${c.dim(`"${t.title}" — ${t.artist}`)}`);
}

const newForFacts = uniqueTracks.filter((t) => !(t.uri in knownFacts));
if (newForFacts.length) {
  console.log(
    `  ${c.dim(`${newForFacts.length} song(s) with no Wikipedia fact yet — optional, only ~60% of songs will ever have a page`)}`,
  );
}

console.log(
  `\n  ${c.dim('Edit enrich/covers.json, enrich/facts.json and enrich/rounds.json directly, then rebuild.')}`,
);
