import type { League, Round, Submission, Vote } from './types';

/**
 * How the league converts votes into points.
 *
 * In Competitive Mode a player who fails to vote in a round receives none of
 * the upvotes their own song earned that round, while still taking any
 * downvotes. That is not a display detail: it decides the round winner and
 * the standings, so it has to be modelled rather than annotated.
 *
 * The export does not carry league settings, so this cannot always be known.
 * 'auto' matches whichever model reproduces the official [standings] section
 * when the export has one, and otherwise assumes friendly scoring, which is
 * Music League's default.
 */
export type ScoringMode = 'competitive' | 'friendly';

/**
 * Whether a song's contribution can go below zero.
 *
 * Music League's own documentation says a song's score floors at zero, but
 * leagues differ and some show negative totals, so this is a setting rather
 * than an assumption. It affects season totals only: round ranking always
 * uses the raw score, so the winner does not depend on it.
 */
export type FloorMode = 'song' | 'none';

export interface StatsOptions {
  scoring?: ScoringMode | 'auto';
  flooring?: FloorMode | 'auto';
  /**
   * How many rounds the league will run in total, when known. The export only
   * contains rounds that exist, so a league mid-season cannot be recognised
   * from the file alone.
   */
  totalRounds?: number;
}

/**
 * Where a score came from, in terms that add up exactly:
 *
 *   total = upvotes − downvotes − forfeited + absorbed
 *
 * `absorbed` is the part of the downvotes that never landed, because a song's
 * score floors at zero rather than going negative. Without that term the
 * figures look like they do not reconcile, which is worse than not showing a
 * breakdown at all. With flooring off, `absorbed` is always zero.
 */
export interface ScoreBreakdown {
  /** Upvote points the songs received. */
  upvotes: number;
  /** Downvote points the songs received. */
  downvotes: number;
  /** Upvotes withheld because the submitter skipped voting. */
  forfeited: number;
  /** Downvotes discarded by the zero floor. */
  absorbed: number;
  /** What the league counted. May be negative when flooring is off. */
  total: number;
}

/**
 * Splits one song's votes into the parts that were counted and the parts
 * that were not.
 */
function breakDownSong(
  upvotes: number,
  downvotes: number,
  forfeited: boolean,
  floorAtZero: boolean,
): ScoreBreakdown {
  if (forfeited) {
    // No upvotes credited. The downvotes still apply unless the floor eats them.
    return {
      upvotes,
      downvotes,
      forfeited: upvotes,
      absorbed: floorAtZero ? downvotes : 0,
      total: floorAtZero ? 0 : -downvotes || 0,
    };
  }
  const net = upvotes - downvotes;
  if (net >= 0 || !floorAtZero) {
    return { upvotes, downvotes, forfeited: 0, absorbed: 0, total: net };
  }
  // Downvotes can only take a song to zero, never below it.
  return { upvotes, downvotes, forfeited: 0, absorbed: downvotes - upvotes, total: 0 };
}

function sumBreakdowns(parts: ScoreBreakdown[]): ScoreBreakdown {
  return parts.reduce<ScoreBreakdown>(
    (acc, p) => ({
      upvotes: acc.upvotes + p.upvotes,
      downvotes: acc.downvotes + p.downvotes,
      forfeited: acc.forfeited + p.forfeited,
      absorbed: acc.absorbed + p.absorbed,
      total: acc.total + p.total,
    }),
    { upvotes: 0, downvotes: 0, forfeited: 0, absorbed: 0, total: 0 },
  );
}

/* ------------------------------------------------------------------ *
 * Derived, round-aware views over the raw export.
 * ------------------------------------------------------------------ */

export interface SongStats {
  trackId: string;
  roundId: string;
  roundName: string;
  roundSequence: number;
  title: string;
  artist: string;
  /** Bare Spotify track id, for linking and embedding. */
  spotifyId?: string;
  submitterId?: string;
  /** Sum of positive points received. */
  upvotes: number;
  /** Sum of negative points received, as a positive magnitude. */
  downvotes: number;
  /** upvotes - downvotes, may be negative (Music League floors the display at 0). */
  net: number;
  /**
   * True when the submitter cast no votes that round, so Competitive Mode
   * withholds the upvotes this song earned.
   */
  forfeited: boolean;
  /**
   * The score the league actually counted: `net` under friendly scoring, or
   * downvotes alone when the song was forfeited under Competitive Mode.
   * Ranking and standings use this; `net` remains the room's raw verdict.
   */
  effectiveNet: number;
  /** The points this song contributed, after any zero floor. */
  countedScore: number;
  /** Where that score came from, reconciling exactly. */
  breakdown: ScoreBreakdown;
  /** Distinct voters who gave any non-zero points. */
  distinctVoters: number;
  /** Distinct voters who gave positive points. */
  distinctUpvoters: number;
  /** Voters who were able to vote on this song. */
  eligibleVoters: number;
  /** distinctUpvoters / eligibleVoters. High = broad appeal. */
  breadth: number;
  /** Largest single-voter contribution. */
  topVoterPoints: number;
  /** Herfindahl index of upvote concentration. 1 = one voter gave everything. */
  concentration: number;
  /** Population standard deviation of points across eligible voters. */
  spread: number;
  /** Rank within its round by net score (1 = winner). */
  roundRank: number;
  /** Share of all upvotes cast in the round. */
  shareOfRound: number;
  /** True when the song drew both upvotes and downvotes. */
  polarizing: boolean;
}

export interface RoundStats {
  round: Round;
  songCount: number;
  /** Players who cast at least one vote row. */
  voters: string[];
  /** Players who submitted at least one identified song. */
  submitters: string[];
  /**
   * Submitted but cast no votes. Empty when the round has no vote data at
   * all, since "nobody voted" there means "the export did not say".
   */
  nonVoters: string[];
  /** True when the round has vote rows to reason about. */
  hasVotes: boolean;
  totalUpvotes: number;
  totalDownvotes: number;
  /**
   * Highest positive points any single voter placed on a single song. This is
   * a lower bound on the configured per-song cap: if nobody maxed out, the
   * real cap was higher.
   */
  observedPerSongCap: number;
  /** Median upvote budget actually spent, used to infer the round's budget. */
  typicalBudget: number;
  winnerTrackId?: string;
}

