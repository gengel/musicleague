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
    ['A', 1], // 100% win share
    ['B', 0.92], // 90–99% → one hand on the trophy
    ['C', 0.5], // 40–64% → flip of a coin
    ['D', 0.25], // 10–39% → still in it
    ['E', 0.04], // 1–9% → chance
    ['F', 0], // 0% win share
  ]);

  it('bands the uncertain middle by win share', () => {
    const bands = winProbabilityBands(ranked, shares);
    const keyOf = (name: string): BandKey =>
      bands.find((b) => b.players.some((p) => p.name === name))!.key;
    expect(keyOf('B')).toBe('crowned');
    expect(keyOf('C')).toBe('drivers');
    expect(keyOf('D')).toBe('stillinit');
  });

  it('does NOT clinch a 100% player who can still be caught', () => {
    const bands = winProbabilityBands(ranked, shares); // no clinchedId
    const keyOfA = bands.find((b) => b.players.some((p) => p.name === 'A'))!.key;
    expect(keyOfA).toBe('crowned'); // 100% but not mathematically safe
    expect(bands.some((b) => b.key === 'locked')).toBe(false);
  });

  it('does NOT write off a 0% player who is not mathematically out', () => {
    const bands = winProbabilityBands(ranked, shares); // no eliminatedIds
    const keyOfF = bands.find((b) => b.players.some((p) => p.name === 'F'))!.key;
    expect(keyOfF).toBe('chance'); // 0% but still alive
    expect(bands.some((b) => b.key === 'gameover')).toBe(false);
  });

  it('clinches only on mathematical certainty, regardless of win share', () => {
    // B is at 92% but A has clinched: A → locked, B drops to its share band.
    const bands = winProbabilityBands(ranked, shares, 'A');
    expect(bands.find((b) => b.key === 'locked')!.players.map((p) => p.name)).toEqual(['A']);
    expect(bands.find((b) => b.players.some((p) => p.name === 'B'))!.key).toBe('crowned');
  });

  it('writes off only mathematically eliminated players', () => {
    const bands = winProbabilityBands(ranked, shares, undefined, new Set(['E', 'F']));
    expect(bands.find((b) => b.key === 'gameover')!.players.map((p) => p.name)).toEqual(['E', 'F']);
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
    const bands = winProbabilityBands(ranked, shares, 'A', new Set(['F']));
    expect(bands.map((b) => b.key)).toEqual([
      'locked', // A
      'crowned', // B
      'drivers', // C
      'stillinit', // D
      'chance', // E (0.04, not eliminated)
      'gameover', // F
    ]);
    expect(bands.some((b) => b.key === 'yourstolose')).toBe(false);
  });

  it('carries the win share through for display', () => {
    const bands = winProbabilityBands(ranked, shares, 'A');
    const a = bands[0].players[0];
    expect(a.name).toBe('A');
    expect(a.winShare).toBe(1);
  });

  it('treats a missing share as zero but still alive (chance, not game over)', () => {
    const bands = winProbabilityBands([player('A', 10)], new Map());
    expect(bands[0].key).toBe('chance');
    expect(bands[0].players[0].winShare).toBe(0);
  });

  it('orders players within a band by win share, not standings points', () => {
    // P leads on points but Q has the higher win share; within the band Q
    // should come first.
    const bands = winProbabilityBands(
      [player('P', 30), player('Q', 20)],
      new Map([
        ['P', 0.2],
        ['Q', 0.35],
      ]),
    );
    const band = bands.find((b) => b.key === 'stillinit')!;
    expect(band.players.map((p) => p.name)).toEqual(['Q', 'P']);
    // Standings rank is preserved even though the display order is by win share.
    expect(band.players.find((p) => p.name === 'P')!.rank).toBe(1);
    expect(band.players.find((p) => p.name === 'Q')!.rank).toBe(2);
  });
});
