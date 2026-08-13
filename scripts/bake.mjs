#!/usr/bin/env node
/**
 * Bakes a Music League export into a static site.
 *
 *   npm run bake -- <files-or-dir> [options]
 *
 * The CSVs are read, validated, and embedded in the bundle, so the published
 * page needs no upload and no backend. Options:
 *
 *   --out <dir>     output directory (default dist)
 *   --base <path>   public base path, e.g. /musicleague/ for GitHub Pages
 *   --single        also emit one self-contained league.html
 *   --label <name>  title shown in the header (default: derived from the file)
 *   --redact        publish surnames as an initial and dashes, e.g. Tim E---
 *   --competitive   score non-voters as Competitive Mode does: they forfeit
 *                   the upvotes their song earned in a round they skipped
 *   --friendly      score everyone on what their songs earned (default)
 *   --floor         a song cannot score below zero (Music League default)
 *   --no-floor      downvotes carry through, so totals can be negative
 *   --rounds <n>    how many rounds the league will run in total, so a season
 *                   still under way is labelled as a running total
 *   --no-art        skip fetching album art from Spotify at build time
 *   --genres        look up artist genres on MusicBrainz (slow: one request a
 *                   second, and coverage is partial)
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inlineHtml } from './inline.mjs';
import { fetchArtwork } from './art.mjs';
import { fetchGenres } from './genres.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

function fail(message, hint) {
  console.error(`\n${c.red('✗')} ${message}`);
  if (hint) console.error(`  ${c.dim(hint)}`);
  process.exit(1);
}

/* ---------------------------- arguments ---------------------------- */

function parseArgs(argv) {
  const opts = {
    inputs: [],
    out: 'dist',
    base: '/',
    single: false,
    label: null,
    redact: false,
    scoring: null,
    flooring: null,
    rounds: null,
    art: true,
    genres: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--rounds': {
        const value = argv[i + 1];
        if (!value || !/^\d+$/.test(value)) fail('--rounds needs a number');
        opts.rounds = Number(value);
        i += 1;
        break;
      }
      case '--out':
      case '--base':
      case '--label': {
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) fail(`${arg} needs a value`);
        opts[arg.slice(2)] = value;
        i += 1;
        break;
      }
      case '--single':
        opts.single = true;
        break;
      case '--no-art':
        opts.art = false;
        break;
      case '--genres':
        opts.genres = true;
        break;
      case '--redact':
      case '--redact-surnames':
        opts.redact = true;
        break;
      case '--competitive':
        opts.scoring = 'competitive';
        break;
      case '--friendly':
        opts.scoring = 'friendly';
        break;
      case '--floor':
        opts.flooring = 'song';
        break;
      case '--no-floor':
        opts.flooring = 'none';
        break;
      case '--help':
      case '-h':
        console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]);
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) fail(`Unknown option ${arg}`);
        opts.inputs.push(arg);
    }
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

if (!opts.inputs.length) {
  fail(
    'No CSV given.',
    'Usage: npm run bake -- <export.csv> [more.csv ...] [--single] [--base /path/]',
  );
}

/* ------------------------------ input ------------------------------ */

/** Expands directories to the CSVs inside them. */
function collectFiles(inputs) {
  const found = [];
  for (const input of inputs) {
    const path = resolve(input);
    if (!existsSync(path)) fail(`No such file: ${input}`);
    if (statSync(path).isDirectory()) {
      const inside = readdirSync(path)
        .filter((f) => /\.(csv|txt)$/i.test(f))
        .map((f) => join(path, f));
      if (!inside.length) fail(`No CSV files inside ${input}`);
      found.push(...inside);
    } else {
      if (!/\.(csv|txt)$/i.test(path)) {
        fail(`${basename(path)} is not a .csv`, 'Music League exports a CSV file.');
      }
      found.push(path);
    }
  }
  return found;
}

