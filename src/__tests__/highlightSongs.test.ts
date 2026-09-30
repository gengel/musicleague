import { describe, expect, it } from 'vitest';
import { highlightSongs, popularityPosition, tasteLead } from '../lib/playerProfile';
import type { SongStats } from '../lib/stats';

const song = (title: string, effectiveNet: number): SongStats =>
  ({ title, effectiveNet, trackId: title, roundId: 'r' }) as unknown as SongStats;

describe('highlightSongs', () => {
  it('always shows the single best, plus up to two more that clear +6', () => {
    // Sorted best-first, as the profile provides.
    const songs = [song('A', 10), song('B', 8), song('C', 6), song('D', 3), song('E', -4)];
    const { best, worst } = highlightSongs(songs);
    // A always; B and C clear +6; D (3) does not.
    expect(best.map((s) => s.title)).toEqual(['A', 'B', 'C']);
    expect(worst?.title).toBe('E');
  });

  it('shows the best even when nothing clears +6', () => {
    const songs = [song('A', 3), song('B', 1), song('C', -2)];
    const { best } = highlightSongs(songs);
    expect(best.map((s) => s.title)).toEqual(['A']); // just the top one
  });

  it('caps extras at two, so at most three best', () => {
    const songs = [song('A', 20), song('B', 15), song('C', 10), song('D', 9)];
    expect(highlightSongs(songs).best).toHaveLength(3);
  });

  it('always returns a worst distinct from the best', () => {
    const songs = [song('A', 10), song('B', -5)];
    const { best, worst } = highlightSongs(songs);
    expect(best.map((s) => s.title)).toEqual(['A']);
    expect(worst?.title).toBe('B');
  });

  it('does not repeat a single song as both best and worst', () => {
    const { best, worst } = highlightSongs([song('Only', 4)]);
    expect(best.map((s) => s.title)).toEqual(['Only']);
    expect(worst).toBeUndefined();
  });

  it('handles no songs', () => {
    expect(highlightSongs([])).toEqual({ best: [], worst: undefined });
  });
});

describe('tasteLead', () => {
  it('picks the heaviest row, not the first in display order', () => {
    // Popularity is displayed deep→hit; Bob's real split had "known" dominant.
    expect(tasteLead([['deep cut', 2], ['known', 6], ['popular', 2]])).toBe('known');
    // Eras are displayed by name.
    expect(tasteLead([['1970s', 1], ['2000s', 4], ['2010s', 2]])).toBe('2000s');
  });
  it('keeps the earlier row on a tie, and handles empty', () => {
    expect(tasteLead([['a', 3], ['b', 3]])).toBe('a');
    expect(tasteLead([])).toBeUndefined();
  });
});

describe('popularityPosition', () => {
  it('averages band positions weighted by count', () => {
    // deep cut=0, hit=1; equal weight → 0.5
    expect(popularityPosition([['deep cut', 1], ['hit', 1]])).toEqual({ pos: 0.5, weight: 2 });
    // all known (0.5)
    expect(popularityPosition([['known', 4]])).toEqual({ pos: 0.5, weight: 4 });
    // leans deep: deep cut(0)*3 + niche(0.25)*1 = 0.25/4
    const r = popularityPosition([['deep cut', 3], ['niche', 1]])!;
    expect(r.pos).toBeCloseTo(0.0625);
    expect(r.weight).toBe(4);
  });
  it('is undefined with no popularity data', () => {
    expect(popularityPosition([])).toBeUndefined();
  });
});
