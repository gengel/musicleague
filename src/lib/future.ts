import type { Stats } from './stats';

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
}

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
  if (ranked.length < 2 || !stats.hasVotes) return { roundsLeft, swing, projections };

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
   * A per-round target that pretends both players will vote every remaining
   * round is a lie for a non-voter: their earned upvotes keep forfeiting.
   * This factors that in by adjusting the target by the chaser's per-round
   * forfeit rate — worse if they keep forfeiting, easier if they start voting.
   */
  const forfeitAwareNote = (
    chaser: typeof leader,
    gapPts: number,
    perRoundNeeded: number,
  ): string => {
    if (stats.scoring !== 'competitive' || chaser.forfeitedUpvotes === 0) return '';
    const roundsMissed = chaser.roundsMissedVoting;
    const perRoundForfeit = roundsMissed > 0 ? chaser.forfeitedUpvotes / roundsMissed : 0;
    const rounds = chaser.roundsSubmitted || 1;
    const forfeitRate = chaser.forfeitedUpvotes / rounds;
    if (chaser.forfeitedUpvotes >= gapPts) {
      return ` But ${chaser.name} has already forfeited ${chaser.forfeitedUpvotes} pts by not voting — more than the gap. Voting the rest of the way would close it on its own.`;
    }
    if (forfeitRate >= 1) {
      // On average this player loses at least 1 pt per round to forfeit.
      // The catch-up target grows if that keeps up.
      const inflated = Math.ceil(perRoundNeeded + forfeitRate);
      return ` But ${chaser.name} has forfeited ${chaser.forfeitedUpvotes} pts by not voting — if that habit continues, the real target is closer to ${inflated} a round, not ${perRoundNeeded}.`;
    }
    return ` ${chaser.name} has also forfeited ${chaser.forfeitedUpvotes} pts by not voting; ${perRoundForfeit >= 1 ? 'voting from here on would speed it up' : 'closing that habit would help too'}.`;
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
      }.${forfeitAwareNote(runnerUp, gap, perRoundNeeded)}${
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
      detail: `That is ${perRoundEscape} a round, against a typical winning score of ${typicalWin}.${forfeitAwareNote(last, escapeGap, perRoundEscape)}`,
      status: 'live',
      subject: last.playerId,
      interest: 90,
    });
  }

  /* ---- What voting alone would be worth ---- */
  const silent = ranked
    .filter((p) => p.roundsMissedVoting > 0)
    .sort((a, b) => b.forfeitedUpvotes - a.forfeitedUpvotes);
  if (silent.length && stats.scoring === 'competitive') {
    const worst = silent[0];
    const wouldBe = worst.pointsCounted + worst.forfeitedUpvotes;
    const wouldPass = ranked.filter(
      (p) => p.playerId !== worst.playerId && p.pointsCounted < wouldBe,
    ).length;
    const nowBehind = ranked.length - (ranked.indexOf(worst) + 1);
    projections.push({
      label: 'The cheapest points on offer',
      headline: `${worst.name} can gain ${worst.forfeitedUpvotes} points without a single new vote in their favour.`,
      detail: `That is what they have already forfeited by not voting. Simply voting from here on would have moved them past ${plural(
        Math.max(0, wouldPass - nowBehind),
        'player',
      )} had it applied all season — and it costs nothing but a ballot.`,
      status: 'live',
      subject: worst.playerId,
      interest: 85,
    });
  }

  /* ---- Where the real leverage is ---- */
  if (stats.songs.some((s) => s.downvotes > 0)) {
    const downTotal = ranked.reduce((sum, p) => sum + p.breakdown.downvotes, 0);
    const upTotal = ranked.reduce((sum, p) => sum + p.breakdown.upvotes, 0);
    projections.push({
      label: 'Where games are won',
      headline: `Downvotes have decided more than upvotes in this league.`,
      detail: `${downTotal} downvote points have been spent against ${upTotal} upvote points earned. Avoiding the pile-on matters as much as winning rounds: the difference between a song scoring ${bestObserved} and ${worstObserved} is ${
        bestObserved - worstObserved
      } points, most of a round's swing.`,
      status: 'info',
      subject: '__league__',
      interest: 60,
    });
  }

  /* ---- Whose ballot actually decides rounds ---- */
  const kingmakers = decisiveVoters(stats);
  if (kingmakers.length && kingmakers[0].rounds.length > 0) {
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

  return { roundsLeft, swing, projections: chosen };
}

