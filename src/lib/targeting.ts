import type { PairStats, Stats } from './stats';

/**
 * Where a voter's points actually go, and whether praise and blame are
 * aimed the same way.
 *
 * `PairStats` in stats.ts already carries the raw upvotes/downvotes for
 * every voter→target pair; everything here is a view over that, built for
 * "The Room" tab rather than duplicating the underlying computation.
 */

export interface TargetShare {
  targetId: string;
  targetName: string;
  points: number;
}

export interface VoterFlow {
  voterId: string;
  voterName: string;
  /** Total upvote points spent across the season. */
  upvotesSpent: number;
  /** Total downvote points spent across the season, as a positive number. */
  downvotesSpent: number;
  /** Distinct players this voter ever gave a positive point to. */
  upvoteTargets: number;
  /** Distinct players this voter ever gave a negative point to. */
  downvoteTargets: number;
  /** Upvote recipients ranked by points received, most first. */
  topUpvoteTargets: TargetShare[];
  /** Downvote recipients ranked by points given, most first. */
  topDownvoteTargets: TargetShare[];
  /** Herfindahl index of upvotes across targets. 1 = all on one player. */
  upvoteConcentration: number;
  /** Herfindahl index of downvotes across targets. */
  downvoteConcentration: number;
}

/** Herfindahl index over a list of magnitudes: sum((share)^2). 0 with no data. */
function herfindahl(values: number[]): number {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return values.reduce((acc, v) => acc + (v / total) ** 2, 0);
}

function topN(shares: TargetShare[], n = 3): TargetShare[] {
  return [...shares].sort((a, b) => b.points - a.points).slice(0, n);
}

/** Builds a `VoterFlow` for every player who has cast at least one vote. */
export function computeVoterFlows(stats: Stats): VoterFlow[] {
  const byVoter = new Map<string, PairStats[]>();
  for (const pair of stats.pairs) {
    const arr = byVoter.get(pair.voterId);
    if (arr) arr.push(pair);
    else byVoter.set(pair.voterId, [pair]);
  }

  const flows: VoterFlow[] = [];
  for (const [voterId, pairs] of byVoter) {
    const upPairs = pairs.filter((p) => p.upvotes > 0);
    const downPairs = pairs.filter((p) => p.downvotes > 0);
    if (!upPairs.length && !downPairs.length) continue;

    const upShares = upPairs.map((p) => ({
      targetId: p.targetId,
      targetName: p.targetName,
      points: p.upvotes,
    }));
    const downShares = downPairs.map((p) => ({
      targetId: p.targetId,
      targetName: p.targetName,
      points: p.downvotes,
    }));

    flows.push({
      voterId,
      voterName: pairs[0].voterName,
      upvotesSpent: upShares.reduce((a, s) => a + s.points, 0),
      downvotesSpent: downShares.reduce((a, s) => a + s.points, 0),
      upvoteTargets: upShares.length,
      downvoteTargets: downShares.length,
      topUpvoteTargets: topN(upShares),
      topDownvoteTargets: topN(downShares),
      upvoteConcentration: herfindahl(upShares.map((s) => s.points)),
      downvoteConcentration: herfindahl(downShares.map((s) => s.points)),
    });
  }

  return flows.sort((a, b) => b.upvotesSpent - a.upvotesSpent);
}

export interface PraiseVsBlame {
  voterId: string;
  voterName: string;
  upvoteConcentration: number;
  downvoteConcentration: number;
  /**
   * True when this voter concentrates blame more narrowly than praise — the
   * unusual pattern, since spreading praise wider than blame is the norm in
   * every league this app has been run against.
   */
  concentratesBlameMore: boolean;
}

/** Compares how narrowly each voter aims their praise vs. their blame. */
export function comparePraiseAndBlame(flows: VoterFlow[]): PraiseVsBlame[] {
  return flows
    .filter((f) => f.upvoteTargets > 0 && f.downvoteTargets > 0)
    .map((f) => ({
      voterId: f.voterId,
      voterName: f.voterName,
      upvoteConcentration: f.upvoteConcentration,
      downvoteConcentration: f.downvoteConcentration,
      concentratesBlameMore: f.downvoteConcentration > f.upvoteConcentration,
    }))
    .sort(
      (a, b) =>
        b.upvoteConcentration - b.downvoteConcentration - (a.upvoteConcentration - a.downvoteConcentration),
    );
}

export interface PointsReceived {
  playerId: string;
  name: string;
  upvotes: number;
  downvotes: number;
  net: number;
  /** Distinct players who ever gave this player a positive point. */
  distinctBackers: number;
}

/** Total points received per player, both directions, for "The Room" tables. */
export function computePointsReceived(stats: Stats): PointsReceived[] {
  const byTarget = new Map<string, PairStats[]>();
  for (const pair of stats.pairs) {
    const arr = byTarget.get(pair.targetId);
    if (arr) arr.push(pair);
    else byTarget.set(pair.targetId, [pair]);
  }

  return stats.players
    .filter((p) => p.songs > 0)
    .map((p) => {
      const pairs = byTarget.get(p.playerId) ?? [];
      const upvotes = pairs.reduce((a, pr) => a + pr.upvotes, 0);
      const downvotes = pairs.reduce((a, pr) => a + pr.downvotes, 0);
      return {
        playerId: p.playerId,
        name: p.name,
        upvotes,
        downvotes,
        net: upvotes - downvotes,
        distinctBackers: pairs.filter((pr) => pr.upvotes > 0).length,
      };
    })
    .sort((a, b) => b.net - a.net);
}

export interface LopsidedPair {
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  /** Points A gave B. */
  aToB: number;
  /** Points B gave A. */
  bToA: number;
  /** |aToB - bToA|, how one-sided the relationship is. */
  imbalance: number;
}

/**
 * The most one-sided relationships in the league: pairs where one side gave
 * heavily and got little or nothing back. Read from both directions, since
 * "Greggo adores t33nwitch" and "t33nwitch is cold to Greggo" are the same
 * edge, not two separate findings — see the superlative placement audit.
 */
export function findLopsidedPairs(stats: Stats, minPoints = 5): LopsidedPair[] {
  const byPair = new Map<string, PairStats>();
  for (const pair of stats.pairs) byPair.set(`${pair.voterId}->${pair.targetId}`, pair);

  const seen = new Set<string>();
  const results: LopsidedPair[] = [];
  for (const pair of stats.pairs) {
    const key = [pair.voterId, pair.targetId].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);

    const forward = byPair.get(`${pair.voterId}->${pair.targetId}`);
    const backward = byPair.get(`${pair.targetId}->${pair.voterId}`);
    const aToB = forward?.upvotes ?? 0;
    const bToA = backward?.upvotes ?? 0;
    if (Math.max(aToB, bToA) < minPoints) continue;

    results.push({
      aId: pair.voterId,
      aName: pair.voterName,
      bId: pair.targetId,
      bName: pair.targetName,
      aToB,
      bToA,
      imbalance: Math.abs(aToB - bToA),
    });
  }

  return results.sort((a, b) => b.imbalance - a.imbalance);
}
