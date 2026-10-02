import type { PlayerStats, Stats } from './stats';
import { projectStandings } from './projection';

/**
 * What could still happen, given how this league has actually behaved.
 *
 * Every figure is grounded in observed play rather than theory: the ceiling on a
 * round comes from the largest single vote anyone has cast and the number of
 * voters who turn up, and "realistic" is measured against the best round anyone
 * has managed so far. Where the league's remaining round count is unknown the
 * projections are per-round instead of absolute, and say so.
 */

export interface Swing {
  /** Most a player has scored in one round so far. */
  bestObserved: number;
  /** Median round-winning score. */
  typicalWin: number;
  /** Theoretical ceiling for one song in one round. */
  ceiling: number;
  /** Worst a song has scored, which is how far a round can go backwards. */
  worstObserved: number;
  /**
   * Largest gap one player could close on another in a single round if the
   * round went perfectly for one and terribly for the other. A ceiling for
   * ruling things out, not a forecast.
   */
  perRound: number;
  /**
   * The largest swing the league has actually produced: the best round anyone
   * has had, minus the worst. This is the honest yardstick for whether a gap is
   * reachable.
   */
  realistic: number;
}

export interface Projection {
  label: string;
  headline: string;
  detail: string;
  /** 'live' when it can still happen, 'settled' when the maths rules it out. */
  status: 'live' | 'settled' | 'info';
  /** Who it is mainly about, so one player cannot dominate the tab. */
  subject: string;
  /** Higher is more worth showing. */
  interest: number;
}

export interface Future {
  roundsLeft?: number;
  swing: Swing;
  projections: Projection[];
  /** Every contender placed in a probability band, best-placed first. */
  bands: ContentionBand[];
}

/** A player's realistic title outlook, grouped into a readable band. */
export interface BandedPlayer {
  playerId: string;
  name: string;
  points: number;
  rank: number;
  /** Points behind the leader (0 for the leader). */
  behind: number;
  /** Share of simulated seasons this player won, 0..1, when available. */
  winShare?: number;
}

export type BandKey =
  | 'locked'
  | 'crowned'
  | 'yourstolose'
  | 'drivers'
  | 'stillinit'
  | 'chance'
  | 'gameover'
  // Fallback bands when there is no win-probability model (unknown finish line).
  | 'leader'
  | 'contention'
  | 'outside'
  | 'eliminated';

export interface ContentionBand {
  key: BandKey;
  label: string;
  /** One-line explanation of what puts a player in this band. */
  note: string;
  players: BandedPlayer[];
}

/**
 * Downvotes must have taken back at least this share of all upvote points
 * before the "Where games are won" card is worth showing. Below it, downvotes
 * are a side-show rather than where the league is decided.
 */
export const DOWNVOTE_LEVERAGE = 0.5;

/** 1st, 2nd, 3rd… for describing places in the table. */
function ordinalPlace(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Rounds where one voter's ballot decided the winner.
 *
 * For each voter, the round is re-scored with their votes removed and the
 * winner recomputed. Forfeit status is left alone: the question is "did this
 * ballot decide it", not "what if this player had never joined". Who a rival
 * needs to court is exactly this list.
 */
function decisiveVoters(stats: Stats): { name: string; rounds: string[] }[] {
  const nameOf = new Map(stats.players.map((p) => [p.playerId, p.name]));
  const decisive = new Map<string, string[]>();

  for (const round of stats.rounds) {
    if (!round.hasVotes || !round.winnerTrackId) continue;
    const songs = stats.songs.filter((s) => s.roundId === round.round.id);
    if (songs.length < 2) continue;

    const votes = stats.league.votes.filter((v) => v.roundId === round.round.id);
    for (const voterId of round.voters) {
      const mine = votes.filter((v) => v.voterId === voterId);
      if (!mine.length) continue;

      const rescored = songs
        .map((song) => {
          const removed = mine.filter((v) => v.trackId === song.trackId);
          const up = song.upvotes - removed.filter((v) => v.points > 0).reduce((a, v) => a + v.points, 0);
          const down =
            song.downvotes - removed.filter((v) => v.points < 0).reduce((a, v) => a - v.points, 0);
          return { song, score: song.forfeited ? -down : up - down };
        })
        // Same ordering rule the standings use, so the comparison is fair.
        .sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title));

      if (rescored[0].song.trackId !== round.winnerTrackId) {
        decisive.set(voterId, [...(decisive.get(voterId) ?? []), round.round.name]);
      }
    }
  }

  return [...decisive.entries()]
    .map(([id, rounds]) => ({ name: nameOf.get(id) ?? id, rounds }))
    .sort((a, b) => b.rounds.length - a.rounds.length || a.name.localeCompare(b.name));
}

