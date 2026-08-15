import { describe, expect, it } from 'vitest';
import { parseLeague } from '../lib/parse';
import { computeStats } from '../lib/stats';
import { buildDemoCsv } from '../lib/demo';
import {
  collectBallotShapes,
  projectStandings,
  seededRng,
  simulateRound,
} from '../lib/projection';

const demoStats = computeStats(parseLeague([{ name: 'demo.csv', text: buildDemoCsv() }]), {
  scoring: 'competitive',
  flooring: 'none',
});

describe('collectBallotShapes', () => {
  it('collects one shape per voter per round, using only real cast points', () => {
    const shapes = collectBallotShapes(demoStats);
    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) {
      for (const v of shape.ups) expect(v).toBeGreaterThan(0);
      for (const v of shape.downs) expect(v).toBeGreaterThan(0); // stored as a positive magnitude
    }
  });
});

describe('simulateRound (I3 — a simulated round must preserve the real vote budget)', () => {
  it('pays out exactly the sum of the ballots it drew, never inventing points', () => {
    const shapes = [
      { ups: [3, 2, 2, 1], downs: [3, 2, 1] },
      { ups: [8], downs: [6] },
    ];
    const rng = seededRng(1);
    const voterCount = 20;
    const net = simulateRound(6, voterCount, shapes, rng);

    // Reconstruct exactly which shapes were drawn, using a fresh rng seeded
    // the same way, so the expected total can be checked independently of
    // simulateRound's own bookkeeping.
    const verify = seededRng(1);
    let expectedUp = 0;
    let expectedDown = 0;
    for (let i = 0; i < voterCount; i += 1) {
      const shape = shapes[Math.floor(verify() * shapes.length)];
      for (const pts of shape.ups) {
        verify(); // consumes the placement roll, matching simulateRound's draw order
        expectedUp += pts;
      }
      for (const pts of shape.downs) {
        verify();
        expectedDown += pts;
      }
    }
    // Net per song mixes up and down, so check the grand total (up - down)
    // instead of trying to separate them back out per song.
    expect(sum(net)).toBe(expectedUp - expectedDown);
  });

  it('never distributes points to a song index outside the round', () => {
    const shapes = [{ ups: [5, 3], downs: [4] }];
    const net = simulateRound(4, 30, shapes, seededRng(7));
    expect(net).toHaveLength(4);
  });

  it('returns an all-zero round when there is nothing to draw from', () => {
    expect(simulateRound(4, 10, [], seededRng(1))).toEqual([0, 0, 0, 0]);
  });

  it('draws only from real historical ballots, so the resampled budget always matches one that was actually cast', () => {
    // Every shape here has the same fixed 8-up/6-down budget, mirroring this
    // league's real invariant. No matter how a simulated round distributes
    // them across songs, the total in and total out cannot exceed 8 or 6
    // per voter — because each voter's whole ballot is copied, not resampled
    // point by point.
    const shapes = [{ ups: [3, 3, 2], downs: [3, 3] }];
    const voterCount = 15;
    const net = simulateRound(5, voterCount, shapes, seededRng(3));
    const total = sum(net);
    const maxPossibleNet = voterCount * (8 - 6);
    expect(total).toBeLessThanOrEqual(voterCount * 8);
    expect(total).toBe(maxPossibleNet); // every voter here casts the identical shape
  });
});

describe('projectStandings', () => {
  it('produces a win share for every active player, summing to 1 across the field', () => {
    const result = projectStandings(demoStats, { roundsLeft: 2, runs: 200, rng: seededRng(5) });
    expect(result.insufficientData).toBe(false);
    const total = sum(result.shares.map((s) => s.winShare));
    expect(total).toBeCloseTo(1, 5);
  });

  it('is deterministic for the same seed', () => {
    const a = projectStandings(demoStats, { roundsLeft: 2, runs: 100, rng: seededRng(99) });
    const b = projectStandings(demoStats, { roundsLeft: 2, runs: 100, rng: seededRng(99) });
    expect(a.shares).toEqual(b.shares);
  });

  it('gives the actual leader a materially higher win share than the actual last place', () => {
    const result = projectStandings(demoStats, { roundsLeft: 3, runs: 500, rng: seededRng(11) });
    const byPoints = [...result.shares].sort((a, b) => b.currentPoints - a.currentPoints);
    const leader = byPoints[0];
    const last = byPoints[byPoints.length - 1];
    expect(leader.winShare).toBeGreaterThan(last.winShare);
  });

  it('reports insufficientData rather than fabricating a projection with no vote history', () => {
    const noVotesLeague = parseLeague([
      {
        name: 'x.csv',
        text: `[submissions]\nRound,Submitter,Song Title,Artist\nR1,Ada,Song,Artist\n`,
      },
    ]);
    const stats = computeStats(noVotesLeague);
    const result = projectStandings(stats);
    expect(result.insufficientData).toBe(true);
    expect(result.shares.every((s) => s.winShare === 0)).toBe(true);
  });

  it('does nothing destructive with zero rounds left', () => {
    const result = projectStandings(demoStats, { roundsLeft: 0 });
    expect(result.insufficientData).toBe(true);
  });
});

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
