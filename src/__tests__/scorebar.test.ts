import { describe, expect, it } from 'vitest';
import { divergingBar, divergingScale, scoreBarSegments } from '../components/ui';
import type { ScoreBreakdown } from '../lib/stats';

const make = (p: Partial<ScoreBreakdown>): ScoreBreakdown => ({
  upvotes: 0,
  downvotes: 0,
  forfeited: 0,
  absorbed: 0,
  total: 0,
  ...p,
});

/** Figures taken from a real league, so the cases are ones that occur. */
const CAROLINE_CONE = make({ upvotes: 54, downvotes: 10, total: 44 });
const BOB = make({ upvotes: 37, downvotes: 44, total: -7 });
const LAURA = make({ upvotes: 34, downvotes: 15, forfeited: 27, total: -8 });
const CAROLINE = make({ upvotes: 43, downvotes: 28, forfeited: 43, total: -28 });
const T33N = make({ upvotes: 59, downvotes: 33, forfeited: 6, total: 20 });
const LEAGUE = [CAROLINE_CONE, BOB, LAURA, CAROLINE, T33N];

describe('scoreBarSegments', () => {
  it('accounts for every upvote earned', () => {
    for (const b of LEAGUE) {
      const s = scoreBarSegments(b);
      expect(s.kept + s.cancelled + s.forfeited).toBe(b.upvotes);
    }
  });

  it('still shows the upvotes earned when downvotes exceed them', () => {
    // A bar that showed only losses would imply Bob earned nothing.
    expect(scoreBarSegments(BOB)).toEqual({
      kept: 0,
      cancelled: 37,
      forfeited: 0,
      belowZero: 7,
    });
  });

  it('separates forfeited upvotes from cancelled ones', () => {
    expect(scoreBarSegments(LAURA)).toEqual({
      kept: 0,
      cancelled: 7,
      forfeited: 27,
      belowZero: 8,
    });
  });

  it('treats floored downvotes as cancelled, never as below zero', () => {
    const floored = make({ upvotes: 2, downvotes: 5, absorbed: 3, total: 0 });
    expect(scoreBarSegments(floored)).toEqual({
      kept: 0,
      cancelled: 2,
      forfeited: 0,
      belowZero: 0,
    });
  });
});

describe('divergingScale', () => {
  it('places the zero axis where the two extremes balance', () => {
    const scale = divergingScale(LEAGUE);
    expect(scale.above).toBe(59); // t33nwitch earned the most
    expect(scale.below).toBe(28); // Caroline fell the furthest
    expect(scale.axis).toBeCloseTo((28 / 87) * 100, 6);
  });

  it('puts the axis hard left when nobody is below zero', () => {
    const scale = divergingScale([CAROLINE_CONE, T33N]);
    expect(scale.below).toBe(0);
    expect(scale.axis).toBe(0);
  });

  it('never divides by zero on an empty or blank league', () => {
    expect(divergingScale([]).above).toBe(1);
    expect(divergingScale([make({})]).above).toBe(1);
    expect(Number.isFinite(divergingScale([make({})]).axis)).toBe(true);
  });
});

describe('divergingBar', () => {
  const scale = divergingScale(LEAGUE);

  it('draws a positive score to the right of the axis only', () => {
    const bar = divergingBar(CAROLINE_CONE, scale);
    expect(bar.negative).toBe(0);
    expect(bar.positive).toBeCloseTo((44 / 59) * 100, 6);
  });

  it('draws a negative score to the left of the axis only', () => {
    const bar = divergingBar(BOB, scale);
    expect(bar.positive).toBe(0);
    expect(bar.negative).toBeCloseTo((7 / 28) * 100, 6);
  });

  it('shows what was earned even when the score went negative', () => {
    // The whole point: Bob earned 37 and still finished below zero.
    const bar = divergingBar(BOB, scale);
    expect(bar.ghost).toBeCloseTo((37 / 59) * 100, 6);
    expect(bar.ghost).toBeGreaterThan(0);
  });

  it('keeps a point the same width on either side of the axis', () => {
    // Same scale means comparable bars: one point of Bob's deficit must be as
    // wide as one point of Caroline Cone's score.
    const width = 100;
    const negPxPerPoint = ((scale.axis / 100) * width) / scale.below;
    const posPxPerPoint = (((100 - scale.axis) / 100) * width) / scale.above;
    expect(negPxPerPoint).toBeCloseTo(posPxPerPoint, 6);
  });

  it('never exceeds its side of the axis', () => {
    for (const b of LEAGUE) {
      const bar = divergingBar(b, scale);
      expect(bar.negative).toBeLessThanOrEqual(100);
      expect(bar.positive).toBeLessThanOrEqual(100);
      expect(bar.ghost).toBeLessThanOrEqual(100);
    }
  });

  it('draws nothing for a player with no votes', () => {
    expect(divergingBar(make({}), scale)).toEqual({ negative: 0, positive: 0, ghost: 0 });
  });
});
