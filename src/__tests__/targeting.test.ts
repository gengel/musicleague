import { describe, expect, it } from 'vitest';
import { parseLeague } from '../lib/parse';
import { computeStats } from '../lib/stats';
import { buildDemoCsv } from '../lib/demo';
import {
  comparePraiseAndBlame,
  computePointsReceived,
  computeVoterFlows,
  findLopsidedPairs,
} from '../lib/targeting';

const stats = computeStats(parseLeague([{ name: 'demo.csv', text: buildDemoCsv() }]), {
  scoring: 'competitive',
  flooring: 'none',
});

describe('computeVoterFlows', () => {
  const flows = computeVoterFlows(stats);

  it('produces one flow per player who cast at least one vote', () => {
    const voters = stats.rounds.flatMap((r) => r.voters);
    const distinctVoters = new Set(voters);
    expect(flows.length).toBeLessThanOrEqual(distinctVoters.size);
    expect(flows.length).toBeGreaterThan(0);
  });

  it('sums each voter\'s top target shares to no more than their total spend', () => {
    for (const flow of flows) {
      const topUpSum = flow.topUpvoteTargets.reduce((a, t) => a + t.points, 0);
      expect(topUpSum).toBeLessThanOrEqual(flow.upvotesSpent);
    }
  });

  it('gives a concentration of 1 when a voter has exactly one upvote target', () => {
    const soleTarget = flows.find((f) => f.upvoteTargets === 1);
    if (soleTarget) expect(soleTarget.upvoteConcentration).toBeCloseTo(1, 5);
  });

  it('gives a concentration near 0 when points are spread over many targets', () => {
    const spread = flows.find((f) => f.upvoteTargets >= 5);
    if (spread) expect(spread.upvoteConcentration).toBeLessThan(1);
  });
});

describe('comparePraiseAndBlame', () => {
  it('only includes voters who gave both an upvote and a downvote to someone', () => {
    const flows = computeVoterFlows(stats);
    const comparisons = comparePraiseAndBlame(flows);
    for (const c of comparisons) {
      const flow = flows.find((f) => f.voterId === c.voterId)!;
      expect(flow.upvoteTargets).toBeGreaterThan(0);
      expect(flow.downvoteTargets).toBeGreaterThan(0);
    }
  });

  it('flags concentratesBlameMore correctly against the underlying numbers', () => {
    const flows = computeVoterFlows(stats);
    const comparisons = comparePraiseAndBlame(flows);
    for (const c of comparisons) {
      expect(c.concentratesBlameMore).toBe(c.downvoteConcentration > c.upvoteConcentration);
    }
  });
});

describe('computePointsReceived', () => {
  const received = computePointsReceived(stats);

  it('covers every player who submitted a song', () => {
    const submitters = stats.players.filter((p) => p.songs > 0);
    expect(received).toHaveLength(submitters.length);
  });

  it('reconciles each player\'s net against upvotes minus downvotes', () => {
    for (const r of received) expect(r.net).toBe(r.upvotes - r.downvotes);
  });

  it('sorts best net first', () => {
    for (let i = 1; i < received.length; i += 1) {
      expect(received[i - 1].net).toBeGreaterThanOrEqual(received[i].net);
    }
  });
});

describe('findLopsidedPairs', () => {
  it('reads the same edge only once, not once per direction', () => {
    const pairs = findLopsidedPairs(stats, 1);
    const keys = pairs.map((p) => [p.aId, p.bId].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('computes imbalance as the absolute difference between the two directions', () => {
    const pairs = findLopsidedPairs(stats, 1);
    for (const p of pairs) expect(p.imbalance).toBe(Math.abs(p.aToB - p.bToA));
  });

  it('excludes pairs below the minimum points threshold on both sides', () => {
    const pairs = findLopsidedPairs(stats, 1000);
    for (const p of pairs) expect(Math.max(p.aToB, p.bToA)).toBeGreaterThanOrEqual(1000);
  });

  it('sorts most one-sided first', () => {
    const pairs = findLopsidedPairs(stats, 1);
    for (let i = 1; i < pairs.length; i += 1) {
      expect(pairs[i - 1].imbalance).toBeGreaterThanOrEqual(pairs[i].imbalance);
    }
  });
});
