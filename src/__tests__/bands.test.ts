import { describe, expect, it } from 'vitest';
import { contentionBands, winProbabilityBands, type BandKey } from '../lib/future';
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

describe('winProbabilityBands', () => {
  const ranked = [
    player('A', 40),
    player('B', 30),
    player('C', 20),
    player('D', 10),
    player('E', 5),
    player('F', 0),
  ];
  const shares = new Map<string, number>([
    ['A', 1], // 100% → clinched
    ['B', 0.92], // 90–99% → one hand on the trophy
    ['C', 0.5], // 40–64% → flip of a coin
    ['D', 0.25], // 10–39% → still in it
    ['E', 0.04], // 1–9% → chance
    ['F', 0], // 0% → game over
  ]);

  it('places each player in the band for their win share', () => {
    const bands = winProbabilityBands(ranked, shares);
    const keyOf = (name: string): BandKey =>
      bands.find((b) => b.players.some((p) => p.name === name))!.key;
    expect(keyOf('A')).toBe('locked');
    expect(keyOf('B')).toBe('crowned');
    expect(keyOf('C')).toBe('drivers');
    expect(keyOf('D')).toBe('stillinit');
    expect(keyOf('E')).toBe('chance');
    expect(keyOf('F')).toBe('gameover');
  });

  it('puts a 65–89% player in "yours to lose"', () => {
    const bands = winProbabilityBands(
      [player('X', 10), player('Y', 5)],
      new Map([
        ['X', 0.75],
        ['Y', 0.25],
      ]),
    );
    expect(bands.find((b) => b.players.some((p) => p.name === 'X'))!.key).toBe('yourstolose');
  });

  it('orders bands safest-first and omits empty ones', () => {
    const bands = winProbabilityBands(ranked, shares);
    expect(bands.map((b) => b.key)).toEqual([
      'locked',
      'crowned',
      'drivers',
      'stillinit',
      'chance',
      'gameover',
    ]);
    // 'yourstolose' had nobody, so it is absent.
    expect(bands.some((b) => b.key === 'yourstolose')).toBe(false);
  });

  it('carries the win share through for display', () => {
    const bands = winProbabilityBands(ranked, shares);
    const a = bands[0].players[0];
    expect(a.name).toBe('A');
    expect(a.winShare).toBe(1);
  });

  it('treats a missing share as zero (game over), never a crash', () => {
    const bands = winProbabilityBands([player('A', 10)], new Map());
    expect(bands[0].key).toBe('gameover');
    expect(bands[0].players[0].winShare).toBe(0);
  });
});