/** Points scored in the second half of the season against the first. */
function form(stats: Stats): { name: string; early: number; late: number; swing: number }[] {
  const played = stats.rounds
    .filter((r) => r.hasVotes)
    .sort((a, b) => a.round.sequence - b.round.sequence);
  if (played.length < 4) return [];
  const half = Math.floor(played.length / 2);
  const earlyIds = new Set(played.slice(0, half).map((r) => r.round.id));
  const lateIds = new Set(played.slice(half).map((r) => r.round.id));

  return stats.players
    .filter((p) => p.songs > 0)
    .map((player) => {
      const mine = stats.songs.filter((s) => s.submitterId === player.playerId);
      const sum = (ids: Set<string>) =>
        mine.filter((s) => ids.has(s.roundId)).reduce((a, s) => a + s.countedScore, 0);
      const early = sum(earlyIds);
      const late = sum(lateIds);
      return { name: player.name, early, late, swing: late - early };
    })
    .sort((a, b) => b.swing - a.swing);
}

/**
 * Places players into named bands by their win probability — the share of
 * simulated seasons they won. Thresholds and names are deliberately playful,
 * since the point of this panel is the story of the race, not an audit.
 *
 * A band only appears when someone is in it, and every contender lands in
 * exactly one, so the win shares in each band's players sum to the whole race.
 */
const WIN_BANDS: {
  key: BandKey;
  label: string;
  note: string;
  /** Inclusive lower bound as a fraction, 0..1. Checked high to low. */
  min: (p: number) => boolean;
}[] = [
  {
    key: 'crowned',
    label: 'One hand on the trophy',
    note: 'Wins 90% or more of simulated seasons — only a collapse stops them.',
    min: (p) => p >= 0.9,
  },
  {
    key: 'yourstolose',
    label: 'Yours to lose',
    note: 'Out in front: wins 65–89% of simulated seasons.',
    min: (p) => p >= 0.65,
  },
  {
    key: 'drivers',
    label: 'Flip of a coin',
    note: 'A real favourite, but far from safe: wins 40–64% of seasons.',
    min: (p) => p >= 0.4,
  },
  {
    key: 'stillinit',
    label: 'Still in it',
    note: 'Live, with work to do: wins 10–39% of seasons.',
    min: (p) => p >= 0.1,
  },
  {
    key: 'chance',
    label: "So you're telling me there's a chance",
    note: 'A long shot, but not mathematically out.',
    min: () => true, // everyone below 10% who can still win
  },
];

// The two certainty bands are decided by the maths, not the simulation: a
// player can win 100% of simulated seasons without the title being clinched
// (an unlikely swing could still catch them), and 0% without being eliminated.
const LOCKED_BAND = {
  key: 'locked' as BandKey,
  label: 'Clinched',
  note: 'Cannot be caught: the title is theirs whatever happens in the rounds left.',
};
const GAMEOVER_BAND = {
  key: 'gameover' as BandKey,
  label: 'Game over',
  note: 'Mathematically out — cannot reach the lead even with a perfect run.',
};

/**
 * @param clinchedId  the player who has mathematically clinched, if any.
 * @param eliminatedIds  players who mathematically cannot win.
 */