const paths = collectFiles(opts.inputs);
const files = paths.map((path) => {
  const text = readFileSync(path, 'utf8');
  if (!text.trim()) fail(`${basename(path)} is empty`);
  return { name: basename(path), text };
});

console.log(`\n${c.bold('Reading')}`);
for (const [i, file] of files.entries()) {
  const kb = (Buffer.byteLength(file.text) / 1024).toFixed(0);
  console.log(`  ${file.name} ${c.dim(`${kb} kB`)}`);
  if (i > 20) break;
}

/* ---------------------------- validation ----------------------------
 * The real parser is used, bundled on the fly, so a file that will not
 * produce a working page fails here rather than after publishing.
 * ------------------------------------------------------------------ */

const work = mkdtempSync(join(tmpdir(), 'ml-bake-'));
process.on('exit', () => rmSync(work, { recursive: true, force: true }));

/** Bundles the app's own parser so the CLI cannot drift from the page. */
async function loadApi() {
  const { rolldown } = await import('rolldown');
  const bundle = await rolldown({
    input: join(root, 'src/lib/node-api.ts'),
    platform: 'node',
    logLevel: 'silent',
  });
  const outFile = join(work, 'node-api.mjs');
  await bundle.write({ file: outFile, format: 'esm' });
  await bundle.close();
  return import(`file://${outFile}`);
}

let api;
let summary;
try {
  api = await loadApi();
  summary = api.describeLeague(
    files,
    opts.scoring ?? 'auto',
    opts.flooring ?? 'auto',
    opts.rounds ?? undefined,
  );
} catch (err) {
  fail(`Could not parse the export: ${err instanceof Error ? err.message : String(err)}`);
}

if (summary.errors.length) {
  for (const problem of summary.errors) console.error(`\n${c.red('✗')} ${problem}`);
  process.exit(1);
}

console.log(`\n${c.bold('Found')}`);
console.log(`  ${summary.players.length} players  ${c.dim(summary.players.join(', '))}`);
console.log(`  ${summary.rounds.length} rounds    ${c.dim(summary.rounds.join(' · '))}`);
console.log(`  ${summary.songs} songs, ${summary.voteRows} vote rows, ${summary.commentRows} comments`);
if (summary.inProgress) {
  console.log(
    `  ${c.yellow('!')} season still running: ${summary.roundsWithResults}${
      summary.totalRounds ? ` of ${summary.totalRounds}` : ''
    } rounds have results, so the page reads as a running total`,
  );
} else if (!opts.rounds) {
  console.log(
    `  ${c.dim('every round has results; pass --rounds <n> if the league is still running')}`,
  );
}
if (!summary.hasVotes) {
  console.log(
    `  ${c.yellow('!')} no vote rows — per-voter panels will be empty on the published page`,
  );
}
for (const warning of summary.warnings) console.log(`  ${c.yellow('!')} ${warning}`);

/* ------------------------------ scoring ------------------------------
 * Two league rules decide the standings and neither is in the export:
 * whether non-voters forfeit their upvotes, and whether a song can score
 * below zero. Both are reported so they can be checked against the site.
 * ------------------------------------------------------------------ */

const anyDownvotes = summary.totals.some((t) => t.downvotes > 0);

