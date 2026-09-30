import { describe, expect, it } from 'vitest';
import { contentionBands } from '../lib/future';
import type { PlayerStats } from '../lib/stats';

/** Minimal PlayerStats stub — only the fields the bander reads. */
const player = (playerId: string, pointsCounted: number): PlayerStats =>
  ({ playerId, name: playerId, pointsCounted, songs: 1 }) as unknown as PlayerStats;

describe('contentionBands', () => {
  const ranked = [player('A', 40), player('B', 30), player('C', 20), player('D', 0)];

  it('always puts the top player in the leading band alone', () => {
    const bands = contentionBands(ranked, 40, 20);
    expect(bands[0].key).toBe('leader');
    expect(bands[0].players.map((p) => p.name)).toEqual(['A']);
  });

  it('splits the rest by reach against the realistic budget', () => {
    // Budget 20: within 10 = contention, within 20 = outside, beyond = out.
    const bands = contentionBands(ranked, 40, 20);
    const byKey = Object.fromEntries(bands.map((b) => [b.key, b.players.map((p) => p.name)]));
    expect(byKey.contention).toEqual(['B']); // 10 back ≤ 10
    expect(byKey.outside).toEqual(['C']); // 20 back ≤ 20
    expect(byKey.eliminated).toEqual(['D']); // 40 back > 20
  });

  it('omits empty bands', () => {
    const bands = contentionBands([player('A', 5), player('B', 4)], 5, 100);
    expect(bands.map((b) => b.key)).toEqual(['leader', 'contention']);
  });

  it('treats an unknown finish line as everyone in contention', () => {
    const bands = contentionBands(ranked, 40, undefined);
    expect(bands.find((b) => b.key === 'contention')!.players).toHaveLength(3);
    expect(bands.some((b) => b.key === 'eliminated')).toBe(false);
  });

  it('records rank and points behind', () => {
    const bands = contentionBands(ranked, 40, 20);
    const b = bands.find((band) => band.key === 'contention')!.players[0];
    expect(b.rank).toBe(2);
    expect(b.behind).toBe(10);
  });
});
