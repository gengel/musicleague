import type { Stats } from './stats';

/**
 * Projects the standings forward by resampling whole historical ballots,
 * rather than bounding what a round could theoretically produce.
 *
 * `future.ts`'s ceiling ("every other voter maxes out one song") is a useful
 * upper bound but a bad forecast: it assumes voting behaviour this league has
 * never shown. This module instead asks what happens if future rounds look
 * like the rounds that already happened — same voters, same habit of how they
 * split their points, landing on different songs by chance.
 *
 * The one assumption that matters, stated once and stated everywhere this is
 * shown: **voters keep the same appetite for spreading vs. concentrating
 * their points that they have shown so far, just aimed at different songs.**
 * This is a real assumption, not a neutral default, and the output is a
 * distribution over outcomes, not a single number — a resampling projection,
 * not a claim of precision.
 */

/** One voter's actual point distribution in one round, order discarded. */
interface BallotShape {
  /** Positive point values cast, e.g. [3, 2, 2, 1]. */
  ups: number[];
  /** Downvote magnitudes cast, as positive numbers, e.g. [3, 2, 1]. */
  downs: number[];
}

/**
 * Every ballot shape this league has actually cast, across every round with
 * vote data. The pool a simulated round draws from — see I3: because each
 * entry is copied whole rather than resampled point-by-point, a simulated
 * round can only ever redistribute a real historical budget, never invent a
 * bigger or smaller one.
 */
export function collectBallotShapes(stats: Stats): BallotShape[] {
  const shapes: BallotShape[] = [];
  for (const round of stats.rounds) {
    if (!round.hasVotes) continue;
    for (const voterId of round.voters) {
      const mine = stats.league.votes.filter(
        (v) => v.roundId === round.round.id && v.voterId === voterId,
      );
      const ups = mine.filter((v) => v.points > 0).map((v) => v.points);
      const downs = mine.filter((v) => v.points < 0).map((v) => -v.points);
      if (ups.length || downs.length) shapes.push({ ups, downs });
    }
  }
  return shapes;
}

/** Mutable, seedable PRNG so a simulation run can be reproduced in a test. */
export type Rng = () => number;

/** A tiny deterministic PRNG (mulberry32), for reproducible simulations. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Simulates one round: `voterCount` voters, each drawing a random historical
 * ballot shape and spending it by throwing every point value at a uniformly
 * random song among `songCount` candidates.
 *
 * Returns each song's simulated net score. The total points paid out equals
 * the sum of the drawn ballots exactly — nothing is invented — which is what
 * makes this a resampling of real behaviour rather than a new distribution.
 */
export function simulateRound(
  songCount: number,
  voterCount: number,
  shapes: BallotShape[],
  rng: Rng,
): number[] {
  const net = new Array(songCount).fill(0);
  if (!songCount || !shapes.length) return net;
  for (let v = 0; v < voterCount; v += 1) {
    const shape = pick(shapes, rng);
    for (const pts of shape.ups) net[Math.floor(rng() * songCount)] += pts;
    for (const pts of shape.downs) net[Math.floor(rng() * songCount)] -= pts;
  }
  return net;
}

export interface WinShare {
  playerId: string;
  name: string;
  /** Fraction of simulation runs in which this player finished first. */
  winShare: number;
  /** Season points at the time of projection. */
  currentPoints: number;
}

export interface ResampleProjection {
  /** How many future rounds were simulated per run. */
  roundsSimulated: number;
  /** How many independent simulation runs were averaged. */
  runs: number;
  shares: WinShare[];
  /** True when there was not enough vote history to simulate from (I6). */
  insufficientData: boolean;
}

/**
 * Projects final standings by simulating the remaining rounds many times,
 * each time drawing ballots from this league's own history (I3), and
 * reporting the share of runs each player wins outright.
 *
 * A song count per simulated round is needed; the median songs-per-round
 * this league has actually seen is used, since that is the least arbitrary
 * choice available from the export alone.
 */
export function projectStandings(
  stats: Stats,
  opts: { roundsLeft?: number; runs?: number; rng?: Rng } = {},
): ResampleProjection {
  const { roundsLeft = 1, runs = 500, rng = seededRng(42) } = opts;
  const shapes = collectBallotShapes(stats);
  const players = stats.players.filter((p) => p.songs > 0);

  if (!shapes.length || players.length < 2 || roundsLeft <= 0) {
    return {
      roundsSimulated: roundsLeft,
      runs: 0,
      shares: players.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        winShare: 0,
        currentPoints: p.pointsCounted,
      })),
      insufficientData: true,
    };
  }

  const playedRounds = stats.rounds.filter((r) => r.hasVotes);
  const songsPerRound = median(playedRounds.map((r) => r.songCount)) || players.length;
  const votersPerRound = median(playedRounds.map((r) => r.voters.length)) || players.length;

  const wins = new Map(players.map((p) => [p.playerId, 0]));

  for (let run = 0; run < runs; run += 1) {
    const totals = new Map(players.map((p) => [p.playerId, p.pointsCounted]));
    for (let round = 0; round < roundsLeft; round += 1) {
      // Each simulated round: every player who has been submitting gets one
      // song in it, drawn against the league's real songs-per-round and
      // voters-per-round so the simulated round is the right size.
      const net = simulateRound(
        Math.max(players.length, Math.round(songsPerRound)),
        Math.round(votersPerRound),
        shapes,
        rng,
      );
      players.forEach((p, i) => {
        totals.set(p.playerId, (totals.get(p.playerId) ?? 0) + (net[i] ?? 0));
      });
    }
    let winnerId = players[0].playerId;
    let winnerScore = -Infinity;
    for (const [id, score] of totals) {
      if (score > winnerScore) {
        winnerScore = score;
        winnerId = id;
      }
    }
    wins.set(winnerId, (wins.get(winnerId) ?? 0) + 1);
  }

  const shares: WinShare[] = players
    .map((p) => ({
      playerId: p.playerId,
      name: p.name,
      winShare: (wins.get(p.playerId) ?? 0) / runs,
      currentPoints: p.pointsCounted,
    }))
    .sort((a, b) => b.winShare - a.winShare || b.currentPoints - a.currentPoints);

  return { roundsSimulated: roundsLeft, runs, shares, insufficientData: false };
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