export function winProbabilityBands(
  ranked: PlayerStats[],
  winShareOf: Map<string, number>,
  clinchedId?: string,
  eliminatedIds: Set<string> = new Set(),
): ContentionBand[] {
  const order: BandKey[] = [
    'locked',
    'crowned',
    'yourstolose',
    'drivers',
    'stillinit',
    'chance',
    'gameover',
  ];
  const banded = new Map<BandKey, BandedPlayer[]>(order.map((k) => [k, []]));
  ranked.forEach((p, i) => {
    const winShare = winShareOf.get(p.playerId) ?? 0;
    let key: BandKey;
    if (p.playerId === clinchedId) {
      key = 'locked';
    } else if (eliminatedIds.has(p.playerId)) {
      key = 'gameover';
    } else {
      // Not mathematically settled: use the simulation, but never let a player
      // fall into a certainty band by probability alone.
      key = WIN_BANDS.find((b) => b.min(winShare))!.key;
    }
    banded.get(key)!.push({
      playerId: p.playerId,
      name: p.name,
      points: p.pointsCounted,
      rank: i + 1,
      behind: (ranked[0]?.pointsCounted ?? 0) - p.pointsCounted,
      winShare,
    });
  });
  const meta = new Map(
    [LOCKED_BAND, ...WIN_BANDS, GAMEOVER_BAND].map((b) => [b.key, b]),
  );
  return order
    .filter((k) => banded.get(k)!.length > 0)
    .map((k) => {
      const m = meta.get(k)!;
      return { key: k, label: m.label, note: m.note, players: banded.get(k)! };
    });
}

/**
 * Groups contenders into a few probability bands rather than a yes/no "can
 * still win". A player's reach is `rounds left × the biggest swing the league
 * has actually produced` — the honest yardstick — measured against the gap to
 * the leader. Bands, not percentages, because a dozen rounds of a friendly
 * league is far too little data to justify a real probability.
 */
export function contentionBands(
  ranked: PlayerStats[],
  leaderPoints: number,
  realisticBudget: number | undefined,
): ContentionBand[] {
  if (!ranked.length) return [];
  type LegacyKey = 'leader' | 'contention' | 'outside' | 'eliminated';
  const banded: Record<LegacyKey, BandedPlayer[]> = {
    leader: [],
    contention: [],
    outside: [],
    eliminated: [],
  };
  ranked.forEach((p, i) => {
    const behind = leaderPoints - p.pointsCounted;
    const entry: BandedPlayer = {
      playerId: p.playerId,
      name: p.name,
      points: p.pointsCounted,
      rank: i + 1,
      behind,
    };
    if (i === 0) {
      banded.leader.push(entry);
    } else if (realisticBudget === undefined) {
      // No known finish line: judge by how close they are relative to the
      // field's spread rather than an absolute budget.
      banded.contention.push(entry);
    } else if (behind <= realisticBudget / 2) {
      banded.contention.push(entry);
    } else if (behind <= realisticBudget) {
      banded.outside.push(entry);
    } else {
      banded.eliminated.push(entry);
    }
  });

  const bands: ContentionBand[] = [
    {
      key: 'leader',
      label: 'Leading',
      note: 'Top of the table as it stands.',
      players: banded.leader,
    },
    {
      key: 'contention',
      label: 'In contention',
      note:
        realisticBudget === undefined
          ? 'Within range on the season so far.'
          : 'Close enough to lead on the kind of rounds this league has actually produced.',
      players: banded.contention,
    },
    {
      key: 'outside',
      label: 'Outside shot',
      note: 'Would need a run better than anything the league has seen so far.',
      players: banded.outside,
    },
    {
      key: 'eliminated',
      label: 'Out of it',
      note: 'Too far back to catch the lead in the rounds that remain.',
      players: banded.eliminated,
    },
  ];
  return bands.filter((b) => b.players.length > 0);
}

