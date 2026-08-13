import type { Stats } from './stats';
import type { GenreReport } from './genres';

/**
 * The handful of things worth saying out loud about a league.
 *
 * Each candidate is derived from a pattern rather than written by hand, so the
 * copy stays true if the export changes, and only fires when the league
 * actually contains the situation. Candidates carry an `interest` score and
 * the best few are shown.
 */
export interface Fact {
  /** Short label, e.g. "The cost of silence". */
  label: string;
  /**
   * Who the fact is mainly about, so the selection can spread across the
   * league rather than telling four stories about one player.
   */
  subject: string;
  /** One-line headline, the punchy part. */
  headline: string;
  /** Supporting sentence with the numbers behind it. */
  detail: string;
  /**
   * Spotify track id when the fact is about one song, so the card can show
   * its cover instead of a generic icon.
   */
  artId?: string;
  /** Higher is more worth saying. Used to pick the top few. */
  interest: number;
}

const pct = (n: number): string => `${Math.round(n * 100)}%`;
const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;
/** Lists names without running on: three, then a count. */
const listNames = (names: string[]): string => {
  if (names.length <= 2) return names.join(' and ');
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} others`;
};

const ordinal = (n: number): string => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
};

export function headlineFacts(
  stats: Stats,
  limit = 4,
  genres?: GenreReport,
): Fact[] {
  const facts: Fact[] = [];
  // Nothing is settled until the last round, so the copy hedges accordingly.
  const live = stats.inProgress;
  const soFar = live ? ' so far' : '';
  const played = `${stats.roundsPlayed} round${stats.roundsPlayed === 1 ? '' : 's'}`;
  const ranked = [...stats.players]
    .filter((p) => p.songs > 0)
    .sort((a, b) => b.pointsCounted - a.pointsCounted);
  if (!ranked.length || !stats.hasVotes) return [];

  const rankOf = new Map(ranked.map((p, i) => [p.playerId, i + 1]));
  const upvotes = ranked.reduce((a, p) => a + p.breakdown.upvotes, 0);
  const downvotes = ranked.reduce((a, p) => a + p.breakdown.downvotes, 0);
  const forfeited = ranked.reduce((a, p) => a + p.breakdown.forfeited, 0);
  // Only positive scores are meaningfully "surviving" points. Summing signed
  // totals would let a negative score cancel someone else's positive one, and
  // produce a league total smaller than the leader's own score.
  const stillStanding = ranked.reduce((a, p) => a + Math.max(0, p.pointsCounted), 0);
  const belowZero = ranked.filter((p) => p.pointsCounted < 0).length;

  /* ---- 1. How little of the goodwill survived ---- */
  if (upvotes > 0 && downvotes > 0 && stillStanding < upvotes * 0.75) {
    facts.push({
      label: 'Mutually assured destruction',
      subject: '__league__',
      headline: `The room has handed out ${upvotes} points and spent ${downvotes} more taking them back.`,
      detail: [
        `Only ${stillStanding} points have survived as positive scores`,
        forfeited > 0 ? `, another ${forfeited} were forfeited by players who did not vote` : '',
        belowZero > 0
          ? `, and ${belowZero} of the ${ranked.length} players ${
              live ? 'are currently' : 'finished'
            } below zero.`
          : '.',
      ].join(''),
      interest: 60 + (1 - stillStanding / upvotes) * 40,
    });
  }

  /* ---- 2. A champion who beat the whole room ---- */
  const [leader, ...rest] = ranked;
  if (leader && rest.length >= 3) {
    const restTotal = rest.reduce((a, p) => a + p.pointsCounted, 0);
    if (leader.pointsCounted > restTotal && leader.pointsCounted > 0) {
      facts.push({
        label: live ? 'Runaway leader' : 'Runaway winner',
        subject: leader.playerId,
        headline: `${leader.name} has scored more than the other ${rest.length} players put together.`,
        detail: `${leader.pointsCounted} against their combined ${restTotal}, off ${leader.breakdown.upvotes} upvotes and only ${leader.breakdown.downvotes} against.`,
        interest: 58 + (leader.pointsCounted - restTotal) / 4,
      });
    }
  }

  /* ---- 2. What not voting actually cost somebody ---- */
  const silent = [...ranked]
    .filter((p) => p.forfeitedUpvotes > 0)
    .sort((a, b) => b.forfeitedUpvotes - a.forfeitedUpvotes)[0];
  if (silent && stats.scoring === 'competitive') {
    // Where they would have placed had those points counted.
    const wouldBe = silent.pointsCounted + silent.forfeitedUpvotes;
    const betterThan = ranked.filter(
      (p) => p.playerId !== silent.playerId && p.pointsCounted < wouldBe,
    ).length;
    const wouldRank = ranked.length - betterThan;
    const actualRank = rankOf.get(silent.playerId)!;
    const never = silent.roundsVoted === 0;
    const gained = actualRank - wouldRank;
    facts.push({
      label: 'The cost of silence',
      subject: silent.playerId,
      headline: never
        ? `${silent.name} has not cast a single vote in ${played}.`
        : `${silent.name} skipped voting in ${plural(silent.roundsMissedVoting, 'round')}.`,
      detail:
        gained > 0
          ? `Their songs have earned ${silent.forfeitedUpvotes} points that were forfeited. With them they would sit ${ordinal(wouldRank)} on ${wouldBe} rather than ${ordinal(actualRank)} on ${silent.pointsCounted}.`
          : `Their songs have earned ${silent.forfeitedUpvotes} points that never counted, leaving them ${ordinal(actualRank)} on ${silent.pointsCounted}.`,
      interest: 55 + silent.forfeitedUpvotes + gained * 6,
    });
  }

  /* ---- 3. A player the room refused to reward ---- */
  const shutOut = [...stats.pairs]
    .filter((p) => p.upvotes === 0 && p.songsAvailable >= 3)
    .sort((a, b) => b.songsAvailable - a.songsAvailable || b.downvotes - a.downvotes);
  if (shutOut.length) {
    const worst = shutOut[0];
    // A voter who shut out more than one person is a better story.
    const byVoter = new Map<string, typeof shutOut>();
    for (const pair of shutOut) {
      const list = byVoter.get(pair.voterId) ?? [];
      list.push(pair);
      byVoter.set(pair.voterId, list);
    }
    const serial = [...byVoter.values()]
      .filter((list) => list.length > 1)
      .sort((a, b) => b.length - a.length)[0];

    if (serial) {
      const names = serial.map((p) => p.targetName);
      const spite = serial.reduce((a, p) => a + p.downvotes, 0);
      facts.push({
        label: 'Held a grudge',
        subject: serial[0].voterId,
        headline: live
          ? `${serial[0].voterName} has yet to give ${listNames(names)} a single point.`
          : `${serial[0].voterName} never gave ${listNames(names)} a single point.`,
        detail: `${serial.length} players frozen out across every chance to vote for them${
          spite > 0 ? `, plus ${spite} downvote points spent on them for good measure` : ''
        }.`,
        interest: 50 + serial.length * 8 + spite,
      });
    } else {
      facts.push({
        label: 'Frozen out',
        subject: worst.voterId,
        headline: live
          ? `${worst.voterName} has yet to give ${worst.targetName} a single point.`
          : `${worst.voterName} never gave ${worst.targetName} a single point.`,
        detail: `${plural(worst.songsAvailable, 'chance')} across ${plural(worst.opportunities, 'shared round')}${
          worst.downvotes > 0 ? `, and ${worst.downvotes} downvote points on top` : ''
        }.`,
        interest: 40 + worst.songsAvailable * 3,
      });
    }
  }

  /* ---- 4. The most lopsided loyalty ---- */
  const superfan = [...stats.pairs]
    .filter((p) => p.opportunities >= 3 && p.upvotes > 0)
    .sort((a, b) => b.devotion - a.devotion || b.affinity - a.affinity)[0];
  if (superfan && superfan.affinity >= 1.8) {
    facts.push({
      label: 'Ride or die',
      subject: superfan.voterId,
      headline: `${superfan.voterName} gave ${superfan.targetName} ${pct(superfan.devotion)} of every point the rules allowed.`,
      detail: `${superfan.upvotes} of a possible ${superfan.maxPossible} points across ${plural(superfan.opportunities, 'round')} — ${superfan.affinity.toFixed(1)}× what an even spread of their ballot would predict.`,
      interest: 45 + superfan.affinity * 5,
    });
  }

  /* ---- 5. The most punished song ---- */
  const punished = [...stats.songs]
    .filter((s) => s.downvotes > 0)
    .sort((a, b) => b.downvotes - a.downvotes || a.countedScore - b.countedScore)[0];
  if (punished && punished.downvotes >= 5) {
    const nameOf = new Map(stats.players.map((p) => [p.playerId, p.name]));
    facts.push({
      label: 'Most hated song',
      subject: punished.submitterId ?? '__unknown__',
      artId: punished.spotifyId,
      headline: `"${punished.title}" took ${punished.downvotes} downvote points.`,
      detail: `${
        punished.submitterId ? nameOf.get(punished.submitterId) : 'Somebody'
      } submitted it to ${punished.roundName}; it drew ${punished.upvotes} in upvotes and ended on ${punished.countedScore}.`,
      interest: 35 + punished.downvotes,
    });
  }

  /* ---- 6. Best song so far ---- */
  const best = [...stats.songs].sort((a, b) => b.countedScore - a.countedScore)[0];
  if (best && best.countedScore > 0) {
    const nameOf = new Map(stats.players.map((p) => [p.playerId, p.name]));
    facts.push({
      label: live ? `Best song of the first ${played}` : 'Song of the season',
      subject: best.submitterId ?? '__unknown__',
      artId: best.spotifyId,
      headline: `"${best.title}" scored ${best.countedScore}, more than any other song${soFar}.`,
      detail: `${best.submitterId ? nameOf.get(best.submitterId) : 'Somebody'} submitted it to ${
        best.roundName
      }, and ${best.distinctUpvoters} of ${best.eligibleVoters} voters gave it something.`,
      interest: 30 + best.countedScore,
    });
  }

  /* ---- 7. A haul that counted for nothing ---- */
  const wasted = [...stats.songs]
    .filter((s) => s.forfeited && s.upvotes > 0)
    .sort((a, b) => b.upvotes - a.upvotes)[0];
  if (wasted && stats.scoring === 'competitive') {
    const nameOf = new Map(stats.players.map((p) => [p.playerId, p.name]));
    const rank = [...stats.songs].filter((s) => s.upvotes > wasted.upvotes).length + 1;
    facts.push({
      label: 'Best song nobody got credit for',
      subject: wasted.submitterId ?? '__unknown__',
      artId: wasted.spotifyId,
      headline: `"${wasted.title}" drew ${wasted.upvotes} upvotes and counted for none of them.`,
      detail: `${
        wasted.submitterId ? nameOf.get(wasted.submitterId) : 'Somebody'
      } had the ${ordinal(rank)} most-liked song${soFar} and forfeited all of it by not voting that round, ending on ${wasted.countedScore}.`,
      interest: 42 + wasted.upvotes,
    });
  }

  // Best first, but no more than two stories about the same player.
  const ordered = facts.sort((a, b) => b.interest - a.interest);
  const used = new Map<string, number>();
  const picked: Fact[] = [];
  for (const pass of [1, 2]) {
    for (const fact of ordered) {
      if (picked.includes(fact)) continue;
      if (picked.length >= limit) break;
      const seen = used.get(fact.subject) ?? 0;
      if (fact.subject !== '__league__' && seen >= pass) continue;
      picked.push(fact);
      used.set(fact.subject, seen + 1);
    }
  }

  // Keep one song in the set: it reads better than four facts about people,
  // and it is the only kind of card that can show album art. Added alongside
  // the others rather than in place of one, so nothing earned gets displaced.
  const chosen = picked.slice(0, limit);
  if (!chosen.some((f) => f.artId)) {
    const withArt = ordered.find((f) => f.artId && !chosen.includes(f));
    if (withArt) chosen.push(withArt);
  }

  // Genre is the one card drawn from outside the export, so it is appended
  // rather than competing on interest with facts derived from the league.
  const genreFact = genres ? genreHeadline(genres) : undefined;
  if (genreFact) chosen.push(genreFact);

  return chosen;
}

/**
 * A single observation about genre, or nothing when the samples are too thin.
 *
 * Only genres above the reliability threshold are considered. Genre is the one
 * figure inferred from outside the export; the Genres panel on the Songs tab
 * carries that caveat, so the card itself stays a clean sentence.
 */
function genreHeadline(report: GenreReport): Fact | undefined {
  const reliable = report.stats.filter((g) => g.reliable);
  if (reliable.length < 2) return undefined;

  const mostSubmitted = [...reliable].sort((a, b) => b.songs - a.songs)[0];
  const best = [...reliable].sort((a, b) => b.avgScore - a.avgScore)[0];
  const share = Math.round(mostSubmitted.share * 100);

  // The interesting case: the league's favourite genre is not its best.
  if (mostSubmitted.genre !== best.genre && mostSubmitted.delta < 0) {
    return {
      label: 'Genre',
      subject: '__league__',
      artId: undefined,
      interest: 50,
      headline: `${mostSubmitted.genre} is the league's favourite genre and one of its worst-scoring.`,
      detail: `${mostSubmitted.songs} songs, ${share}% of all songs, at ${mostSubmitted.avgScore.toFixed(
        1,
      )} points each and ${mostSubmitted.avgDownvotes.toFixed(1)} downvotes a song. ${
        best.genre
      } is the opposite: ${best.songs} songs at ${best.avgScore.toFixed(
        1,
      )} each, the best of any genre.`,
    };
  }

  return {
    label: 'Genre',
    subject: '__league__',
    artId: undefined,
    interest: 50,
    headline: `${best.genre} scores better than any other genre here.`,
    detail: `${best.avgScore.toFixed(1)} points a song against a league average of ${report.baseline.toFixed(
      1,
    )}, across ${best.songs} songs. ${mostSubmitted.genre} is the most submitted at ${
      mostSubmitted.songs
    }.`,
  };
}