if (summary.nonVoters.length || anyDownvotes) {
  const origin = (explicit, inferred) =>
    explicit
      ? 'from the command line'
      : inferred
        ? 'matched against the official standings'
        : 'assumed, since the export does not say';

  console.log(`\n${c.bold('League rules')}`);
  if (summary.nonVoters.length) {
    console.log(
      `  non-voters   ${c.green(summary.scoring.padEnd(12))} ${c.dim(`(${origin(opts.scoring, summary.scoringInferred)})`)}`,
    );
  }
  if (anyDownvotes) {
    const label = summary.flooring === 'song' ? 'floor at zero' : 'allow negative';
    console.log(
      `  downvotes    ${c.green(label.padEnd(12))} ${c.dim(`(${origin(opts.flooring, summary.flooringInferred)})`)}`,
    );
  }

  if (summary.nonVoters.length) {
    console.log(
      `\n  ${summary.nonVoters.length} player${summary.nonVoters.length === 1 ? '' : 's'} submitted without voting:`,
    );
    for (const p of summary.nonVoters) {
      const cost =
        summary.scoring === 'competitive'
          ? `${c.red(`−${p.forfeited} pts`)} forfeited`
          : `${c.dim(`${p.forfeited} pts kept`)}`;
      console.log(
        `    ${p.name.padEnd(16)} ${c.dim(`${p.rounds} round${p.rounds === 1 ? '' : 's'}`)}  ${cost}`,
      );
    }
  }

  // The standings this build will publish, itemised. Compare with the site:
  // if they disagree, one of the two rules above is set the wrong way.
  console.log(
    `\n  ${c.bold(
      summary.inProgress
        ? 'Standings so far (season still running)'
        : 'Standings this build will show',
    )}`,
  );
  console.log(
    `    ${'player'.padEnd(16)} ${'total'.padStart(6)}   ${c.dim('upvotes  downvotes  forfeited  floored')}`,
  );
  for (const t of summary.totals) {
    const total = t.total < 0 ? c.red(String(t.total).padStart(6)) : String(t.total).padStart(6);
    const parts = [
      `+${t.upvotes}`.padStart(7),
      t.downvotes ? `−${t.downvotes}`.padStart(9) : ''.padStart(9),
      t.forfeited ? `−${t.forfeited}`.padStart(10) : ''.padStart(10),
      t.absorbed ? `+${t.absorbed}`.padStart(8) : ''.padStart(8),
    ].join(' ');
    console.log(`    ${t.name.padEnd(16)} ${total}   ${c.dim(parts)}`);
  }
  console.log(
    `\n    ${c.dim('If these do not match the Music League standings, flip a rule:')}`,
  );
  console.log(
    `    ${c.dim('--competitive / --friendly   and   --floor / --no-floor')}`,
  );

  if (summary.winners.length) {
    console.log(`\n  ${c.bold('Round winners')}`);
    for (const w of summary.winners) {
      console.log(`    ${w.round.padEnd(26)} ${c.dim(`${w.winner} — ${w.points} pts`)}`);
    }
  }
}

/* ----------------------------- redaction -----------------------------
 * The export itself is rewritten, so the published bundle never contains
 * the full names. Redacting at display time would leave them readable in
 * the page source.
 * ------------------------------------------------------------------ */

let published = files;

