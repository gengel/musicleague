import { describe, expect, it } from 'vitest';
import { parseLeague } from '../lib/parse';
import { computeStats } from '../lib/stats';
import { attachEnrichment, parseEnrichment } from '../lib/enrich';
import { buildDemoCsv, buildDemoEnrichment } from '../lib/demo';

describe('buildDemoEnrichment', () => {
  const stats = computeStats(parseLeague([{ name: 'demo.csv', text: buildDemoCsv() }]));
  const enrichment = buildDemoEnrichment();

  it('produces non-empty years, covers, facts and obscurity', () => {
    expect(Object.keys(enrichment.years).length).toBeGreaterThan(0);
    expect(Object.keys(enrichment.covers).length).toBeGreaterThan(0);
    expect(Object.keys(enrichment.facts).length).toBeGreaterThan(0);
    expect(Object.keys(enrichment.obscurity).length).toBeGreaterThan(0);
  });

  it('keys years/covers/facts/obscurity by the same spotifyId the demo songs actually carry', () => {
    const realIds = new Set(stats.songs.map((s) => s.spotifyId).filter(Boolean));
    for (const id of Object.keys(enrichment.years)) expect(realIds.has(id)).toBe(true);
    for (const id of Object.keys(enrichment.covers)) expect(realIds.has(id)).toBe(true);
  });

  it('declares a round kind whose key matches a real round id in the demo league', () => {
    const realRoundIds = new Set(stats.rounds.map((r) => r.round.id));
    for (const id of Object.keys(enrichment.rounds)) expect(realRoundIds.has(id)).toBe(true);
  });

  it('actually attaches onto the demo league\'s songs end-to-end, the same way App.tsx wires it', () => {
    const parsed = parseEnrichment(enrichment);
    const enriched = attachEnrichment(stats.songs, parsed);
    expect(enriched.some((s) => s.year !== undefined)).toBe(true);
    expect(enriched.some((s) => s.cover !== undefined)).toBe(true);
    expect(enriched.some((s) => s.fact !== undefined)).toBe(true);
    expect(enriched.some((s) => s.obscurity !== undefined)).toBe(true);
  });

  it('is deterministic across calls', () => {
    expect(buildDemoEnrichment()).toEqual(buildDemoEnrichment());
  });
});