export interface PlayerStats {
  playerId: string;
  name: string;
  roundsSubmitted: number;
  roundsVoted: number;
  songs: number;
  /**
   * Net points received across all songs, keeping negatives. Useful for
   * "how did the room actually feel", but not the league score.
   */
  pointsReceived: number;
  /**
   * The season score the league counted: each song's contribution, floored at
   * zero if the league floors, then summed. This is the number to show and
   * rank by. It can be negative when flooring is off.
   */
  pointsCounted: number;
  /**
   * How that season score is made up. `breakdown.total` equals
   * `pointsCounted`, and the parts reconcile exactly.
   */
  breakdown: ScoreBreakdown;
  upvotesReceived: number;
  downvotesReceived: number;
  upvotesGiven: number;
  downvotesGiven: number;
  /**
   * Average points per song, using the floored contributions so that this
   * column times the song count reconciles with the season total. A raw mean
   * could read negative beside a positive total, which looks like a bug.
   */
  avgPerSong: number;
  /** Average share of the round's upvotes their songs took. */
  avgShareOfRound: number;
  /** Average round finishing rank. */
  avgRoundRank: number;
  wins: number;
  lastPlaces: number;
  bestSong?: SongStats;
  worstSong?: SongStats;
  /** Distinct players who ever gave them a positive vote. */
  distinctSupporters: number;
  /** Mean breadth of their songs — how widely their points come in. */
  avgBreadth: number;
  /** Mean upvote concentration of their songs. */
  avgConcentration: number;
  /** Average number of distinct songs they spread points over, per round. */
  avgSongsVotedPer: number;
  /** Average points placed per song they backed. */
  avgPointsPerVote: number;
  /** Share of their upvotes spent at the round's observed per-song cap. */
  maxStackRate: number;
  /** Rounds they submitted in but did not vote, of rounds that have results. */
  roundsMissedVoting: number;
  /**
   * Upvotes their songs earned in rounds where they failed to vote.
   * In Competitive Mode these are forfeited — Music League has no
   * separate point penalty, so this is the real cost of not voting.
   */
  forfeitedUpvotes: number;
  /**
   * 0..1. Weighted average percentile of the songs they backed, ranked by
   * everyone else's opinion. High = mainstream taste, low = contrarian.
   * Undefined when they cast no comparable votes, so that "no data" is not
   * mistaken for "maximally contrarian".
   */
  tasteAlignment?: number;
  /**
   * Comments they wrote, wherever the export put them: a dedicated comments
   * section, a note on their own submission, or a remark attached to a vote.
   * The classic export has no comments file at all — it hangs them off the
   * submission and vote rows.
   */
  comments: number;
}

export interface PairStats {
  voterId: string;
  voterName: string;
  targetId: string;
  targetName: string;
  /** Positive points voter gave to target's songs. */
  upvotes: number;
  /** Negative points given, as a positive magnitude. */
  downvotes: number;
  net: number;
  /** Rounds where voter voted and target had a votable song. */
  opportunities: number;
  /** Target songs the voter could have voted on. */
  songsAvailable: number;
  /** Target songs the voter actually gave positive points to. */
  songsBacked: number;
  /**
   * Points the voter would be expected to give if they spread their
   * budget evenly across everything available to them.
   */
  expected: number;
  /** upvotes / expected. 1.0 = neutral, >1 = favouritism, 0 = shut out. */
  affinity: number;
  /**
   * The same idea as affinity but on net points, so downvotes count against a
   * voter's warmth instead of being invisible. Negative means they took more
   * away than they gave. Anything describing how a voter *feels* about a player
   * must use this: on upvotes alone, someone who gave 1 point and 6 downvotes
   * outranks someone who gave 1 point and nothing else.
   */
  netAffinity: number;
  /**
   * The most the voter could have given this player: their budget, or the
   * per-song cap times the songs available, whichever binds.
   */
  maxPossible: number;
  /**
   * upvotes / maxPossible, so 1.0 means they gave this player everything
   * the rules allowed, every time. Unlike affinity this has a fixed ceiling
   * and is therefore safe to compare across voters with different ballots.
   */
  devotion: number;
}

export interface StandingPoint {
  roundSequence: number;
  roundName: string;
  /** Points earned this round (net, floored at 0 as Music League displays). */
  points: number;
  cumulative: number;
  rank: number;
}

/**
 * One entry on a superlative card, split into parts rather than a single prose
 * string: a headline figure, what it refers to, and short supporting chips.
 * Cramming all three into one sentence made the cards unreadable.
 */
export interface SuperlativeEntry {
  /** The headline figure, e.g. "−13 pts" or "Ada → Bo". */
  value: string;
  /** What the figure refers to: a song title, a player, a running total. */
  subject?: string;
  /** Short supporting facts, rendered as a dot-separated line. */
  meta?: string[];
}

export interface Superlative extends SuperlativeEntry {
  label: string;
  /** Ranked runners-up, best first. */
  runnersUp?: SuperlativeEntry[];
}

export interface Stats {
  league: League;
  /** The scoring model these figures were computed under. */
  scoring: ScoringMode;
  /** True when the model was inferred from the official standings. */
  scoringInferred: boolean;
  /** Whether song contributions were floored at zero. */
  flooring: FloorMode;
  /** True when flooring was inferred from the official standings. */
  flooringInferred: boolean;
  /** Rounds that have produced results. */
  roundsPlayed: number;
  /** Rounds the league will run in total, when that is known. */
  totalRounds?: number;
  /**
   * True when the league still has rounds to come, so every standing is a
   * running total rather than a result.
   */
  inProgress: boolean;
  songs: SongStats[];
  rounds: RoundStats[];
  players: PlayerStats[];
  pairs: PairStats[];
  /** playerId -> timeline of cumulative score. */
  timelines: Map<string, StandingPoint[]>;
  superlatives: Superlative[];
  artistCounts: { artist: string; count: number; submitters: string[] }[];
  hasVotes: boolean;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]): number => (xs.length ? sum(xs) / xs.length : 0);

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

