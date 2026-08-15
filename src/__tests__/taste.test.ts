import { describe, expect, it } from 'vitest';
import { parseLeague } from '../lib/parse';
import { computeStats } from '../lib/stats';
import { buildDemoCsv } from '../lib/demo';
import {
  classifyQuadrant,
  computeDecadeTable,
  computeEraProfiles,
  computeQuadrantTable,
  describeArchetype,
  eraBand,
  findDoubleAgents,
} from '../lib/taste';

const baseStats = computeStats(parseLeague([{ name: 'demo.csv', text: buildDemoCsv() }]), {
  scoring: 'competitive',
  flooring: 'none',
});

/**
 * Attaches synthetic years (and optionally obscurity) directly onto the demo
 * league's songs, keyed by trackId rather than spotifyId — the demo's
 * synthetic ids ("track000") are deliberately too short to pass the real
 * `spotifyTrackId` parser (see parse.ts), so they never carry a `spotifyId`
 * and `attachEnrichment`'s URI-keyed join cannot be exercised via the demo
 * league. taste.ts's functions only care that the field is populated on the
 * SongStats objects, so this attaches it directly instead.
 */
function withYears(yearFor: (trackId: string) => number | undefined, obscurityFor?: (trackId: string) => number) {
  const songs = baseStats.songs.map((s) => {
    const year = yearFor(s.trackId);
    const obscurityValue = obscurityFor?.(s.trackId);
    return {
      ...s,
      year,
      obscurity:
        obscurityValue !== undefined
          ? { value: obscurityValue, source: 'manual' as const, fetchedAt: '2026-01-01' }
          : undefined,
    };
  });
  return { ...baseStats, songs };
}

describe('eraBand', () => {
  it('buckets a year into the right band', () => {
    expect(eraBand(1975)).toBe('Vinyl era');
    expect(eraBand(1995)).toBe('Crate digger');
    expect(eraBand(2005)).toBe('Y2K kid');
    expect(eraBand(2015)).toBe('Streaming native');
    expect(eraBand(2023)).toBe('Algorithm native');
  });
});

describe('describeArchetype', () => {
  it('returns the bare band with no obscurity data (I6)', () => {
    expect(describeArchetype(1995)).toBe('Crate digger');
  });

  it('returns Unclassified rather than a fabricated era when there is no blend year', () => {
    expect(describeArchetype(undefined)).toBe('Unclassified');
  });

  it('adds a modifier without changing the band, at either extreme', () => {
    expect(describeArchetype(1995, 10)).toBe('Crate digger, deep cuts');
    expect(describeArchetype(1995, 90)).toBe('Crate digger, greatest hits');
    expect(describeArchetype(1995, 50)).toBe('Crate digger'); // middle: no modifier
  });
});

describe('computeEraProfiles', () => {
  it('omits players with no dated submissions rather than fabricating an era (I6)', () => {
    const stats = withYears(() => undefined);
    const profiles = computeEraProfiles(stats);
    expect(profiles.every((p) => p.submittedYear === undefined)).toBe(true);
  });

  it('computes submittedYear as the median of a player\'s dated songs', () => {
    // Every song gets the same year, so the median is unambiguous regardless
    // of which player submitted what.
    const stats = withYears(() => 2000);
    const profiles = computeEraProfiles(stats);
    const withData = profiles.filter((p) => p.submittedCount > 0);
    expect(withData.length).toBeGreaterThan(0);
    for (const p of withData) expect(p.submittedYear).toBe(2000);
  });

  it('blends submitted and upvoted year as 2:1', () => {
    // All songs from odd rounds are dated 1990, even rounds 2020, so a
    // player's submittedYear and upvotedYear will generally differ.
    const stats = withYears((id) => {
      const song = baseStats.songs.find((s) => s.trackId === id);
      return song && song.roundSequence % 2 === 0 ? 1990 : 2020;
    });
    const profiles = computeEraProfiles(stats);
    for (const p of profiles) {
      if (p.submittedYear !== undefined && p.upvotedYear !== undefined) {
        const expected = (2 * p.submittedYear + p.upvotedYear) / 3;
        expect(p.blendYear).toBeCloseTo(expected, 5);
      }
    }
  });

  it('falls back to submittedYear alone when nobody upvoted this player', () => {
    const stats = withYears(() => 2000);
    const profiles = computeEraProfiles(stats);
    const noUpvotes = profiles.find((p) => p.submittedCount > 0 && p.upvotedCount === 0);
    if (noUpvotes) expect(noUpvotes.blendYear).toBe(noUpvotes.submittedYear);
  });
});

describe('findDoubleAgents', () => {
  it('only returns players whose era gap meets the threshold', () => {
    const stats = withYears((id) => {
      const song = baseStats.songs.find((s) => s.trackId === id);
      return song && song.roundSequence % 2 === 0 ? 1990 : 2020;
    });
    const profiles = computeEraProfiles(stats);
    const agents = findDoubleAgents(profiles, 5);
    for (const a of agents) expect(a.eraGap).toBeGreaterThanOrEqual(5);
  });

  it('returns nothing when every player submits and rewards the same era', () => {
    const stats = withYears(() => 2000);
    const profiles = computeEraProfiles(stats);
    expect(findDoubleAgents(profiles, 1)).toEqual([]);
  });
});

describe('computeDecadeTable', () => {
  it('groups songs into their release decade and averages net score', () => {
    const stats = withYears((id) => {
      const song = baseStats.songs.find((s) => s.trackId === id);
      return song && song.roundSequence % 2 === 0 ? 1994 : 2011;
    });
    const table = computeDecadeTable(stats);
    const decades = table.map((d) => d.decade);
    expect(decades).toContain(1990);
    expect(decades).toContain(2010);
    expect(decades).toEqual([...decades].sort((a, b) => a - b));
  });

  it('returns an empty table when nothing is dated (I6)', () => {
    const stats = withYears(() => undefined);
    expect(computeDecadeTable(stats)).toEqual([]);
  });
});

describe('classifyQuadrant', () => {
  it('classifies all four combinations correctly', () => {
    expect(classifyQuadrant(1990, 20, 2000)).toBe('old & obscure');
    expect(classifyQuadrant(1990, 80, 2000)).toBe('old & famous');
    expect(classifyQuadrant(2020, 20, 2000)).toBe('new & obscure');
    expect(classifyQuadrant(2020, 80, 2000)).toBe('new & famous');
  });
});

describe('computeQuadrantTable', () => {
  it('returns an empty array when no song has both a year and obscurity (I6 — degrade to the decade table instead)', () => {
    const stats = withYears(() => 2000); // years but no obscurity
    expect(computeQuadrantTable(stats)).toEqual([]);
  });

  it('produces up to four quadrants when both dimensions are present', () => {
    const stats = withYears(
      (id) => {
        const song = baseStats.songs.find((s) => s.trackId === id);
        return song && song.roundSequence % 2 === 0 ? 1990 : 2020;
      },
      (id) => {
        const song = baseStats.songs.find((s) => s.trackId === id);
        return song && Number(song.trackId.replace(/\D/g, '') || 0) % 2 === 0 ? 20 : 80;
      },
    );
    const table = computeQuadrantTable(stats);
    expect(table.length).toBeGreaterThan(0);
    expect(table.length).toBeLessThanOrEqual(4);
    for (const q of table) expect(q.count).toBeGreaterThan(0);
  });
});