if (opts.redact) {
  const map = api.buildRedactionMap(summary.players);
  const report = { proseChanges: [] };
  published = files.map((file) => ({
    name: file.name,
    text: api.redactCsvText(file.text, map, file.name, report),
  }));

  // Re-parse the rewritten export: if redaction broke a join, the player
  // count or vote totals would move, and that must not reach a host.
  const after = api.describeLeague(
    published,
    opts.scoring ?? 'auto',
    opts.flooring ?? 'auto',
    opts.rounds ?? undefined,
  );
  const drift = [];
  if (after.errors.length) drift.push(...after.errors);
  if (after.players.length !== summary.players.length) {
    drift.push(
      `player count changed from ${summary.players.length} to ${after.players.length}`,
    );
  }
  if (after.songs !== summary.songs) {
    drift.push(`song count changed from ${summary.songs} to ${after.songs}`);
  }
  if (after.voteRows !== summary.voteRows) {
    drift.push(`vote rows changed from ${summary.voteRows} to ${after.voteRows}`);
  }
  if (drift.length) {
    fail(
      `Redaction altered the data: ${drift.join('; ')}`,
      'This is a bug — the export was left unpublished rather than published wrongly.',
    );
  }

  const changed = [...map.entries()].filter(([key, value]) => key !== value.toLowerCase());
  console.log(`\n${c.bold('Redacting surnames')}`);
  for (const original of summary.players) {
    const redacted = map.get(original.trim().toLowerCase().replace(/\s+/g, ' ')) ?? original;
    if (redacted === original.trim()) continue;
    console.log(`  ${original.trim()}  ${c.dim('→')}  ${c.green(redacted)}`);
  }
  const untouched = summary.players.length - changed.length;
  if (untouched > 0) {
    console.log(`  ${c.dim(`${untouched} name${untouched === 1 ? '' : 's'} had no surname to redact`)}`);
  }

  // Free-text edits are shown in full: a comment is published verbatim, so a
  // wrong substitution here is visible on the page.
  if (report.proseChanges.length) {
    console.log(
      `\n${c.bold('Names found in comments')} ${c.dim(`(${report.proseChanges.length} rewritten)`)}`,
    );
    for (const change of report.proseChanges.slice(0, 12)) {
      console.log(`  ${c.dim(change.column)}: ${change.before}`);
      console.log(`  ${' '.repeat(change.column.length)}  ${c.green(change.after)}`);
    }
    if (report.proseChanges.length > 12) {
      console.log(`  ${c.dim(`… and ${report.proseChanges.length - 12} more`)}`);
    }
  }

  // Anything left is in a column published verbatim, such as a song title.
  const surnames = summary.players
    .flatMap((name) => name.trim().split(/\s+/).slice(1))
    .filter((token) => token.length > 1);
  const stillPresent = new Set();
  for (const file of published) {
    for (const surname of surnames) {
      if (new RegExp(`\\b${surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(file.text)) {
        stillPresent.add(surname);
      }
    }
  }
  if (stillPresent.size) {
    console.log(
      `\n  ${c.yellow('!')} still present somewhere: ${[...stillPresent].join(', ')}`,
    );
    console.log(`    ${c.dim('probably a song or artist name — those are published as-is')}`);
  }
}

/* ------------------------------ artwork ------------------------------
 * Album art is resolved from the Spotify track ids the export already
 * carries, then inlined, so the published page shows artwork without
 * requesting anything when a reader opens it.
 * ------------------------------------------------------------------ */

let artwork = {};

if (opts.art) {
  const tracks = api.artworkTargets(published);
  if (tracks.length) {
    process.stdout.write(`\n${c.bold('Artwork')}\n  fetching for ${tracks.length} tracks `);
    let done = 0;
    const result = await fetchArtwork(tracks, {
      cachePath: join(root, '.cache/art.json'),
      onProgress: () => {
        done += 1;
        if (done % 10 === 0) process.stdout.write('.');
      },
    });
    artwork = result.art;
    const kb = (result.bytes / 1024).toFixed(0);
    console.log(
      `\n  ${c.green('✓')} ${Object.keys(artwork).length} covers ${c.dim(
        `(${result.fromCache} cached, ${result.fetched} downloaded, ~${kb} kB inlined)`,
      )}`,
    );
    if (result.failed) {
      console.log(`  ${c.yellow('!')} ${result.failed} had no artwork available, and are skipped`);
    }
    console.log(
      `  ${c.dim('only track ids were sent to Spotify; the built page fetches nothing')}`,
    );
  }
}

/* ------------------------------ genres ------------------------------
 * The export has no genre field, so this is the only figure resolved from
 * outside the league. Opt-in, because it is slow and only partial.
 * ------------------------------------------------------------------ */

let genreMap = {};

if (opts.genres) {
  const artists = api.artistNames(published);
  if (artists.length) {
    process.stdout.write(
      `\n${c.bold('Genres')}\n  looking up ${artists.length} artists on MusicBrainz `,
    );
    let done = 0;
    const result = await fetchGenres(artists, {
      cachePath: join(root, '.cache/genres.json'),
      onProgress: () => {
        done += 1;
        if (done % 10 === 0) process.stdout.write('.');
      },
    });
    genreMap = result.genres;
    const found = Object.keys(genreMap).length;
    console.log(
      `\n  ${c.green('✓')} ${found} of ${artists.length} artists tagged ${c.dim(
        `(${result.fromCache} cached, ${result.resolved} looked up)`,
      )}`,
    );
    if (result.unresolved.length) {
      const shown = result.unresolved.slice(0, 6).join(', ');
      console.log(
        `  ${c.yellow('!')} no genre for ${result.unresolved.length}: ${c.dim(shown)}${
          result.unresolved.length > 6 ? c.dim(', …') : ''
        }`,
      );
    }
    console.log(
      `  ${c.dim('genres are crowd-sourced tags, not league data — treat them as indicative')}`,
    );
  }
}

/* ------------------------------ build ------------------------------ */

const label =
  opts.label ??
  (files.length === 1 ? basename(files[0].name, extname(files[0].name)).replace(/[_-]+/g, ' ') : null);

const manifestPath = join(work, 'manifest.json');
writeFileSync(
  manifestPath,
  JSON.stringify({
    files: published,
    label,
    redacted: opts.redact,
    scoring: opts.scoring,
    flooring: opts.flooring,
    totalRounds: opts.rounds,
    art: artwork,
    genres: genreMap,
  }),
);

function viteBuild({ outDir, single }) {
  const args = ['vite', 'build', '--outDir', outDir, '--base', opts.base, '--emptyOutDir'];
  const result = spawnSync('npx', args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: {
      ...process.env,
      ML_BAKE_MANIFEST: manifestPath,
      ML_BAKE_SINGLE: single ? '1' : '0',
    },
  });
  if (result.status !== 0) {
    console.error(result.stdout ?? '');
    console.error(result.stderr ?? '');
    fail('The build failed.');
  }
  return result.stdout ?? '';
}

console.log(`\n${c.bold('Building')}`);
viteBuild({ outDir: opts.out, single: false });
const outPath = resolve(root, opts.out);
console.log(`  ${c.green('✓')} ${opts.out}/  ${c.dim('static site, ready to host')}`);

/* --------------------------- single file --------------------------- */

if (opts.single) {
  const singleDir = join(work, 'single');
  viteBuild({ outDir: singleDir, single: true });

  const html = readFileSync(join(singleDir, 'index.html'), 'utf8');
  const assetDir = join(singleDir, 'assets');
  const assets = existsSync(assetDir) ? readdirSync(assetDir) : [];
  const read = (f) => ({ fileName: f, code: readFileSync(join(assetDir, f), 'utf8') });

  const merged = inlineHtml({
    html,
    scripts: assets.filter((f) => f.endsWith('.js')).map(read),
    styles: assets.filter((f) => f.endsWith('.css')).map(read),
  });

  const singleFile = join(outPath, 'league.html');
  writeFileSync(singleFile, merged);
  const mb = (Buffer.byteLength(merged) / 1024 / 1024).toFixed(2);
  console.log(`  ${c.green('✓')} ${opts.out}/league.html  ${c.dim(`${mb} MB, self-contained`)}`);
}

/* ------------------------------ outro ------------------------------ */

console.log(`\n${c.bold('Publish')}`);
console.log(`  Any static host works — the page has no backend.`);
console.log(
  `  ${c.dim('It contacts Spotify only when a reader presses play on a song.')}`,
);
console.log(`  ${c.dim(`local check:  npx vite preview --outDir ${opts.out}`)}`);
if (opts.base === '/') {
  console.log(
    `  ${c.dim('for a subfolder host such as GitHub Pages, rebuild with --base /repo-name/')}`,
  );
}
console.log(
  `\n${c.yellow('Note')} the export is embedded in these files in readable form: ${
    opts.redact ? 'first names,' : 'names,'
  }\n` +
    `     songs, every vote and who cast it. Anyone with the URL can read it.\n` +
    (opts.redact
      ? `     Surnames are redacted, but the rest is public — song comments are\n` +
        `     published verbatim, so skim them if the league is candid.\n`
      : `     Put it somewhere private if the league would not want it public, or\n` +
        `     rebuild with --redact to publish surnames as an initial.\n`),
);
