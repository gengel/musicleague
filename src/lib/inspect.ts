import { parseLeague, type NamedFile } from './parse';
import { computeStats } from './stats';

/**
 * A quick, dependency-light description of an export.
 *
 * Used by the bake script to validate CSVs before a static build, so a bad
 * or mismatched file fails at the command line rather than as an empty page
 * on whatever host it was published to.
 */
export interface LeagueSummary {
  leagueName: string;
  players: string[];
  rounds: string[];
  songs: number;
  voteRows: number;
  commentRows: number;
  hasVotes: boolean;
  roundsWithResults: number;
  /** True when the league still has rounds to come. */
  inProgress: boolean;
  totalRounds?: number;
  /** Players who submitted in a round but cast no votes, with the cost. */
  nonVoters: { name: string; rounds: number; forfeited: number }[];
  /** Scoring model used for the figures above. */
  scoring: 'competitive' | 'friendly';
  /** True when the model was matched against official standings. */
  scoringInferred: boolean;
  /** Whether song contributions were floored at zero. */
  flooring: 'song' | 'none';
  flooringInferred: boolean;
  /** Season totals under the chosen model, best first. */
  totals: { name: string; total: number; upvotes: number; downvotes: number; forfeited: number; absorbed: number }[];
  /** Round winners under that model, for eyeballing before publishing. */
  winners: { round: string; winner: string; points: number }[];
  warnings: string[];
  /** Problems that should stop a build. */
  errors: string[];
}

/**
 * Which tracks need artwork, and at what sizes.
 *
 * Sizes are requested per track rather than fetched uniformly, because the
 * 640px variant is roughly seventy times the weight of the 64px one. Every song
 * gets the 300px cover used in table rows; the handful shown large — the top
 * songs and each round's winner — also get the 640px one so they stay sharp.
 */
export function artworkTargets(
  files: NamedFile[],
  heroCount = 4,
): { id: string; sizes: ('sm' | 'lg' | 'xl')[] }[] {
  const stats = computeStats(parseLeague(files));
  const ranked = [...stats.songs].sort((a, b) => b.countedScore - a.countedScore);

  // Only the songs shown as full-width covers need the 640px variant. Round
  // winners appear at about 100px, where the 300px cover is already sharp on a
  // high-density screen, so they are deliberately left out of this set.
  const hero = new Set(
    ranked
      .slice(0, heroCount)
      .map((s) => s.spotifyId)
      .filter((id): id is string => Boolean(id)),
  );

  const seen = new Set<string>();
  const targets: { id: string; sizes: ('sm' | 'lg' | 'xl')[] }[] = [];
  for (const song of ranked) {
    const id = song.spotifyId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    targets.push({ id, sizes: hero.has(id) ? ['lg', 'xl'] : ['lg'] });
  }
  return targets;
}

/** Every distinct artist credited on a submission, for genre lookup. */
export function artistNames(files: NamedFile[]): string[] {
  const league = parseLeague(files);
  const names = new Set<string>();
  for (const submission of league.submissions) {
    for (const artist of submission.artist.split(/\s*,\s*/)) {
      const trimmed = artist.trim();
      if (trimmed) names.add(trimmed);
    }
  }
  return [...names].sort();
}

export function describeLeague(
  files: NamedFile[],
  scoring: 'competitive' | 'friendly' | 'auto' = 'auto',
  flooring: 'song' | 'none' | 'auto' = 'auto',
  totalRounds?: number,
): LeagueSummary {
  const league = parseLeague(files);
  const stats = computeStats(league, { scoring, flooring, totalRounds });
  const errors: string[] = [];

  if (!league.submissions.length) {
    errors.push(
      'No submissions found. This does not look like a Music League export — check you picked the Export Data CSV.',
    );
  }
  if (!league.players.length) {
    errors.push('No identifiable players found, so nothing can be attributed.');
  }

  const nameOf = new Map(stats.players.map((p) => [p.playerId, p.name]));
  const songByTrack = new Map(stats.songs.map((s) => [s.trackId, s]));

  return {
    leagueName: league.name,
    players: league.players.map((p) => p.name),
    rounds: league.rounds.map((r) => r.name),
    songs: league.submissions.length,
    voteRows: league.votes.length,
    commentRows: league.comments.length,
    hasVotes: stats.hasVotes,
    roundsWithResults: stats.roundsPlayed,
    inProgress: stats.inProgress,
    totalRounds: stats.totalRounds,
    nonVoters: stats.players
      .filter((p) => p.roundsMissedVoting > 0)
      .sort((a, b) => b.forfeitedUpvotes - a.forfeitedUpvotes)
      .map((p) => ({
        name: p.name,
        rounds: p.roundsMissedVoting,
        forfeited: p.forfeitedUpvotes,
      })),
    scoring: stats.scoring,
    scoringInferred: stats.scoringInferred,
    flooring: stats.flooring,
    flooringInferred: stats.flooringInferred,
    totals: [...stats.players]
      .filter((p) => p.songs > 0)
      .sort((a, b) => b.pointsCounted - a.pointsCounted)
      .map((p) => ({
        name: p.name,
        total: p.pointsCounted,
        upvotes: p.breakdown.upvotes,
        downvotes: p.breakdown.downvotes,
        forfeited: p.breakdown.forfeited,
        absorbed: p.breakdown.absorbed,
      })),
    winners: stats.rounds
      .filter((r) => r.winnerTrackId)
      .map((r) => {
        const song = songByTrack.get(r.winnerTrackId!);
        return {
          round: r.round.name,
          winner: song?.submitterId ? (nameOf.get(song.submitterId) ?? 'unknown') : 'anonymous',
          points: song?.effectiveNet ?? 0,
        };
      }),
    warnings: league.warnings,
    errors,
  };
}
