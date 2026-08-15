import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const VIRTUAL_ID = 'virtual:league-data';
const RESOLVED_ID = '\0virtual:league-data';

/** JS string literals must not contain raw line separators. */
const toLiteral = (value: unknown): string =>
  JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/**
 * Supplies the league export to the bundle at build time.
 *
 * `npm run bake` writes a manifest of already-read CSVs and points
 * ML_BAKE_MANIFEST at it, which is how a static, self-contained build gets
 * its data. Without that variable the module resolves to null and the app
 * asks the visitor for a file as usual.
 */
function embeddedLeagueData(): Plugin {
  return {
    name: 'embedded-league-data',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      return null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      const manifestPath = process.env.ML_BAKE_MANIFEST;
      if (!manifestPath) {
        return [
          'export const embeddedFiles = null;',
          'export const embeddedLabel = null;',
          'export const embeddedRedacted = false;',
          'export const embeddedScoring = null;',
          'export const embeddedFlooring = null;',
          'export const embeddedTotalRounds = null;',
          'export const embeddedArt = {};',
          'export const embeddedGenres = {};',
          'export const embeddedEnrichment = {};',
        ].join('\n');
      }
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      return [
        `export const embeddedFiles = ${toLiteral(manifest.files)};`,
        `export const embeddedLabel = ${toLiteral(manifest.label ?? null)};`,
        `export const embeddedRedacted = ${manifest.redacted ? 'true' : 'false'};`,
        `export const embeddedScoring = ${toLiteral(manifest.scoring ?? null)};`,
        `export const embeddedFlooring = ${toLiteral(manifest.flooring ?? null)};`,
        `export const embeddedTotalRounds = ${toLiteral(manifest.totalRounds ?? null)};`,
        `export const embeddedArt = ${toLiteral(manifest.art ?? {})};`,
        `export const embeddedGenres = ${toLiteral(manifest.genres ?? {})};`,
        `export const embeddedEnrichment = ${toLiteral(manifest.enrichment ?? {})};`,
      ].join('\n');
    },
  };
}

export default defineConfig({
  plugins: [react(), embeddedLeagueData()],
  server: { port: 5173, open: true },
  test: {
    // Library tests run in node; component tests opt into jsdom with a
    // `@vitest-environment jsdom` docblock.
    environment: 'node',
  },
});
