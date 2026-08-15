import type { RoundStats, SongStats, Stats } from './stats';

/**
 * Per-round Play-by-Play chapters: a credited winner, the twist when the
 * best raw song was forfeited, and a couple of statistically unusual
 * moments — the material Phase 4's UI turns into templated prose.
 *
 * This module only selects and ranks facts. It writes no sentences: prose
 * generation belongs to the UI layer (Phase 4), kept separate so the
 * dashboard never depends on an LLM at bake time and the underlying
 * selection logic can be tested without parsing generated English.
 *
 * The one hard-won rule this module exists to enforce (I2): a round's
 * winner is whichever song the league actually credited — `effectiveNet`,
 * after any forfeit — never the highest raw score. `stats.ts` already ranks
 * songs this way (`roundRank`), so a chapter's winner is always the
 * `roundRank === 1` song, and the highest-raw-score song is reported
 * separately, as the twist, only when it differs.
 */

export interface RoundTwist {
  /** The song with the highest raw score in the round. */
  song: SongStats;
  /** True when this song was NOT the credited winner — the interesting case. */
  wasForfeited: boolean;
}

export interface RoundChapter {
  round: RoundStats;
  /** The song the league actually credited as the winner (roundRank === 1). */
  winner?: SongStats;
  /** The raw-highest-scoring song, when it differs from the winner. */
  twist?: RoundTwist;
  /** Statistically unusual moments in this round, ranked, best first. */
  moments: Moment[];
}

export interface Moment {
  kind: string;
  subject: string; // playerId this moment is mainly about
  song?: SongStats;
  /** How many standard deviations from the season's mean for this metric. */
  zScore: number;
  headline: string;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function zScore(value: number, all: number[]): number {
  const sd = stdev(all);
  if (sd === 0) return 0;
  return (value - mean(all)) / sd;
}

/**
 * Builds the winner/twist pair for one round.
 *
 * `winner` is undefined for a round with no vote data (I6). `twist` is only
 * populated when the raw-highest song differs from the credited winner —
 * this is the exact bug class from the round-6 wireframe error this app was
 * built to avoid: naming the best song as though it were the winner.
 */
export function buildRoundWinner(
  round: RoundStats,
  songsInRound: SongStats[],
): { winner?: SongStats; twist?: RoundTwist } {
  if (!round.hasVotes || !songsInRound.length) return {};
  const winner = songsInRound.find((s) => s.roundRank === 1);
  const rawTop = [...songsInRound].sort(
    (a, b) => b.net - a.net || a.title.localeCompare(b.title),
  )[0];
  if (!winner || !rawTop) return { winner };
  if (rawTop.trackId === winner.trackId) return { winner };
  return { winner, twist: { song: rawTop, wasForfeited: rawTop.forfeited } };
}

/**
 * Season-wide per-song and per-round metrics, so a single round's number can
 * be judged against the season's actual spread rather than an arbitrary cutoff.
 */
interface SeasonBaselines {
  songNets: number[];
  songUpvotes: number[];
  roundTotals: number[];
  roundTurnouts: number[];
}

function computeBaselines(stats: Stats): SeasonBaselines {
  return {
    songNets: stats.songs.map((s) => s.net),
    songUpvotes: stats.songs.map((s) => s.upvotes),
    roundTotals: stats.rounds.filter((r) => r.hasVotes).map((r) => r.totalUpvotes),
    roundTurnouts: stats.rounds.filter((r) => r.hasVotes).map((r) => r.voters.length),
  };
}

/**
 * Candidate moments for one round, each carrying a z-score against the
 * season so chapters can pick the two or three most statistically unusual
 * ones rather than the same kind of observation every round.
 *
 * No moments are generated for either of the league's first two rounds:
 * a z-score computed against a season of one or two data points is noise
 * dressed up as insight, so the chapters simply say less early on.
 */
export function findRoundMoments(
  round: RoundStats,
  songsInRound: SongStats[],
  baselines: SeasonBaselines,
): Moment[] {
  if (round.round.sequence <= 2 || !round.hasVotes) return [];
  const moments: Moment[] = [];

  for (const song of songsInRound) {
    if (!song.submitterId) continue;
    const netZ = zScore(song.net, baselines.songNets);
    if (Math.abs(netZ) >= 1.5) {
      moments.push({
        kind: netZ > 0 ? 'unusually-loved' : 'unusually-panned',
        subject: song.submitterId,
        song,
        zScore: netZ,
        headline:
          netZ > 0
            ? `"${song.title}" scored far above a typical song this season.`
            : `"${song.title}" scored far below a typical song this season.`,
      });
    }

    const upZ = zScore(song.upvotes, baselines.songUpvotes);
    if (upZ >= 2 && song.forfeited) {
      moments.push({
        kind: 'forfeited-standout',
        subject: song.submitterId,
        song,
        zScore: upZ,
        headline: `"${song.title}" drew an exceptional ${song.upvotes} upvotes and counted for none of it.`,
      });
    }
  }

  const turnoutZ = zScore(round.voters.length, baselines.roundTurnouts);
  if (Math.abs(turnoutZ) >= 1.5) {
    moments.push({
      kind: turnoutZ > 0 ? 'high-turnout' : 'low-turnout',
      subject: '__round__',
      zScore: turnoutZ,
      headline:
        turnoutZ > 0
          ? `${round.voters.length} voters turned out, more than usual.`
          : `Only ${round.voters.length} voters turned out, fewer than usual.`,
    });
  }

  return moments.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

/**
 * Builds a chapter per round with vote data, applying a season-wide subject
 * diversity rule: once a player has anchored two moments across the whole
 * Play-by-Play, later rounds skip further moments about them so one person
 * cannot dominate the recap. Mirrors the same rule `facts.ts` already uses
 * for the Overview tab's headline cards.
 */
export function buildPlayByPlay(stats: Stats): RoundChapter[] {
  const baselines = computeBaselines(stats);
  const usedSubjects = new Map<string, number>();
  const chapters: RoundChapter[] = [];

  const roundsInOrder = [...stats.rounds].sort((a, b) => a.round.sequence - b.round.sequence);

  for (const round of roundsInOrder) {
    const songsInRound = stats.songs.filter((s) => s.roundId === round.round.id);
    const { winner, twist } = buildRoundWinner(round, songsInRound);
    const candidates = findRoundMoments(round, songsInRound, baselines);

    const moments: Moment[] = [];
    for (const candidate of candidates) {
      if (moments.length >= 3) break;
      const seen = usedSubjects.get(candidate.subject) ?? 0;
      if (candidate.subject !== '__round__' && seen >= 2) continue;
      moments.push(candidate);
      usedSubjects.set(candidate.subject, seen + 1);
    }

    chapters.push({ round, winner, twist, moments });
  }

  return chapters;
}