export function future(stats: Stats): Future {
  const ranked = [...stats.players]
    .filter((p) => p.songs > 0)
    .sort((a, b) => b.pointsCounted - a.pointsCounted);

  const played = stats.rounds.filter((r) => r.hasVotes);
  const scored = stats.songs.filter((s) => s.roundRank > 0);

  const bestObserved = scored.length ? Math.max(...scored.map((s) => s.countedScore)) : 0;
  const worstObserved = scored.length ? Math.min(...scored.map((s) => s.countedScore)) : 0;
  const typicalWin = median(
    played
      .map((r) => scored.find((s) => s.trackId === r.winnerTrackId)?.countedScore ?? 0)
      .filter((n) => n > 0),
  );

  // Ceiling: every other voter in a round spending their per-song limit on one
  // song. Computed per round and maximised, because a round with more voters
  // has a higher ceiling — using a median voter count would put the ceiling
  // below scores that have actually happened.
  const ceiling = Math.max(
    0,
    ...played.map((r) => r.observedPerSongCap * Math.max(0, r.voters.length - 1)),
  );

  // The most one player can gain on another in a round: their best case while
  // the other has their worst.
  const perRound = Math.max(1, ceiling - Math.min(0, worstObserved));

  const realistic = Math.max(1, bestObserved - worstObserved);
  const swing: Swing = { bestObserved, typicalWin, ceiling, worstObserved, perRound, realistic };
  const roundsLeft =
    stats.totalRounds !== undefined ? Math.max(0, stats.totalRounds - stats.roundsPlayed) : undefined;

  const projections: Projection[] = [];
  if (ranked.length < 2 || !stats.hasVotes)
    return {
      roundsLeft,
      swing,
      projections,
      bands: contentionBands(ranked, ranked[0]?.pointsCounted ?? 0, undefined),
    };

  const leader = ranked[0];
  const runnerUp = ranked[1];
  const last = ranked[ranked.length - 1];
  const secondLast = ranked[ranked.length - 2];

  const roundsPhrase = roundsLeft === undefined ? 'each remaining round' : plural(roundsLeft, 'round');
  const budget = roundsLeft === undefined ? undefined : roundsLeft * perRound;

  /* ---- Can the leader be caught? ---- */
  const gap = leader.pointsCounted - runnerUp.pointsCounted;
  // Two counts: who is mathematically alive, and who is alive on swings this
  // league has actually produced. The second is the useful number.
  const realisticBudget = roundsLeft === undefined ? undefined : roundsLeft * realistic;
  const chasers = ranked
    .slice(1)
    .filter((p) => budget === undefined || leader.pointsCounted - p.pointsCounted <= budget);
  const plausible = ranked
    .slice(1)
    .filter(
      (p) => realisticBudget === undefined || leader.pointsCounted - p.pointsCounted <= realisticBudget,
    );
  /**
   * A per-round catch-up target assumes the chaser actually banks what their
   * song earns each round. For a non-voter in competitive mode that is false:
   * they forfeit their upvotes and still take downvotes, so each skipped round
   * moves them *backwards*. The honest framing is that voting is the
   * precondition for any climb, not a knob that makes the target larger.
   */
  const forfeitAwareNote = (chaser: typeof leader, gapPts: number): string => {
    if (stats.scoring !== 'competitive' || chaser.forfeitedUpvotes === 0) return '';
    const stillOwed =
      chaser.forfeitedUpvotes >= gapPts
        ? ` ${chaser.name} has already forfeited ${chaser.forfeitedUpvotes} pts by not voting — more than the whole gap — so simply voting from here could close it without outscoring anyone.`
        : ` ${chaser.name} has forfeited ${chaser.forfeitedUpvotes} pts by not voting, part of why they are back here.`;
    return `${stillOwed} But none of that is reachable while they keep skipping!`;
  };

  if (budget !== undefined && gap > budget) {
    projections.push({
      label: 'The title',
      headline: `${leader.name} cannot be caught.`,
      detail: `They lead by ${gap} with ${roundsPhrase} to play, and the most anyone has been able to gain on a rival in one round is ${perRound}. Even a perfect run from ${runnerUp.name} falls short.`,
      status: 'settled',
      subject: leader.playerId,
      interest: 100,
    });
  } else {
    const perRoundNeeded = roundsLeft ? Math.ceil(gap / roundsLeft) : gap;
    projections.push({
      label: 'The title',
      headline: `${runnerUp.name} needs to out-score ${leader.name} by ${gap} to take the lead.`,
      detail: `Over ${roundsPhrase} that is ${perRoundNeeded} a round — ${
        perRoundNeeded <= typicalWin
          ? `less than the ${typicalWin} a typical round winner scores, so it is well within reach`
          : perRoundNeeded <= bestObserved
            ? `more than a typical winning round (${typicalWin}) but inside the best anyone has managed (${bestObserved})`
            : `more than the best round anyone has managed so far (${bestObserved}), so it would take something unprecedented`
      }.${forfeitAwareNote(runnerUp, gap)}${
        chasers.length > 1
          ? plausible.length < chasers.length
            ? ` ${chasers.length} players are mathematically alive, though only ${plausible.length} on swings this league has actually produced.`
            : ` All ${chasers.length} players behind them are still mathematically alive.`
          : ''
      }`,
      status: 'live',
      subject: runnerUp.playerId,
      interest: 100,
    });
  }

  /* ---- Can last place escape? ---- */
  const escapeGap = secondLast.pointsCounted - last.pointsCounted;
  if (budget !== undefined && escapeGap > budget) {
    projections.push({
      label: 'Last place',
      headline: `${last.name} is stuck at the bottom.`,
      detail: `${escapeGap} behind ${secondLast.name} with ${roundsPhrase} left, and a round can only move a player ${perRound} relative to a rival.`,
      status: 'settled',
      subject: last.playerId,
      interest: 90,
    });
  } else {
    const perRoundEscape = roundsLeft ? Math.ceil(escapeGap / roundsLeft) : escapeGap;
    projections.push({
      label: 'Last place',
      headline: `${last.name} needs ${escapeGap} on ${secondLast.name} to climb off the bottom.`,
      detail: `That is ${perRoundEscape} a round, against a typical winning score of ${typicalWin}.${forfeitAwareNote(last, escapeGap)}`,
      status: 'live',
      subject: last.playerId,
      interest: 90,
    });
  }

  /* ---- What voting alone would be worth ----
   * (Removed: the "Points left on the table" card duplicated the Forfeited
   * column and the "didn't vote" flag now shown in the standings table.) */

  /* ---- Where the real leverage is ----
   *
   * Only worth saying when downvotes are a large share of the scoring, and
   * the headline has to follow the numbers: a league with 624 downvote points
   * against 832 upvote points has not been decided more by downvotes. Only
   * downvotes that landed are counted — any the zero floor absorbed took
   * nothing away from anybody.
   */
  const upTotal = ranked.reduce((sum, p) => sum + p.breakdown.upvotes, 0);
  const downLanded = ranked.reduce(
    (sum, p) => sum + p.breakdown.downvotes - p.breakdown.absorbed,
    0,
  );
  const downShare = upTotal > 0 ? downLanded / upTotal : downLanded > 0 ? Infinity : 0;
  // A league that hands every voter equal up and down budgets is zero-sum by
  // design, so a high downvote share says nothing about how it plays — it is
  // just the rules. Only surface this card where the balance is a choice.
  const fixedZeroSum = Boolean(stats.budget && stats.budget.upvotes === stats.budget.downvotes);
  if (!fixedZeroSum && downLanded > 0 && downShare >= DOWNVOTE_LEVERAGE) {
    const headline =
      downShare > 1
        ? 'Downvotes have taken away more than upvotes have given in this league.'
        : downShare === 1
          ? 'Downvotes have taken back every upvote point earned in this league.'
          : `Downvotes have taken back ${Math.round(downShare * 100)}% of every upvote point in this league.`;
    // The pile-on comparison only makes sense when a song can actually go
    // below zero; with the floor on, the worst song is simply zero.
    const pileOn =
      worstObserved < 0 && bestObserved > 0
        ? ` The best song so far scored ${bestObserved} and the worst ${worstObserved}, so ${
            -worstObserved >= bestObserved
              ? 'a pile-on costs as much as a win earns'
              : `a pile-on costs ${Math.round((-worstObserved / bestObserved) * 100)}% of what the best song earned`
          }.`
        : '';
    projections.push({
      label: 'Where games are won',
      headline,
      detail: `${downLanded} downvote points have landed against ${upTotal} upvote points earned.${pileOn}`,
      status: 'info',
      subject: '__league__',
      interest: 60,
    });
  }

  /* ---- Whose ballot actually decides rounds ---- */
  const kingmakers = decisiveVoters(stats);
  // A "kingmaker" needs a body of rounds to be meaningful — with one or two
  // played, one decisive ballot is just the round, not a pattern.
  if (stats.roundsPlayed >= 3 && kingmakers.length && kingmakers[0].rounds.length > 0) {
    const top = kingmakers[0];
    projections.push({
      label: 'The kingmaker',
      headline: `${top.name}'s ballot alone decided ${plural(top.rounds.length, 'round')}.`,
      detail: `Remove their votes and a different song wins ${
        top.rounds.length === 1 ? top.rounds[0] : top.rounds.slice(0, 3).join(', ')
      }. If you want a round, this is the voter to write a submission note for.${
        kingmakers.length > 1
          ? ` ${kingmakers[1].name} has swung ${plural(kingmakers[1].rounds.length, 'round')} too.`
          : ''
      }`,
      status: 'info',
      subject: top.name,
      interest: 82,
    });
  }

  /* ---- Who is getting hotter, and who is fading ---- */
  const trend = form(stats);
  // Someone going from −23 to −5 has improved arithmetically but is not in form.
  const risers = trend.filter((t) => t.swing > 0 && t.late > 0);
  if (risers.length && trend.length >= 2) {
    const rising = risers[0];
    const falling = trend[trend.length - 1];
    projections.push({
      label: 'Form',
      headline: `${rising.name} is finishing rounds far better than they started.`,
      detail: `${rising.early} points in the first half of the season against ${rising.late} in the second, a swing of ${rising.swing}. Going the other way, ${falling.name} has dropped from ${falling.early} to ${falling.late}.`,
      status: 'info',
      subject: rising.name,
      interest: 78,
    });
  }

  /* ---- Places that are level or nearly so ---- */
  const knifeEdges = ranked
    .slice(0, -1)
    .map((player, index) => ({
      above: player,
      below: ranked[index + 1],
      gap: player.pointsCounted - ranked[index + 1].pointsCounted,
      place: index + 1,
    }))
    .filter((pair) => pair.gap <= 1)
    .sort((a, b) => a.gap - b.gap || a.place - b.place);
  if (knifeEdges.length) {
    const tightest = knifeEdges[0];
    projections.push({
      label: 'Too close to call',
      headline:
        tightest.gap === 0
          ? `${tightest.above.name} and ${tightest.below.name} are dead level on ${tightest.above.pointsCounted}.`
          : `${tightest.above.name} leads ${tightest.below.name} by a single point.`,
      detail: `That is ${ordinalPlace(tightest.place)} and ${ordinalPlace(
        tightest.place + 1,
      )} decided by one good vote.${
        knifeEdges.length > 1
          ? ` There ${knifeEdges.length === 2 ? 'is' : 'are'} ${
              knifeEdges.length - 1
            } other pair${knifeEdges.length === 2 ? '' : 's'} within a point of each other.`
          : ''
      }`,
      status: 'live',
      subject: tightest.above.playerId,
      interest: 88,
    });
  }

  /* ---- Who is bleeding points to downvotes ---- */
  const exposed = ranked
    .filter((p) => p.roundsSubmitted > 0 && p.breakdown.downvotes > 0)
    .map((p) => ({ player: p, perRound: p.breakdown.downvotes / p.roundsSubmitted }))
    .sort((a, b) => b.perRound - a.perRound);
  if (exposed.length && roundsLeft !== undefined && roundsLeft > 0) {
    const worst = exposed[0];
    const expected = Math.round(worst.perRound * roundsLeft);
    projections.push({
      label: 'Downvote exposure',
      headline: `${worst.player.name} is losing ${worst.perRound.toFixed(1)} points a round to downvotes.`,
      detail: `At that rate the remaining ${plural(
        roundsLeft,
        'round',
      )} will cost them another ${expected}. They have taken ${worst.player.breakdown.downvotes} so far, the most in the league — picking safer songs is worth more to them than picking better ones.`,
      status: 'info',
      subject: worst.player.playerId,
      interest: 74,
    });
  }

  /* ---- Whose support is narrow enough to collapse ---- */
  const fragile = ranked
    .filter((p) => p.songs >= 2 && p.pointsCounted > 0 && p.distinctSupporters > 0)
    .map((p) => ({ player: p, concentration: p.avgConcentration }))
    .sort((a, b) => b.concentration - a.concentration);
  if (fragile.length && fragile[0].concentration >= 0.3) {
    const narrow = fragile[0];
    projections.push({
      label: 'Fragile support',
      headline: `${narrow.player.name} depends on a narrow group of voters.`,
      detail: `Their typical song takes ${Math.round(
        narrow.concentration * 100,
      )}% of its points from one voter${
        narrow.player.distinctSupporters <= ranked.length / 2
          ? `, and only ${plural(narrow.player.distinctSupporters, 'player')} have ever backed them`
          : ', so a broad support base hides a lopsided one'
      }. If that voter changes their mind, the drop is steep.`,
      status: 'info',
      subject: narrow.player.playerId,
      interest: 70,
    });
  }

  // One story per player, so a single interesting player cannot fill the tab.
  const ordered = projections.sort((a, b) => b.interest - a.interest);
  const seen = new Set<string>();
  const chosen: Projection[] = [];
  for (const projection of ordered) {
    if (projection.subject !== '__league__' && seen.has(projection.subject)) continue;
    seen.add(projection.subject);
    chosen.push(projection);
  }

  // Prefer win-probability bands when the season has a known finish line, so
  // the title race reads in the same percentages as the Race prediction panel.
  // Fall back to the gap-based bands when there is no finish line to simulate
  // toward, or when the projection has too little to go on.
  let bands = contentionBands(ranked, leader.pointsCounted, realisticBudget);
  if (roundsLeft !== undefined && roundsLeft > 0) {
    const projection = projectStandings(stats, { roundsLeft, runs: 500 });
    if (!projection.insufficientData) {
      const winShareOf = new Map(projection.forecasts.map((f) => [f.playerId, f.winShare]));

      // Mathematical certainty, independent of the simulation. The most a
      // player can gain over the rest of the season is a perfect round every
      // round: roundsLeft × the single-song ceiling. (perRound also nets off
      // the worst a rival's song could do, which is the right swing for a
      // head-to-head.) A chaser is out when even that cannot reach the current
      // leader; the leader is clinched when no chaser can reach the leader's
      // current score — i.e. everyone else is out.
      const maxGain = roundsLeft * perRound;
      const eliminatedIds = new Set(
        ranked
          .filter((p) => leader.pointsCounted - p.pointsCounted > maxGain)
          .map((p) => p.playerId),
      );
      // The leader has clinched when every other player is mathematically out.
      const clinchedId =
        ranked.length >= 2 && ranked.slice(1).every((p) => eliminatedIds.has(p.playerId))
          ? leader.playerId
          : undefined;

      bands = winProbabilityBands(ranked, winShareOf, clinchedId, eliminatedIds);
    }
  }

  return {
    roundsLeft,
    swing,
    projections: chosen,
    bands,
  };
}