function bump<K>(map: Map<K, number>, key: K, by: number): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

/* ------------------------------------------------------------------ *
 * Main computation
 * ------------------------------------------------------------------ */

export function computeStats(league: League, options: StatsOptions = {}): Stats {
  const nameOf = new Map(league.players.map((p) => [p.id, p.name]));
  const roundById = new Map(league.rounds.map((r) => [r.id, r]));

  const subsByRound = new Map<string, Submission[]>();
  for (const s of league.submissions) pushTo(subsByRound, s.roundId, s);

  const votesByRound = new Map<string, Vote[]>();
  for (const v of league.votes) pushTo(votesByRound, v.roundId, v);

  const votesByTrack = new Map<string, Vote[]>();
  for (const v of league.votes) pushTo(votesByTrack, v.trackId, v);

  const submissionByTrack = new Map(league.submissions.map((s) => [s.trackId, s]));

  /* ---------------- round-level ---------------- */

  const roundStats: RoundStats[] = [];
  for (const round of league.rounds) {
    const subs = subsByRound.get(round.id) ?? [];
    const votes = votesByRound.get(round.id) ?? [];
    const voters = [...new Set(votes.map((v) => v.voterId))];
    const submitters = [...new Set(subs.map((s) => s.submitterId).filter(Boolean) as string[])];
    const positives = votes.filter((v) => v.points > 0);

    const spendByVoter = new Map<string, number>();
    for (const v of positives) bump(spendByVoter, v.voterId, v.points);

    roundStats.push({
      round,
      songCount: subs.length,
      voters,
      submitters,
      // Without vote rows there is no evidence anybody skipped voting.
      nonVoters: votes.length ? submitters.filter((s) => !voters.includes(s)) : [],
      hasVotes: votes.length > 0,
      totalUpvotes: sum(positives.map((v) => v.points)),
      totalDownvotes: sum(votes.filter((v) => v.points < 0).map((v) => -v.points)),
      observedPerSongCap: positives.length ? Math.max(...positives.map((v) => v.points)) : 0,
      typicalBudget: median([...spendByVoter.values()]),
    });
  }
  const roundStatsById = new Map(roundStats.map((r) => [r.round.id, r]));

  /* ---------------- scoring model ----------------
   *
   * Which songs lose their upvotes has to be settled before anything is
   * ranked. Where the export carries official standings, both models are
   * tried and the one that reproduces them wins; otherwise friendly scoring
   * is assumed, matching Music League's default.
   */

  const isForfeited = (sub: Submission): boolean => {
    if (!sub.submitterId) return false;
    const rs = roundStatsById.get(sub.roundId);
    if (!rs?.hasVotes) return false;
    return rs.nonVoters.includes(sub.submitterId);
  };

  const rawTotals = league.submissions.map((sub) => {
    const votes = votesByTrack.get(sub.trackId) ?? [];
    const up = sum(votes.filter((v) => v.points > 0).map((v) => v.points));
    const down = sum(votes.filter((v) => v.points < 0).map((v) => -v.points));
    return { sub, up, down, forfeited: isForfeited(sub) };
  });

  const scoreUnder = (
    mode: ScoringMode,
    floorAtZero: boolean,
    entry: (typeof rawTotals)[number],
  ): number =>
    breakDownSong(entry.up, entry.down, mode === 'competitive' && entry.forfeited, floorAtZero)
      .total;

  /** Season totals as the league would show them, per player. */
  const totalsUnder = (mode: ScoringMode, floorAtZero: boolean): Map<string, number> => {
    const totals = new Map<string, number>();
    for (const entry of rawTotals) {
      if (!entry.sub.submitterId) continue;
      bump(totals, entry.sub.submitterId, scoreUnder(mode, floorAtZero, entry));
    }
    return totals;
  };

  const wantScoring = options.scoring ?? 'auto';
  const wantFlooring = options.flooring ?? 'auto';

  let scoring: ScoringMode = wantScoring === 'auto' ? 'friendly' : wantScoring;
  let flooring: FloorMode = wantFlooring === 'auto' ? 'song' : wantFlooring;
  let scoringInferred = false;
  let flooringInferred = false;

  // With official standings to compare against, try every combination the
  // caller left open and keep the one that reproduces them.
  if ((wantScoring === 'auto' || wantFlooring === 'auto') && league.standings.length) {
    const official = new Map(league.standings.map((s) => [s.playerId, s.points]));
    const candidateScorings: ScoringMode[] =
      wantScoring === 'auto' ? ['competitive', 'friendly'] : [wantScoring];
    const candidateFloorings: FloorMode[] =
      wantFlooring === 'auto' ? ['song', 'none'] : [wantFlooring];

    let best: { scoring: ScoringMode; flooring: FloorMode; error: number } | undefined;
    for (const s of candidateScorings) {
      for (const f of candidateFloorings) {
        const totals = totalsUnder(s, f === 'song');
        let error = 0;
        for (const [playerId, points] of official) {
          error += Math.abs((totals.get(playerId) ?? 0) - points);
        }
        if (!best || error < best.error) best = { scoring: s, flooring: f, error };
      }
    }

    if (best) {
      // Only claim an inference when the models actually disagree.
      const ambiguous = candidateScorings.every((s) =>
        candidateFloorings.every((f) => {
          const totals = totalsUnder(s, f === 'song');
          let error = 0;
          for (const [playerId, points] of official) {
            error += Math.abs((totals.get(playerId) ?? 0) - points);
          }
          return error === best!.error;
        }),
      );
      if (!ambiguous) {
        if (wantScoring === 'auto') {
          scoring = best.scoring;
          scoringInferred = true;
        }
        if (wantFlooring === 'auto') {
          flooring = best.flooring;
          flooringInferred = true;
        }
      }
    }
  }

  const forfeitedApplies = scoring === 'competitive';
  const floorAtZero = flooring === 'song';

  /* ---------------- song-level ---------------- */

  const songs: SongStats[] = league.submissions.map((sub) => {
    const rs = roundStatsById.get(sub.roundId);
    const round = roundById.get(sub.roundId);
    const votes = votesByTrack.get(sub.trackId) ?? [];
    const ups = votes.filter((v) => v.points > 0);
    const downs = votes.filter((v) => v.points < 0);
    const upPoints = sum(ups.map((v) => v.points));
    const downPoints = sum(downs.map((v) => -v.points));
    const forfeited = isForfeited(sub);

    // A voter is eligible for this song if they voted in the round and
    // did not submit it themselves.
    const eligible = (rs?.voters ?? []).filter((v) => v !== sub.submitterId);
    const perVoter = eligible.map(
      (voterId) => sum(votes.filter((v) => v.voterId === voterId).map((v) => v.points)),
    );

    const concentration = upPoints > 0 ? sum(ups.map((v) => (v.points / upPoints) ** 2)) : 0;
    const breakdown = breakDownSong(
      upPoints,
      downPoints,
      forfeitedApplies && forfeited,
      floorAtZero,
    );

    return {
      trackId: sub.trackId,
      roundId: sub.roundId,
      roundName: round?.name ?? sub.roundId,
      roundSequence: round?.sequence ?? 0,
      title: sub.title,
      artist: sub.artist,
      spotifyId: sub.spotifyId,
      submitterId: sub.submitterId,
      upvotes: upPoints,
      downvotes: downPoints,
      net: upPoints - downPoints,
      forfeited,
      // A forfeited song keeps its downvotes and loses its upvotes. Guard
      // against negative zero, which is ugly if it ever reaches the page.
      effectiveNet:
        forfeitedApplies && forfeited
          ? downPoints === 0
            ? 0
            : -downPoints
          : upPoints - downPoints,
      countedScore: breakdown.total,
      breakdown,
      distinctVoters: new Set(votes.filter((v) => v.points !== 0).map((v) => v.voterId)).size,
      distinctUpvoters: new Set(ups.map((v) => v.voterId)).size,
      eligibleVoters: eligible.length,
      breadth: eligible.length ? new Set(ups.map((v) => v.voterId)).size / eligible.length : 0,
      topVoterPoints: ups.length ? Math.max(...ups.map((v) => v.points)) : 0,
      concentration,
      spread: stdev(perVoter),
      roundRank: 0, // filled below, and left at 0 for unvoted rounds
      shareOfRound: rs && rs.totalUpvotes > 0 ? upPoints / rs.totalUpvotes : 0,
      polarizing: ups.length > 0 && downs.length > 0,
    };
  });

  // Rank songs within each round, and record round winners. Rounds with no
  // vote data get no ranking at all: sorting equal zeroes would crown whoever
  // happens to sort first alphabetically.
  const songsByRound = new Map<string, SongStats[]>();
  for (const s of songs) pushTo(songsByRound, s.roundId, s);
  for (const [roundId, list] of songsByRound) {
    const rs = roundStatsById.get(roundId);
    // Ranked on the score the league counted, so a forfeited song cannot be
    // crowned winner on upvotes it never received.
    list.sort((a, b) => b.effectiveNet - a.effectiveNet || a.title.localeCompare(b.title));
    if (!rs?.hasVotes) continue;
    list.forEach((s, i) => {
      s.roundRank = i + 1;
    });
    if (list.length) rs.winnerTrackId = list[0].trackId;
  }

  const songByTrack = new Map(songs.map((s) => [s.trackId, s]));

  /* ---------------- pair-level (who votes for whom) ----------------
   *
   * Raw point totals reward whoever simply shared the most rounds with
   * you, so every pair also carries an expected value: what the voter
   * would have given if they had spread their budget evenly over every
   * song on their ballot. affinity = actual / expected.
   */

  interface PairAcc {
    upvotes: number;
    downvotes: number;
    opportunities: number;
    songsAvailable: number;
    songsBacked: number;
    expected: number;
    maxPossible: number;
  }
  const pairAcc = new Map<string, PairAcc>();
  const pairKey = (a: string, b: string) => `${a}\u0000${b}`;
  const accFor = (a: string, b: string): PairAcc => {
    const k = pairKey(a, b);
    let acc = pairAcc.get(k);
    if (!acc) {
      acc = {
        upvotes: 0,
        downvotes: 0,
        opportunities: 0,
        songsAvailable: 0,
        songsBacked: 0,
        expected: 0,
        maxPossible: 0,
      };
      pairAcc.set(k, acc);
    }
    return acc;
  };

  for (const rs of roundStats) {
    const allSubs = subsByRound.get(rs.round.id) ?? [];
    const subs = allSubs.filter((s) => s.submitterId);
    const votes = votesByRound.get(rs.round.id) ?? [];

    for (const voterId of rs.voters) {
      const ballot = subs.filter((s) => s.submitterId !== voterId);
      if (!ballot.length) continue;
      const myVotes = votes.filter((v) => v.voterId === voterId);
      // Only points spent on attributable songs count towards the budget being
      // apportioned. Including points spent on anonymous songs would inflate
      // every identified player's expectation and deflate their affinity.
      const ballotTracks = new Set(ballot.map((s) => s.trackId));
      const budget = sum(
        myVotes.filter((v) => v.points > 0 && ballotTracks.has(v.trackId)).map((v) => v.points),
      );

      const owners = new Set(ballot.map((s) => s.submitterId as string));
      for (const ownerId of owners) {
        const theirSongs = ballot.filter((s) => s.submitterId === ownerId);
        const acc = accFor(voterId, ownerId);
        acc.opportunities += 1;
        acc.songsAvailable += theirSongs.length;
        // Even-spread expectation, proportional to how much of the
        // ballot this owner occupies.
        acc.expected += budget * (theirSongs.length / ballot.length);
        // The ceiling: whichever binds first, the budget or the per-song cap
        // across however many songs this owner had in the round.
        acc.maxPossible += rs.observedPerSongCap
          ? Math.min(budget, rs.observedPerSongCap * theirSongs.length)
          : budget;

        for (const song of theirSongs) {
          const given = myVotes.filter((v) => v.trackId === song.trackId);
          const up = sum(given.filter((v) => v.points > 0).map((v) => v.points));
          const down = sum(given.filter((v) => v.points < 0).map((v) => -v.points));
          acc.upvotes += up;
          acc.downvotes += down;
          if (up > 0) acc.songsBacked += 1;
        }
      }
    }
  }

  const pairs: PairStats[] = [...pairAcc.entries()].map(([key, acc]) => {
    const [voterId, targetId] = key.split('\u0000');
    return {
      voterId,
      voterName: nameOf.get(voterId) ?? voterId,
      targetId,
      targetName: nameOf.get(targetId) ?? targetId,
      upvotes: acc.upvotes,
      downvotes: acc.downvotes,
      net: acc.upvotes - acc.downvotes,
      opportunities: acc.opportunities,
      songsAvailable: acc.songsAvailable,
      songsBacked: acc.songsBacked,
      expected: acc.expected,
      affinity: acc.expected > 0 ? acc.upvotes / acc.expected : 0,
      netAffinity: acc.expected > 0 ? (acc.upvotes - acc.downvotes) / acc.expected : 0,
      maxPossible: acc.maxPossible,
      devotion: acc.maxPossible > 0 ? acc.upvotes / acc.maxPossible : 0,
    };
  });

  /* ---------------- player-level ---------------- */

  const players: PlayerStats[] = league.players.map((player) => {
    const mySongs = songs.filter((s) => s.submitterId === player.id);
    const myVotes = league.votes.filter((v) => v.voterId === player.id);
    const roundsVotedIn = new Set(myVotes.map((v) => v.roundId));
    const roundsSubmittedIn = new Set(mySongs.map((s) => s.roundId));

    // Only rounds that actually have vote data can evidence a skipped vote.
    // Where the league hides its breakdown, nobody is charged a forfeit.
    const missed = [...roundsSubmittedIn].filter(
      (r) => roundStatsById.get(r)?.hasVotes && !roundsVotedIn.has(r),
    );
    const forfeited = sum(
      mySongs.filter((s) => missed.includes(s.roundId)).map((s) => s.upvotes),
    );

    // Voting behaviour, measured per round so players with different
    // round counts stay comparable.
    const perRoundBacked: number[] = [];
    let cappedPoints = 0;
    let totalUpGiven = 0;
    for (const roundId of roundsVotedIn) {
      const rv = myVotes.filter((v) => v.roundId === roundId && v.points > 0);
      perRoundBacked.push(rv.length);
      const cap = roundStatsById.get(roundId)?.observedPerSongCap ?? 0;
      for (const v of rv) {
        totalUpGiven += v.points;
        if (cap > 0 && v.points >= cap) cappedPoints += v.points;
      }
    }

    // Taste alignment: for each round, rank songs by everyone else's net
    // score, then take the voter's points-weighted average percentile.
    // Tied songs share the mid-point of the positions they span, otherwise
    // an arbitrary sort order would decide who looks contrarian.
    let alignNum = 0;
    let alignDen = 0;
    for (const roundId of roundsVotedIn) {
      const ballot = (songsByRound.get(roundId) ?? []).filter(
        (s) => s.submitterId !== player.id,
      );
      if (ballot.length < 2) continue;
      const othersNet = ballot.map((s) => {
        const mine = sum(
          (votesByTrack.get(s.trackId) ?? [])
            .filter((v) => v.voterId === player.id)
            .map((v) => v.points),
        );
        return { trackId: s.trackId, score: s.net - mine };
      });
      const ordered = [...othersNet].sort((a, b) => a.score - b.score);
      const percentile = new Map<string, number>();
      for (let i = 0; i < ordered.length; ) {
        let j = i;
        while (j + 1 < ordered.length && ordered[j + 1].score === ordered[i].score) j += 1;
        const shared = (i + j) / 2 / (ordered.length - 1);
        for (let k = i; k <= j; k += 1) percentile.set(ordered[k].trackId, shared);
        i = j + 1;
      }
      for (const v of myVotes.filter((x) => x.roundId === roundId && x.points > 0)) {
        const p = percentile.get(v.trackId);
        if (p === undefined) continue;
        alignNum += p * v.points;
        alignDen += v.points;
      }
    }

    const supporters = new Set<string>();
    for (const s of mySongs) {
      for (const v of votesByTrack.get(s.trackId) ?? []) {
        if (v.points > 0) supporters.add(v.voterId);
      }
    }

    const netReceived = sum(mySongs.map((s) => s.net));
    const breakdown = sumBreakdowns(mySongs.map((s) => s.breakdown));
    // Rounds with results, for rank-based averages.
    const rankedSongs = mySongs.filter((s) => s.roundRank > 0);

    return {
      playerId: player.id,
      name: player.name,
      roundsSubmitted: roundsSubmittedIn.size,
      roundsVoted: roundsVotedIn.size,
      songs: mySongs.length,
      pointsReceived: netReceived,
      pointsCounted: breakdown.total,
      breakdown,
      upvotesReceived: sum(mySongs.map((s) => s.upvotes)),
      downvotesReceived: sum(mySongs.map((s) => s.downvotes)),
      upvotesGiven: totalUpGiven,
      downvotesGiven: sum(myVotes.filter((v) => v.points < 0).map((v) => -v.points)),
      avgPerSong: mySongs.length ? breakdown.total / mySongs.length : 0,
      avgShareOfRound: mean(mySongs.map((s) => s.shareOfRound)),
      avgRoundRank: mean(rankedSongs.map((s) => s.roundRank)),
      wins: rankedSongs.filter((s) => s.roundRank === 1).length,
      lastPlaces: rankedSongs.filter(
        (s) => s.roundRank === (songsByRound.get(s.roundId)?.length ?? 0) && s.roundRank > 1,
      ).length,
      bestSong: [...mySongs].sort((a, b) => b.effectiveNet - a.effectiveNet)[0],
      worstSong: [...mySongs].sort((a, b) => a.effectiveNet - b.effectiveNet)[0],
      distinctSupporters: supporters.size,
      avgBreadth: mean(mySongs.map((s) => s.breadth)),
      avgConcentration: mean(mySongs.filter((s) => s.upvotes > 0).map((s) => s.concentration)),
      avgSongsVotedPer: mean(perRoundBacked),
      avgPointsPerVote: mean(myVotes.filter((v) => v.points > 0).map((v) => v.points)),
      maxStackRate: totalUpGiven > 0 ? cappedPoints / totalUpGiven : 0,
      roundsMissedVoting: missed.length,
      forfeitedUpvotes: forfeited,
      tasteAlignment: alignDen > 0 ? alignNum / alignDen : undefined,
      comments:
        league.comments.filter((c) => c.authorId === player.id).length +
        league.submissions.filter((s) => s.submitterId === player.id && s.comment?.trim()).length +
        myVotes.filter((v) => v.comment?.trim()).length,
    };
  });

  /* ---------------- timelines ---------------- */

  const orderedRounds = [...league.rounds].sort((a, b) => a.sequence - b.sequence);
  const timelines = new Map<string, StandingPoint[]>();
  const running = new Map<string, number>();

  for (const round of orderedRounds) {
    const roundSongs = songsByRound.get(round.id) ?? [];
    // Only rounds with results move the standings.
    if (!roundSongs.length || !roundStatsById.get(round.id)?.hasVotes) continue;

    // Each song contributes what the league counted, which respects both the
    // forfeit rule and whether scores may go below zero.
    const earned = new Map<string, number>();
    for (const p of league.players) earned.set(p.id, 0);
    for (const s of roundSongs) {
      if (!s.submitterId) continue;
      bump(earned, s.submitterId, s.countedScore);
    }
    for (const [playerId, pts] of earned) bump(running, playerId, pts);

    const ranked = [...running.entries()].sort((a, b) => b[1] - a[1]);
    const rankOf = new Map<string, number>();
    ranked.forEach(([playerId, pts], i) => {
      // Ties share the best rank.
      const prev = ranked[i - 1];
      rankOf.set(playerId, prev && prev[1] === pts ? rankOf.get(prev[0])! : i + 1);
    });

    for (const p of league.players) {
      pushTo(timelines, p.id, {
        roundSequence: round.sequence,
        roundName: round.name,
        points: earned.get(p.id) ?? 0,
        cumulative: running.get(p.id) ?? 0,
        rank: rankOf.get(p.id) ?? 0,
      });
    }
  }

  /* ---------------- artists ---------------- */

  const artistMap = new Map<string, { count: number; submitters: Set<string> }>();
  for (const s of league.submissions) {
    if (!s.artist) continue;
    for (const artist of s.artist.split(/\s*,\s*/).filter(Boolean)) {
      let entry = artistMap.get(artist);
      if (!entry) {
        entry = { count: 0, submitters: new Set() };
        artistMap.set(artist, entry);
      }
      entry.count += 1;
      if (s.submitterId) entry.submitters.add(nameOf.get(s.submitterId) ?? s.submitterId);
    }
  }
  const artistCounts = [...artistMap.entries()]
    .map(([artist, v]) => ({ artist, count: v.count, submitters: [...v.submitters] }))
    .sort((a, b) => b.count - a.count || a.artist.localeCompare(b.artist));

  const hasVotes = league.votes.length > 0;

  /* ---------------- progress ----------------
   *
   * A league mid-season cannot be spotted from the file alone: the export only
   * holds rounds that exist. Two signals are used — a caller-supplied total,
   * and rounds that are present but have produced no result yet.
   */
  const roundsPlayed = roundStats.filter((r) => r.hasVotes).length;
  const roundsPending = roundStats.filter((r) => !r.hasVotes && !r.round.skipped).length;
  const totalRounds = options.totalRounds;
  const inProgress = totalRounds
    ? roundsPlayed < totalRounds
    : hasVotes && roundsPending > 0;

  return {
    league,
    scoring,
    scoringInferred,
    flooring,
    flooringInferred,
    roundsPlayed,
    totalRounds,
    inProgress,
    songs,
    rounds: roundStats,
    players,
    pairs,
    timelines,
    superlatives: buildSuperlatives({
      songs,
      players,
      pairs,
      nameOf,
      songByTrack,
      submissionByTrack,
      scoring,
    }),
    artistCounts,
    hasVotes,
  };
}

