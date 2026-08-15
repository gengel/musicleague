import { buildRedactionMap, redactCsvText } from '../lib/redact';
import { describe, expect, it } from 'vitest';
import { artworkTargets, describeLeague } from '../lib/inspect';
import { buildDemoCsv } from '../lib/demo';

describe('artwork targets', () => {
  /** Real-format Spotify ids: 22 characters of base62. */
  const withIds = (count: number) => {
    const rows = Array.from({ length: count }, (_, i) => {
      const id = `2SHTKB8YYlawTGIuJ2b2${String(i).padStart(2, '0')}`;
      return `R1,P${i},Song ${i},Artist,${id}`;
    });
    return `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
${rows.join('\n')}

[votes]
Round,Voter,Submitter,Song Title,Points
${rows.map((_, i) => `R1,P${(i + 1) % count},P${i},Song ${i},${count - i}`).join('\n')}
`;
  };

  it('asks for a cover per track and the hero variant only where needed', () => {
    const targets = artworkTargets([{ name: 'x.csv', text: withIds(12) }], 3);
    expect(targets).toHaveLength(12);
    // Every track needs the table cover.
    for (const t of targets) expect(t.sizes).toContain('lg');
    // The 640px variant is ~70x the weight, so only a few get it: the top
    // three asked for, plus the round winner (already among them here).
    const hero = targets.filter((t) => t.sizes.includes('xl'));
    expect(hero.length).toBeGreaterThanOrEqual(3);
    expect(hero.length).toBeLessThanOrEqual(4);
    // Every id appears once, however many rounds it turns up in.
    expect(new Set(targets.map((t) => t.id)).size).toBe(targets.length);
  });

  it('gives the hero variant to the highest scorers', () => {
    const targets = artworkTargets([{ name: 'x.csv', text: withIds(6) }], 2);
    // Song 0 drew the most points in the fixture, so it leads.
    expect(targets[0].sizes).toContain('xl');
    expect(targets.at(-1)!.sizes).not.toContain('xl');
  });

  it('skips songs with no Spotify id rather than inventing one', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist
R1,Ada,No Id Here,Someone
`;
    expect(artworkTargets([{ name: 'x.csv', text: csv }])).toEqual([]);
  });

  it('reads ids from the classic export URI form', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify URI
R1,Ada,Song,Someone,spotify:track:2SHTKB8YYlawTGIuJ2b2ok
`;
    expect(artworkTargets([{ name: 'x.csv', text: csv }])).toEqual([
      { id: '2SHTKB8YYlawTGIuJ2b2ok', sizes: ['lg', 'xl'] },
    ]);
  });
});

describe('describeLeague', () => {
  it('summarises a valid export', () => {
    const summary = describeLeague([
      { name: 'My League.csv', text: buildDemoCsv() },
    ]);
    expect(summary.errors).toEqual([]);
    expect(summary.players).toHaveLength(7);
    expect(summary.rounds).toHaveLength(6);
    expect(summary.songs).toBe(41);
    expect(summary.voteRows).toBeGreaterThan(100);
    expect(summary.hasVotes).toBe(true);
    expect(summary.roundsWithResults).toBe(6);
    expect(summary.leagueName).toBe('My League');
  });

  it('reports an error for a file that is not an export, rather than throwing', () => {
    const summary = describeLeague([{ name: 'budget.csv', text: 'a,b\n1,2\n' }]);
    expect(summary.errors.length).toBeGreaterThan(0);
    expect(summary.errors[0]).toMatch(/No submissions found/);
  });

  it('flags an export whose vote breakdown is withheld', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist
R1,Ada,Song,Artist

[votes]
Round,Voter,Submitter,Song Title,Points
`;
    const summary = describeLeague([{ name: 'x.csv', text: csv }]);
    expect(summary.errors).toEqual([]);
    expect(summary.hasVotes).toBe(false);
    expect(summary.warnings.some((w) => w.includes('No vote rows'))).toBe(true);
  });
});

describe('snapshot rebuild fidelity (I7)', () => {
  // A snapshot archives the export text verbatim (scripts/snapshot.mjs), so
  // rebuilding from it is faithful exactly when the bake pipeline is a pure
  // function of that text: same bytes in, same summary and redaction out.
  // This is the property that makes "rebuild round 6 from its archive"
  // actually mean something, without spawning the CLI or touching the network.
  const exportText = buildDemoCsv();

  it('produces an identical summary from the same export text, rebuilt independently', () => {
    const first = describeLeague([{ name: 'export.csv', text: exportText }]);
    // Simulate "time has passed, the export was archived and reloaded" by
    // round-tripping the text through a fresh string before re-parsing.
    const restored = String(exportText);
    const second = describeLeague([{ name: 'export.csv', text: restored }]);

    expect(second.players).toEqual(first.players);
    expect(second.rounds).toEqual(first.rounds);
    expect(second.songs).toBe(first.songs);
    expect(second.voteRows).toBe(first.voteRows);
    expect(second.totals).toEqual(first.totals);
    expect(second.winners).toEqual(first.winners);
  });

  it('redacts an archived export to the same result as redacting it fresh', () => {
    const summary = describeLeague([{ name: 'export.csv', text: exportText }]);
    const map = buildRedactionMap(summary.players);
    const report1 = { proseChanges: [] as { column: string; before: string; after: string }[] };
    const report2 = { proseChanges: [] as { column: string; before: string; after: string }[] };

    const redactedNow = redactCsvText(exportText, map, 'export.csv', report1);
    const redactedAgain = redactCsvText(String(exportText), map, 'export.csv', report2);

    expect(redactedAgain).toBe(redactedNow);
    expect(report2).toEqual(report1);
  });
});
