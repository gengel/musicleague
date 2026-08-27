/**
 * Inlines the built JS + CSS into dist/index.html so the resulting file
 * opens directly from file:// without a server. Image references (art/)
 * stay external so the HTML file stays reasonable in size.
 *
 * Usage:  node scripts/inline.mjs [out=dist]
 * Writes: <out>/musicleague.html  (single self-contained file)
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'dist';
const htmlPath = join(out, 'index.html');
const assetsDir = join(out, 'assets');

const html = readFileSync(htmlPath, 'utf8');

const files = readdirSync(assetsDir);
const jsFile = files.find((f) => f.endsWith('.js'));
const cssFile = files.find((f) => f.endsWith('.css'));
if (!jsFile || !cssFile) {
  console.error('Could not find JS/CSS in', assetsDir);
  process.exit(1);
}

const js = readFileSync(join(assetsDir, jsFile), 'utf8');
const css = readFileSync(join(assetsDir, cssFile), 'utf8');

// Replace the <script src=...> and <link href=...> tags with inline blocks.
// The script must remain type="module" — the bundle uses import syntax.
const inlined = html
  .replace(
    /<script[^>]*src="[^"]*\.js"[^>]*><\/script>/,
    `<script type="module">${js}</script>`,
  )
  .replace(
    /<link[^>]*href="[^"]*\.css"[^>]*>/,
    `<style>${css}</style>`,
  );

const outPath = join(out, 'musicleague.html');
writeFileSync(outPath, inlined);

const sizeKb = (inlined.length / 1024).toFixed(0);
console.log(`✓ ${outPath}  (${sizeKb} KB, self-contained)`);
console.log(`  Album art still loads from ${out}/art/ — keep the folder alongside the HTML.`);