/* ------------------------------------------------------------------ *
 * Superlatives — the headline "who did what most" answers.
 * ------------------------------------------------------------------ */

const fmt = (n: number, digits = 1): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(digits);

const pct = (n: number): string => `${(n * 100).toFixed(0)}%`;

const ordinal = (n: number): string => {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
};

/**
 * How balanced a pair must be to count as mutual: the quieter side has to have
 * given at least this share of what the louder side gave.
 */
const BALANCE = 0.5;

function buildSuperlatives(ctx: {
  songs: SongStats[];
  players: PlayerStats[];
  pairs: PairStats[];
  nameOf: Map<string, string>;
  songByTrack: Map<string, SongStats>;
  submissionByTrack: Map<string, Submission>;
  scoring: ScoringMode;
}): Superlative[] {
  const { songs, players, pairs, nameOf } = ctx;
  const out: Superlative[] = [];

  const songTitle = (s: SongStats): string => s.title || 'Untitled';
  const submitterOf = (s: SongStats): string =>
    s.submitterId ? (nameOf.get(s.submitterId) ?? 'unknown') : 'anonymous';
  /** Artist, submitter and round as separate chips, plus anything extra. */
  const songMeta = (s: SongStats, ...extra: string[]): string[] =>
    [s.artist, submitterOf(s), s.roundName, ...extra].filter(Boolean);

  /**
   * Ranks by score descending, then by an optional tiebreak. Affinity has a
   * hard ceiling (a voter can only place the per-song cap), so ties at the top
   * are common — the tiebreak decides them on sustained volume rather than
   * letting someone who voted in two rounds outrank a season-long devotee.
   */
  // One winner and two runners-up: a longer tail stops being a headline.
  const top = <T,>(items: T[], score: (x: T) => number, tiebreak?: (x: T) => number, keep = 3): T[] =>
    [...items]
      .sort((a, b) => score(b) - score(a) || (tiebreak ? tiebreak(b) - tiebreak(a) : 0))
      .slice(0, keep);

  const add = <T,>(
    label: string,
    items: T[],
    score: (x: T) => number,
    render: (x: T) => SuperlativeEntry,
    tiebreak?: (x: T) => number,
  ): void => {
    const ranked = top(items, score, tiebreak).filter((x) => Number.isFinite(score(x)));
    if (!ranked.length) return;
    const [first, ...rest] = ranked.map(render);
    out.push({ label, ...first, runnersUp: rest });
  };

  // --- Single-song records ---
  add(
    'Biggest single haul',
    songs,
    (s) => s.effectiveNet,
    (s) => ({
      value: `${fmt(s.effectiveNet)} pts`,
      subject: songTitle(s),
      meta: songMeta(s),
    }),
  );

  const forfeitedSongs =
    ctx.scoring === 'competitive' ? songs.filter((s) => s.forfeited && s.upvotes > 0) : [];
  add(
    'Biggest haul never counted',
    forfeitedSongs,
    (s) => s.upvotes,
    (s) => ({
      value: `${fmt(s.upvotes)} pts forfeited`,
      subject: songTitle(s),
      meta: songMeta(s, 'earned it, then lost it by not voting'),
    }),
  );

  add(
    'Widest appeal',
    songs.filter((s) => s.eligibleVoters >= 3),
    (s) => s.breadth,
    (s) => ({
      value: `${pct(s.breadth)} of voters`,
      subject: songTitle(s),
      meta: songMeta(s, `${s.distinctUpvoters} of ${s.eligibleVoters} voters chipped in`),
    }),
  );

  add(
    'Most divisive',
    songs.filter((s) => s.eligibleVoters >= 3 && s.upvotes > 0),
    (s) => s.spread,
    (s) => ({
      value: `±${fmt(s.spread)} pts`,
      subject: songTitle(s),
      meta: songMeta(s, 'the room could not agree'),
    }),
  );

  add(
    'Narrowest win',
    // A single 1-point vote is trivially 100% concentrated; require a real haul
    // so this describes a narrow win rather than an empty one.
    songs.filter((s) => s.upvotes >= 4 && s.distinctUpvoters > 0),
    (s) => s.concentration,
    (s) => ({
      value: `${pct(s.concentration)} concentrated`,
      subject: songTitle(s),
      meta: songMeta(
        s,
        `${fmt(s.upvotes)} pt${s.upvotes === 1 ? '' : 's'} from ${s.distinctUpvoters} voter${s.distinctUpvoters === 1 ? '' : 's'}`,
      ),
    }),
  );

  add(
    'Most one-sided single vote',
    songs,
    (s) => s.topVoterPoints,
    (s) => ({
      value: `${fmt(s.topVoterPoints)} pts from one voter`,
      subject: songTitle(s),
      meta: songMeta(s),
    }),
  );

  const downvoted = songs.filter((s) => s.downvotes > 0);
  add(
    'Most downvoted',
    downvoted,
    (s) => s.downvotes,
    (s) => ({
      value: `−${fmt(s.downvotes)} pts`,
      subject: songTitle(s),
      meta: songMeta(s),
    }),
  );

  // --- Voting relationships ---
  const meaningful = pairs.filter((p) => p.opportunities >= 2);

  add(
    'Biggest superfan',
    meaningful,
    (p) => p.devotion,
    (p) => ({
      value: `${p.voterName} → ${p.targetName}`,
      subject: `${fmt(p.upvotes)} pts given`,
      meta: [
        `${pct(p.devotion)} of what the rules allowed`,
        `over ${p.opportunities} rounds`,
        `${fmt(p.affinity, 2)}× an even spread`,
      ],
    }),
    (p) => p.upvotes,
  );

  add(
    'Most points given (raw)',
    pairs,
    (p) => p.upvotes,
    (p) => ({
      value: `${p.voterName} → ${p.targetName}`,
      subject: `${fmt(p.upvotes)} pts given`,
      meta: [`across ${p.opportunities} shared rounds`],
    }),
  );

  const coldest = meaningful.filter((p) => p.songsAvailable >= 3);
  add(
    'Coldest shoulder',
    coldest,
    (p) => -p.devotion,
    (p) => ({
      value: `${p.voterName} → ${p.targetName}`,
      subject:
        p.upvotes === 0
          ? 'never once voted for them'
          : `${fmt(p.upvotes)} pts of a possible ${fmt(p.maxPossible)}`,
      meta: [`${p.songsAvailable} chances`, `across ${p.opportunities} rounds`],
    }),
    // Among equally cold pairs, the one who passed more often is colder.
    (p) => p.songsAvailable,
  );

  // Mutual admiration and one-way streets.
  const pairIndex = new Map(pairs.map((p) => [`${p.voterId}\u0000${p.targetId}`, p]));
  const seen = new Set<string>();
  const mutual: {
    a: PairStats;
    b: PairStats;
    total: number;
    gap: number;
    /** Points given by whichever side gave less, and by whichever gave more. */
    weaker: number;
    stronger: number;
  }[] = [];
  for (const p of pairs) {
    const key = [p.voterId, p.targetId].sort().join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    const reverse = pairIndex.get(`${p.targetId}\u0000${p.voterId}`);
    if (!reverse) continue;
    mutual.push({
      a: p,
      b: reverse,
      total: p.upvotes + reverse.upvotes,
      gap: Math.abs(p.upvotes - reverse.upvotes),
      weaker: Math.min(p.upvotes, reverse.upvotes),
      stronger: Math.max(p.upvotes, reverse.upvotes),
    });
  }

  add(
    'Mutual admiration society',
    // Mutuality is about the weaker direction. Ranking on the combined total
    // would crown a pair where one player gave 15 and got 1 back, which is the
    // definition of unrequited, not mutual — so lopsided pairs are excluded
    // and the ranking uses whichever side gave less.
    mutual.filter(
      (m) =>
        m.a.opportunities >= 2 &&
        m.b.opportunities >= 2 &&
        m.weaker > 0 &&
        m.weaker >= m.stronger * BALANCE,
    ),
    (m) => Math.min(m.a.devotion, m.b.devotion),
    (m) => ({
      value: `${m.a.voterName} ↔ ${m.a.targetName}`,
      subject: `${fmt(m.total)} pts traded`,
      meta: [
        `${fmt(m.a.upvotes)} / ${fmt(m.b.upvotes)}, near enough even`,
        `each spending ${pct(Math.min(m.a.devotion, m.b.devotion))} of what they could`,
      ],
    }),
    (m) => m.total,
  );

  add(
    'Most unrequited',
    mutual.filter((m) => m.a.opportunities >= 2 && m.total > 0),
    (m) => m.gap,
    (m) => {
      const [giver, taker] = m.a.upvotes >= m.b.upvotes ? [m.a, m.b] : [m.b, m.a];
      return {
        value: `${giver.voterName} → ${giver.targetName}`,
        subject: `gave ${fmt(giver.upvotes)}, got back ${fmt(taker.upvotes)}`,
        meta: [`across ${giver.opportunities} shared rounds`],
      };
    },
  );

  const nemeses = pairs.filter((p) => p.downvotes > 0);
  add(
    'Arch-nemesis',
    nemeses,
    (p) => p.downvotes,
    (p) => ({
      value: `${p.voterName} → ${p.targetName}`,
      subject: `${fmt(p.downvotes)} downvote pts spent`,
      meta: [`across ${p.opportunities} rounds`],
    }),
  );

  // --- Participation ---
  add(
    'Most forfeited by not voting',
    players.filter((p) => p.forfeitedUpvotes > 0),
    (p) => p.forfeitedUpvotes,
    (p) => ({
      value: `−${fmt(p.forfeitedUpvotes)} pts`,
      subject: p.name,
      meta: [
        `${p.roundsMissedVoting} round${p.roundsMissedVoting === 1 ? '' : 's'} without voting`,
        ctx.scoring === 'competitive' ? 'earned but never credited' : 'would count under Competitive Mode',
      ],
    }),
  );

  add(
    'Most rounds skipped voting',
    players.filter((p) => p.roundsMissedVoting > 0),
    (p) => p.roundsMissedVoting,
    (p) => ({
      value: `${p.roundsMissedVoting} round${p.roundsMissedVoting === 1 ? '' : 's'}`,
      subject: p.name,
      meta: [`submitted but did not vote, of ${p.roundsSubmitted} entered`],
    }),
  );

  // --- Voter personality ---
  const voters = players.filter((p) => p.roundsVoted >= 2);
  const rated = voters.filter(
    (p): p is PlayerStats & { tasteAlignment: number } => p.tasteAlignment !== undefined,
  );

  add(
    'Most generous spread',
    voters,
    (p) => p.avgSongsVotedPer,
    (p) => ({
      value: `${fmt(p.avgSongsVotedPer)} songs a round`,
      subject: p.name,
      meta: [`${fmt(p.avgPointsPerVote)} pts per song on average`],
    }),
  );

  add(
    'Biggest stacker',
    voters,
    (p) => p.maxStackRate,
    (p) => ({
      value: `${pct(p.maxStackRate)} at the cap`,
      subject: p.name,
      meta: [`backs only ${fmt(p.avgSongsVotedPer)} songs a round`],
    }),
  );

  add(
    'Most mainstream taste',
    rated,
    (p) => p.tasteAlignment,
    (p) => ({
      value: `${pct(p.tasteAlignment)} with the room`,
      subject: p.name,
      meta: [
        `their picks averaged the ${ordinal(Math.round(p.tasteAlignment * 100))} percentile elsewhere`,
        '50% is average',
      ],
    }),
  );

  add(
    'Biggest contrarian',
    rated,
    (p) => 1 - p.tasteAlignment,
    // Shown as the inverse so the leader of this card has the larger number,
    // rather than winning with the smallest one and looking like a mistake.
    (p) => ({
      value: `${pct(1 - p.tasteAlignment)} against the room`,
      subject: p.name,
      // No superlative claim here: the same chips render for the runners-up.
      meta: [
        `their picks averaged the ${ordinal(Math.round(p.tasteAlignment * 100))} percentile elsewhere`,
        '50% is average',
      ],
    }),
  );

  // --- Submitter performance ---
  const submitters = players.filter((p) => p.songs >= 2);

  add(
    'Best average song',
    submitters,
    (p) => p.avgPerSong,
    (p) => ({
      value: `${fmt(p.avgPerSong)} pts a song`,
      subject: p.name,
      meta: [`${p.songs} songs`, `${p.wins} round win${p.wins === 1 ? '' : 's'}`],
    }),
  );

  add(
    'Broadest support base',
    submitters,
    (p) => p.avgBreadth,
    (p) => ({
      value: `${pct(p.avgBreadth)} of voters`,
      subject: p.name,
      meta: [`${p.distinctSupporters} distinct supporters all told`],
    }),
  );

  add(
    'Most polarizing act',
    submitters,
    (p) => p.avgConcentration,
    (p) => ({
      value: `${pct(p.avgConcentration)} concentrated`,
      subject: p.name,
      meta: ['points come from a clique, not the whole room'],
    }),
  );

  add(
    'Chattiest',
    players.filter((p) => p.comments > 0),
    (p) => p.comments,
    (p) => ({
      value: `${p.comments} comment${p.comments === 1 ? '' : 's'}`,
      subject: p.name,
    }),
  );

  return out;
}
