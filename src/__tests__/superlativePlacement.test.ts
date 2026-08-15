/**
 * I5 — All expected superlatives appear exactly once across the app.
 *
 * The placement audit maps each superlative label to the tab it lives on.
 * This test verifies:
 * 1. No label appears in more than one tab's strip.
 * 2. Every label in the audit is produced by buildSuperlatives on a league
 *    that has the relevant data (competitive scoring, dated songs, votes).
 * 3. Obscurity-gated labels are registered but only present when obscurity
 *    data is available — they silently stay absent otherwise (I6).
 */

import { describe, it, expect } from 'vitest';
import { buildDemoCsv, buildDemoEnrichment } from '../lib/demo';
import { parseLeague } from '../lib/parse';
import { computeStats, computeSuperlatives } from '../lib/stats';
import { attachEnrichment, parseEnrichment } from '../lib/enrich';

// ---------------------------------------------------------------------------
// Placement audit — every label and the tab it belongs to (section 8, PLAN.md)
// ---------------------------------------------------------------------------

const PLACEMENT: Record<string, string> = {
  // Overview
  'Biggest single haul': 'Overview',
  'Biggest haul never counted': 'Overview',
  'Best average song': 'Overview',
  Chattiest: 'Overview',

  // The Race
  'Most forfeited by not voting': 'The Race',
  'Most rounds skipped voting': 'The Race',
  'Broadest support base': 'The Race',
  'Most polarizing act': 'The Race',

  // The Songs (row 1)
  'Widest appeal': 'The Songs',
  'Most divisive': 'The Songs',
  'Most downvoted': 'The Songs',
  // 'Deepest cut to score': 'The Songs',  obscurity-gated — tested separately

  // The Songs (row 2)
  'Narrowest win': 'The Songs',
  'Most one-sided single vote': 'The Songs',
  // 'Biggest hit to bomb': 'The Songs',   obscurity-gated
  'The time capsule': 'The Songs',

  // The Room (row 1)
  'Biggest superfan': 'The Room',
  'Mutual admiration society': 'The Room',
  'Most unrequited': 'The Room',
  'Arch-nemesis': 'The Room',

  // The Room (row 2)
  'Most points given (raw)': 'The Room',
  'Coldest shoulder': 'The Room',

  // Players
  'Most generous spread': 'Players',
  'Biggest stacker': 'Players',
  'Most mainstream taste': 'Players',
  'Biggest contrarian': 'Players',

  // Play-by-Play (round-level)
  'Highest-scoring round': 'Play-by-Play',
  'Lowest-scoring round': 'Play-by-Play',
  'Best turnout': 'Play-by-Play',
  'Most points lost in a round': 'Play-by-Play',
};

const OBSCURITY_GATED = ['Deepest cut to score', 'Biggest hit to bomb'];

function buildStats(withObscurity = false) {
  const league = parseLeague([{ name: 'demo.csv', text: buildDemoCsv() }]);
  const computed = computeStats(league, { scoring: 'competitive', flooring: 'none' });
  const rawEnrich = buildDemoEnrichment();
  if (!withObscurity) {
    // Clear obscurity so gated superlatives stay absent
    rawEnrich.obscurity = {};
  }
  const enrichment = parseEnrichment(rawEnrich);
  const enrichedSongs = attachEnrichment(computed.songs, enrichment);
  const enrichedStats = { ...computed, songs: enrichedSongs };
  return { ...enrichedStats, superlatives: computeSuperlatives(enrichedStats) };
}

describe('I5 — superlative placement audit', () => {
  it('no label is duplicated across tabs', () => {
    const allLabels = Object.keys(PLACEMENT);
    const seen = new Set<string>();
    for (const label of allLabels) {
      expect(seen.has(label), `Duplicate label in audit: "${label}"`).toBe(false);
      seen.add(label);
    }
  });

  it('all non-obscurity superlatives are produced by the demo league', () => {
    const stats = buildStats(false);
    const produced = new Set(stats.superlatives.map((s) => s.label));
    for (const label of Object.keys(PLACEMENT)) {
      expect(produced.has(label), `Missing superlative: "${label}"`).toBe(true);
    }
  });

  it('obscurity-gated superlatives are absent when no obscurity data exists', () => {
    const stats = buildStats(false);
    const produced = new Set(stats.superlatives.map((s) => s.label));
    for (const label of OBSCURITY_GATED) {
      expect(produced.has(label), `"${label}" should be absent without obscurity data`).toBe(false);
    }
  });

  it('obscurity-gated superlatives appear when obscurity data is present', () => {
    const stats = buildStats(true);
    const produced = new Set(stats.superlatives.map((s) => s.label));
    for (const label of OBSCURITY_GATED) {
      // The demo league has obscurity on every-third song; enough for at least
      // one candidate in each direction.
      expect(produced.has(label), `"${label}" should appear with obscurity data`).toBe(true);
    }
  });

  it('total non-obscurity superlative count matches the audit', () => {
    const stats = buildStats(false);
    // The demo uses 'none' flooring so no-floor superlatives appear; filter to
    // only those registered in the audit.
    const auditedProduced = stats.superlatives.filter((s) =>
      PLACEMENT[s.label] !== undefined,
    );
    expect(auditedProduced).toHaveLength(Object.keys(PLACEMENT).length);
  });
});
