#!/usr/bin/env node
/**
 * Archives the current export, its pinned enrichment, and the last build,
 * before the next round's export overwrites them.
 *
 * Music League exports are cumulative — the round 7 file replaces the round 6
 * one entirely — so without this step there is no way to see what the site
 * looked like at round 6 once round 7 lands. Nothing here is generated; it is
 * a straight copy of `src/data/`, `enrich/` and `dist/` into
 * `snapshots/r<n>-<date>/`, keyed off how many rounds currently have results.
 *
 *   npm run snapshot            snapshot the current round count
 *   npm run snapshot -- --force overwrite an existing snapshot for this round
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const force = process.argv.includes('--force');

/** How many rounds have results, counted directly from the export. */
async function countRounds() {
  const dataDir = join(root, 'src/data');
  if (!existsSync(dataDir)) fail('src/data does not exist — nothing to snapshot.');

  const { rolldown } = await import('rolldown');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const work = mkdtempSync(join(tmpdir(), 'ml-snapshot-'));
  try {
    const bundle = await rolldown({
      input: join(root, 'src/lib/node-api.ts'),
      platform: 'node',
      logLevel: 'silent',
    });
    const outFile = join(work, 'node-api.mjs');
    await bundle.write({ file: outFile, format: 'esm' });
    await bundle.close();
    const api = await import(`file://${outFile}`);

    const files = readdirSync(dataDir)
      .filter((f) => /\.(csv|txt)$/i.test(f))
      .map((f) => ({ name: f, text: readFileSync(join(dataDir, f), 'utf8') }));
    if (!files.length) fail('No CSV files in src/data — nothing to snapshot.');

    const summary = api.describeLeague(files, 'auto', 'auto');
    if (summary.errors.length) {
      fail(`src/data does not parse as an export: ${summary.errors[0]}`);
    }
    return summary.roundsWithResults;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const roundCount = await countRounds();
const today = new Date().toISOString().slice(0, 10);
const name = `r${roundCount}-${today}`;
const dest = join(root, 'snapshots', name);

if (existsSync(dest) && !force) {
  fail(
    `snapshots/${name} already exists.`,
    'Pass --force to overwrite it, or this is a re-run for a round already archived.',
  );
}
if (existsSync(dest) && force) {
  rmSync(dest, { recursive: true, force: true });
}

console.log(`\n${c.bold('Snapshotting')} ${c.green(name)}`);

mkdirSync(dest, { recursive: true });

/** Copies `src` to `dest/label` if `src` exists, and reports what happened. */
function archive(src, label) {
  const from = join(root, src);
  if (!existsSync(from)) {
    console.log(`  ${c.dim(`${label} — nothing to copy (${src} does not exist)`)}`);
    return false;
  }
  const to = join(dest, label);
  cpSync(from, to, { recursive: true });
  const size = duSize(to);
  console.log(`  ${c.green('✓')} ${label.padEnd(8)} ${c.dim(`${(size / 1024).toFixed(0)} kB`)}`);
  return true;
}

function duSize(path) {
  const stat = statSync(path);
  if (stat.isFile()) return stat.size;
  let total = 0;
  for (const entry of readdirSync(path)) {
    total += duSize(join(path, entry));
  }
  return total;
}

const hasExport = archive('src/data', 'export');
const hasEnrich = archive('enrich', 'enrich');
const hasDist = archive('dist', 'dist');

// league.html is the last artifact the (now-removed) single-file inliner
// produced. Once it exists nothing can rebuild it from source, so it is kept
// verbatim wherever it turns up rather than regenerated.
if (existsSync(join(root, 'dist/league.html'))) {
  console.log(`  ${c.dim('league.html preserved inside dist/ (no rebuild path exists for it)')}`);
}

writeFileSync(
  join(dest, 'manifest.json'),
  JSON.stringify(
    {
      round: roundCount,
      archivedAt: new Date().toISOString(),
      hasExport,
      hasEnrich,
      hasDist,
    },
    null,
    2,
  ),
);

if (!hasExport) {
  fail(
    `snapshots/${name} was created without an export.`,
    'This should not happen — src/data was checked above. Investigate before relying on this snapshot.',
  );
}

console.log(`\n${c.bold('Done')} ${c.dim(`snapshots/${name}/`)}`);
console.log(
  `  ${c.dim('Safe to replace src/data now — this round is archived.')}`,
);
