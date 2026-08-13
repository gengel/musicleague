import { describe, expect, it } from 'vitest';
import { parseLeague } from '../lib/parse';
import { computeStats, type Stats } from '../lib/stats';
import { buildDemoCsv } from '../lib/demo';

/**
 * A hand-checkable three-player league. Every expectation below is
 * derived by hand from these rows, not from a snapshot.
 *
 * Round 1 — everyone submits, everyone votes (4 pts each):
 *   A: SB 3, SC 1 | B: SA 2, SC 2 | C: SA 4
 * Round 2 — C submits but never votes:
 *   A: TB 4       | B: TA 1, TC 3
 */
const CSV = `[rounds]
Position,Title,Voting Closes
1,R1,2026-01-03T18:00:00Z
2,R2,2026-01-10T18:00:00Z

[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,A,SA,ArtA,s1
R1,B,SB,ArtB,s2
R1,C,SC,ArtC,s3
R2,A,TA,ArtA,s4
R2,B,TB,ArtB,s5
R2,C,TC,ArtC,s6

[votes]
Round,Voter,Submitter,Song Title,Points
R1,A,B,SB,3
R1,A,C,SC,1
R1,B,A,SA,2
R1,B,C,SC,2
R1,C,A,SA,4
R2,A,B,TB,4
R2,B,A,TA,1
R2,B,C,TC,3
`;

const stats: Stats = computeStats(parseLeague([{ name: 'tiny.csv', text: CSV }]));

const song = (title: string) => stats.songs.find((s) => s.title === title)!;
const player = (name: string) => stats.players.find((p) => p.name === name)!;
const pair = (voter: string, target: string) =>
  stats.pairs.find((p) => p.voterName === voter && p.targetName === target)!;

describe('song scoring', () => {
  it('sums upvotes and nets out downvotes', () => {
    expect(song('SA').upvotes).toBe(6);
    expect(song('SA').downvotes).toBe(0);
    expect(song('SA').net).toBe(6);
  });

  it('counts only voters who could actually vote on the song as eligible', () => {
    // Round 1 had three voters; SA's own submitter is excluded.
    expect(song('SA').eligibleVoters).toBe(2);
    // Round 2 had two voters (C sat out); TA's submitter A is excluded.
    expect(song('TA').eligibleVoters).toBe(1);
  });

  it('measures breadth as the share of eligible voters who chipped in', () => {
    expect(song('SA').breadth).toBe(1);
    expect(song('SB').breadth).toBe(0.5);
    expect(song('TC').breadth).toBe(0.5);
  });

  it('measures concentration with a Herfindahl index', () => {
    // SA: 2 and 4 of 6 -> (1/3)^2 + (2/3)^2
    expect(song('SA').concentration).toBeCloseTo(0.5556, 4);
    // SB: one voter gave everything.
    expect(song('SB').concentration).toBe(1);
  });

  it('measures spread as the deviation across eligible voters', () => {
    expect(song('SA').spread).toBeCloseTo(1, 6); // [2, 4]
    expect(song('SB').spread).toBeCloseTo(1.5, 6); // [3, 0]
    expect(song('SC').spread).toBeCloseTo(0.5, 6); // [1, 2]
  });

  it('ranks songs within their round and reports share of round', () => {
    expect(song('SA').roundRank).toBe(1);
    expect(song('SA').shareOfRound).toBeCloseTo(6 / 12, 6);
    expect(song('TB').roundRank).toBe(1);
    expect(song('TA').roundRank).toBe(3);
  });

  it('records the largest single contribution', () => {
    expect(song('SA').topVoterPoints).toBe(4);
  });
});

describe('round stats', () => {
  const round = (name: string) => stats.rounds.find((r) => r.round.name === name)!;

  it('totals the points cast', () => {
    expect(round('R1').totalUpvotes).toBe(12);
    expect(round('R2').totalUpvotes).toBe(8);
  });

  it('identifies submitters who never voted', () => {
    expect(round('R1').nonVoters).toEqual([]);
    expect(round('R2').nonVoters).toEqual(['c']);
  });

  it('infers the per-song cap and the typical budget from what was cast', () => {
    expect(round('R1').observedPerSongCap).toBe(4);
    expect(round('R1').typicalBudget).toBe(4);
  });

  it('names the round winner', () => {
    expect(round('R1').winnerTrackId).toBe(song('SA').trackId);
  });
});

describe('non-voting forfeiture', () => {
  it('charges a non-voter the upvotes their song earned that round', () => {
    // C submitted in R2 but never voted, and TC earned 3.
    expect(player('C').roundsMissedVoting).toBe(1);
    expect(player('C').forfeitedUpvotes).toBe(3);
  });

  it('charges nothing to players who always voted', () => {
    expect(player('A').roundsMissedVoting).toBe(0);
    expect(player('A').forfeitedUpvotes).toBe(0);
    expect(player('B').forfeitedUpvotes).toBe(0);
  });
});

describe('voter behaviour', () => {
  it('totals points given', () => {
    expect(player('A').upvotesGiven).toBe(8);
    expect(player('B').upvotesGiven).toBe(8);
    expect(player('C').upvotesGiven).toBe(4);
  });

  it('averages how many songs a voter spreads points across per round', () => {
    expect(player('A').avgSongsVotedPer).toBe(1.5); // 2 songs, then 1
    expect(player('C').avgSongsVotedPer).toBe(1);
  });

  it('averages points placed per backed song', () => {
    expect(player('A').avgPointsPerVote).toBeCloseTo(8 / 3, 6);
  });

  it('tracks how much of a voter budget lands at the per-song cap', () => {
    // A's only cap-height vote is the 4 on TB, out of 8 points given.
    expect(player('A').maxStackRate).toBeCloseTo(0.5, 6);
  });

  it('scores taste alignment against the rest of the room', () => {
    // A backed the songs nobody else backed: 0*3 + 1*1 + 0*4 over 8 points.
    expect(player('A').tasteAlignment).toBeCloseTo(0.125, 6);
  });
});

describe('submitter performance', () => {
  it('sums points received and averages per song', () => {
    expect(player('A').pointsReceived).toBe(7); // SA 6 + TA 1
    expect(player('A').avgPerSong).toBeCloseTo(3.5, 6);
  });

  it('keeps the per-song average reconcilable with the season total', () => {
    // A negative raw mean beside a positive total reads as a bug, so the
    // average uses the same floored contributions as the total.
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,A,SA,ArtA,s1
R1,B,SB,ArtB,s2
R2,A,TA,ArtA,s3
R2,B,TB,ArtB,s4

[votes]
Round,Voter,Submitter,Song Title,Points
R1,B,A,SA,10
R1,A,B,SB,1
R2,B,A,TA,-8
R2,A,B,TB,1
`;
    const s = computeStats(parseLeague([{ name: 'n.csv', text: csv }]));
    const a = s.players.find((p) => p.name === 'A')!;
    expect(a.pointsReceived).toBe(2); // raw: 10 - 8
    expect(a.pointsCounted).toBe(10); // league score
    expect(a.avgPerSong).toBeCloseTo(5, 6);
    expect(a.avgPerSong * a.songs).toBeCloseTo(a.pointsCounted, 6);
  });

  it('counts round wins', () => {
    expect(player('A').wins).toBe(1); // SA
    expect(player('B').wins).toBe(1); // TB
    expect(player('C').wins).toBe(0);
  });

  it('names best and worst songs', () => {
    expect(player('A').bestSong?.title).toBe('SA');
    expect(player('A').worstSong?.title).toBe('TA');
  });

  it('counts distinct supporters', () => {
    expect(player('A').distinctSupporters).toBe(2); // B and C
    expect(player('C').distinctSupporters).toBe(2); // A and B
  });
});

describe('pairwise voting relationships', () => {
  it('sums raw points between a voter and a submitter', () => {
    expect(pair('A', 'B').upvotes).toBe(7); // 3 then 4
    expect(pair('A', 'C').upvotes).toBe(1);
    expect(pair('C', 'B').upvotes).toBe(0);
  });

  it('counts shared rounds and available songs, not just votes cast', () => {
    expect(pair('A', 'C').opportunities).toBe(2);
    expect(pair('A', 'C').songsAvailable).toBe(2);
    expect(pair('A', 'C').songsBacked).toBe(1);
    // C only voted in round one.
    expect(pair('C', 'A').opportunities).toBe(1);
  });

  it('expects an even spread of the budget across the ballot', () => {
    // A had 4 points over a two-song ballot in each round.
    expect(pair('A', 'B').expected).toBeCloseTo(4, 6);
    expect(pair('A', 'C').expected).toBeCloseTo(4, 6);
  });

  it('reports affinity relative to that even spread', () => {
    expect(pair('A', 'B').affinity).toBeCloseTo(1.75, 6);
    expect(pair('A', 'C').affinity).toBeCloseTo(0.25, 6);
    expect(pair('C', 'A').affinity).toBeCloseTo(2, 6);
    expect(pair('C', 'B').affinity).toBe(0);
  });

  it('caps the maximum a voter could have given by budget and per-song limit', () => {
    // Both rounds: 4 points of budget, observed cap 4, one song available.
    expect(pair('A', 'B').maxPossible).toBe(8);
    expect(pair('C', 'A').maxPossible).toBe(4); // C voted in one round only
  });

  it('reports devotion as a share of that ceiling, bounded at 1', () => {
    expect(pair('A', 'B').devotion).toBeCloseTo(7 / 8, 6);
    expect(pair('A', 'C').devotion).toBeCloseTo(1 / 8, 6);
    expect(pair('C', 'A').devotion).toBe(1); // gave everything it could
    expect(pair('C', 'B').devotion).toBe(0);
    for (const p of stats.pairs) {
      expect(p.devotion).toBeGreaterThanOrEqual(0);
      expect(p.devotion).toBeLessThanOrEqual(1);
    }
  });

  it('never records a self-pair', () => {
    expect(stats.pairs.some((p) => p.voterId === p.targetId)).toBe(false);
  });
});

describe('timelines', () => {
  const line = (name: string) => stats.timelines.get(player(name).playerId)!;

  it('accumulates each round score', () => {
    expect(line('A').map((p) => p.points)).toEqual([6, 1]);
    expect(line('A').map((p) => p.cumulative)).toEqual([6, 7]);
    expect(line('B').map((p) => p.cumulative)).toEqual([3, 7]);
    expect(line('C').map((p) => p.cumulative)).toEqual([3, 6]);
  });

  it('gives tied players the same rank', () => {
    expect(line('B').at(0)!.rank).toBe(2);
    expect(line('C').at(0)!.rank).toBe(2);
    expect(line('A').at(1)!.rank).toBe(1);
    expect(line('B').at(1)!.rank).toBe(1);
    expect(line('C').at(1)!.rank).toBe(3);
  });

  it('covers every round for every player', () => {
    for (const p of stats.players) {
      expect(stats.timelines.get(p.playerId)).toHaveLength(2);
    }
  });
});

describe('floored scoring', () => {
  it('never lets a downvoted song drag a running total below its previous value', () => {
    const csv = `[rounds]
Position,Title
1,R1

[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,A,SA,ArtA,s1
R1,B,SB,ArtB,s2

[votes]
Round,Voter,Submitter,Song Title,Points
R1,B,A,SA,-5
R1,A,B,SB,2
`;
    const s = computeStats(parseLeague([{ name: 'd.csv', text: csv }]));
    const sa = s.songs.find((x) => x.title === 'SA')!;
    expect(sa.net).toBe(-5); // raw net is kept for ranking
    const a = s.players.find((p) => p.name === 'A')!;
    const timeline = s.timelines.get(a.playerId)!;
    expect(timeline[0].points).toBe(0); // but the score floors at zero
    expect(timeline[0].cumulative).toBe(0);
  });

  it('marks a song with both up and down votes as polarizing', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,A,SA,ArtA,s1
R1,B,SB,ArtB,s2
R1,C,SC,ArtC,s3

[votes]
Round,Voter,Submitter,Song Title,Points
R1,B,A,SA,4
R1,C,A,SA,-2
R1,A,B,SB,3
`;
    const s = computeStats(parseLeague([{ name: 'd.csv', text: csv }]));
    expect(s.songs.find((x) => x.title === 'SA')!.polarizing).toBe(true);
    expect(s.songs.find((x) => x.title === 'SB')!.polarizing).toBe(false);
    expect(s.songs.find((x) => x.title === 'SA')!.net).toBe(2);
  });
});

describe('rounds without vote data', () => {
  // A league that hides its vote breakdown, or whose rounds are still open.
  const csv = `[rounds]
Position,Title
1,R1
2,R2

[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Aaron,SA,ArtA,s1
R1,Zoe,SZ,ArtZ,s2
R2,Aaron,TA,ArtA,s3
R2,Zoe,TZ,ArtZ,s4

[votes]
Round,Voter,Submitter,Song Title,Points
`;
  const s = computeStats(parseLeague([{ name: 'hidden.csv', text: csv }]));
  const p = (name: string) => s.players.find((x) => x.name === name)!;

  it('charges nobody a forfeit when there is no evidence anyone skipped', () => {
    expect(s.hasVotes).toBe(false);
    for (const player of s.players) {
      expect(player.roundsMissedVoting).toBe(0);
      expect(player.forfeitedUpvotes).toBe(0);
    }
  });

  it('does not report skipped voting as a superlative', () => {
    const labels = s.superlatives.map((x) => x.label);
    expect(labels).not.toContain('Most rounds skipped voting');
    expect(labels).not.toContain('Most forfeited by not voting');
  });

  it('crowns no winner from an unranked round', () => {
    expect(s.rounds.every((r) => r.winnerTrackId === undefined)).toBe(true);
    expect(s.songs.every((song) => song.roundRank === 0)).toBe(true);
    expect(p('Aaron').wins).toBe(0);
    expect(p('Zoe').wins).toBe(0);
    expect(p('Aaron').lastPlaces).toBe(0);
  });

  it('lists nobody as a non-voter', () => {
    expect(s.rounds.every((r) => r.nonVoters.length === 0)).toBe(true);
  });

  it('leaves taste alignment undefined rather than reading as contrarian', () => {
    for (const player of s.players) expect(player.tasteAlignment).toBeUndefined();
    const labels = s.superlatives.map((x) => x.label);
    expect(labels).not.toContain('Biggest contrarian');
    expect(labels).not.toContain('Most mainstream taste');
  });
});

describe('season totals', () => {
  // Aaron's two songs net +10 and -6; Zoe's net +5 and +2.
  const csv = `[rounds]
Position,Title
1,R1
2,R2

[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Aaron,SA,ArtA,s1
R1,Zoe,SZ,ArtZ,s2
R2,Aaron,TA,ArtA,s3
R2,Zoe,TZ,ArtZ,s4

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Zoe,Aaron,SA,10
R1,Aaron,Zoe,SZ,5
R2,Zoe,Aaron,TA,-6
R2,Aaron,Zoe,TZ,2
`;
  const s = computeStats(parseLeague([{ name: 'floor.csv', text: csv }]));
  const p = (name: string) => s.players.find((x) => x.name === name)!;

  it('keeps the raw net for judging how the room felt', () => {
    expect(p('Aaron').pointsReceived).toBe(4); // 10 - 6
    expect(p('Zoe').pointsReceived).toBe(7);
  });

  it('floors each song at zero for the league score, as Music League does', () => {
    expect(p('Aaron').pointsCounted).toBe(10); // the -6 song contributes 0
    expect(p('Zoe').pointsCounted).toBe(7);
  });

  it('agrees with the standings timeline it is displayed beside', () => {
    for (const player of s.players) {
      const line = s.timelines.get(player.playerId)!;
      expect(line.at(-1)!.cumulative).toBe(player.pointsCounted);
    }
  });

  it('ranks the leader by the floored total, not the raw net', () => {
    const byFloored = [...s.players].sort((a, b) => b.pointsCounted - a.pointsCounted);
    expect(byFloored[0].name).toBe('Aaron'); // 10 vs 7
    const byRaw = [...s.players].sort((a, b) => b.pointsReceived - a.pointsReceived);
    expect(byRaw[0].name).toBe('Zoe'); // 7 vs 4 — the two disagree
  });
});

describe('taste alignment ties', () => {
  it('gives songs the room scored equally the same percentile', () => {
    // Bo and Cleo's songs are level on everyone else's votes, so Aaron
    // backing one of them is neither mainstream nor contrarian.
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Aaron,SA,A,s1
R1,Bo,SB,B,s2
R1,Cleo,SC,C,s3

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Aaron,Bo,SB,4
R1,Bo,Cleo,SC,3
R1,Cleo,Bo,SB,3
`;
    const s = computeStats(parseLeague([{ name: 't.csv', text: csv }]));
    const aaron = s.players.find((p) => p.name === 'Aaron')!;
    // Excluding Aaron's own 4 points, SB and SC both sit on 3.
    expect(aaron.tasteAlignment).toBeCloseTo(0.5, 6);
  });
});

describe('anonymous songs and expectation', () => {
  it('does not let unattributable points inflate everyone else s expectation', () => {
    // Dana spends 6 points, but 3 of them land on an anonymous song. Only the
    // 3 spent on attributable songs may be apportioned.
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Dana,SD,D,s1
R1,Eve,SE,E,s2
R1,[Anonymous],SX,X,s3

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Dana,Eve,SE,3
R1,Dana,,SX,3
`;
    const s = computeStats(parseLeague([{ name: 'a.csv', text: csv }]));
    const danaToEve = s.pairs.find((p) => p.voterName === 'Dana' && p.targetName === 'Eve')!;
    // Eve was the whole attributable ballot, so an even spread predicts all 3.
    expect(danaToEve.expected).toBeCloseTo(3, 6);
    expect(danaToEve.affinity).toBeCloseTo(1, 6);
  });
});

describe('mutual admiration', () => {
  /**
   * Greggo gives t33nwitch 15 and gets 1 back; Ada and Bo trade evenly.
   * Ranking on the combined total would crown the lopsided pair, which is the
   * definition of unrequited rather than mutual.
   */
  const csv = `[rounds]
Position,Title
1,R1
2,R2
3,R3

[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Greggo,G1,x,s1
R1,Teen,T1,x,s2
R1,Ada,A1,x,s3
R1,Bo,B1,x,s4
R2,Greggo,G2,x,s5
R2,Teen,T2,x,s6
R2,Ada,A2,x,s7
R2,Bo,B2,x,s8
R3,Greggo,G3,x,s9
R3,Teen,T3,x,s10
R3,Ada,A3,x,s11
R3,Bo,B3,x,s12

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Greggo,Teen,T1,5
R2,Greggo,Teen,T2,5
R3,Greggo,Teen,T3,5
R1,Teen,Greggo,G1,1
R2,Teen,Ada,A2,4
R3,Teen,Ada,A3,4
R1,Ada,Bo,B1,4
R2,Ada,Bo,B2,4
R3,Ada,Bo,B3,4
R1,Bo,Ada,A1,4
R2,Bo,Ada,A2,3
R3,Bo,Ada,A3,4
`;
  const s = computeStats(parseLeague([{ name: 'm.csv', text: csv }]));
  const superlative = (label: string) => s.superlatives.find((x) => x.label === label);

  it('crowns the pair who actually reciprocated', () => {
    const mutual = superlative('Mutual admiration society')!;
    expect(mutual.value).toBe('Ada ↔ Bo');
  });

  it('excludes a lopsided pair from mutual admiration entirely', () => {
    const mutual = superlative('Mutual admiration society')!;
    const shown = [mutual.value, ...(mutual.runnersUp ?? []).map((r) => r.value)];
    for (const entry of shown) {
      expect(entry).not.toContain('Greggo');
    }
  });

  it('still names the lopsided pair as the most unrequited', () => {
    const unrequited = superlative('Most unrequited')!;
    expect(unrequited.value).toBe('Greggo → Teen');
    expect(unrequited.subject).toContain('gave 15');
  });

  it('never lists one pair as both mutual and most unrequited', () => {
    const mutual = superlative('Mutual admiration society');
    const unrequited = superlative('Most unrequited');
    if (!mutual || !unrequited) return;
    const asPair = (value: string) =>
      value
        .split(/ ↔ | → /)
        .map((n) => n.trim())
        .sort()
        .join('|');
    const mutualPairs = [mutual.value, ...(mutual.runnersUp ?? []).map((r) => r.value)].map(asPair);
    expect(mutualPairs).not.toContain(asPair(unrequited.value));
  });

  it('holds that invariant for the demo league too', () => {
    const demo = computeStats(parseLeague([{ name: 'demo.csv', text: buildDemoCsv() }]));
    const mutual = demo.superlatives.find((x) => x.label === 'Mutual admiration society')!;
    const unrequited = demo.superlatives.find((x) => x.label === 'Most unrequited')!;
    const asPair = (value: string) =>
      value
        .split(/ ↔ | → /)
        .map((n) => n.trim())
        .sort()
        .join('|');
    const mutualPairs = [mutual.value, ...(mutual.runnersUp ?? []).map((r) => r.value)].map(asPair);
    expect(mutualPairs).not.toContain(asPair(unrequited.value));
  });

  it('says how evenly the pair traded', () => {
    const mutual = superlative('Mutual admiration society')!;
    expect(mutual.subject).toMatch(/^\d+ pts traded$/);
    expect((mutual.meta ?? []).join(' ')).toMatch(/near enough even/);
  });
});

describe('net affinity', () => {
  // Two voters give the target a single point each; one of them also spends
  // five downvotes on him. On upvotes alone they are indistinguishable.
  const csv = `[rounds]
Position,Title
1,R1
2,R2

[submissions]
Round,Title,Artist,Submitter
1,Target Song,Band,Greg
1,Filler,Band,Ada
2,Target Two,Band,Greg
2,Filler Two,Band,Ada

[votes]
Round,Title,Voter,Points
1,Target Song,Warm,1
1,Target Song,Sour,1
1,Filler,Warm,2
1,Filler,Sour,2
2,Target Two,Sour,-5
2,Filler Two,Warm,3
2,Filler Two,Sour,1
`;
  const s = computeStats(parseLeague([{ name: 'net.csv', text: csv }]));
  const toGreg = (voter: string) =>
    s.pairs.find((p) => p.voterName === voter && p.targetName === 'Greg')!;

  it('counts downvotes against a voter, where affinity does not', () => {
    const warm = toGreg('Warm');
    const sour = toGreg('Sour');
    // Identical on upvotes: this is exactly why affinity alone misled.
    expect(sour.upvotes).toBe(warm.upvotes);
    expect(sour.downvotes).toBe(5);
    expect(warm.downvotes).toBe(0);
    expect(sour.netAffinity).toBeLessThan(warm.netAffinity);
    expect(sour.netAffinity).toBeLessThan(0);
  });

  it('keeps affinity itself on upvotes, so the two are not conflated', () => {
    const sour = toGreg('Sour');
    // Affinity's numerator is upvotes alone: it stays positive for a voter
    // whose net contribution was deeply negative.
    expect(sour.affinity).toBeCloseTo(sour.upvotes / sour.expected, 6);
    expect(sour.affinity).toBeGreaterThan(0);
    expect(sour.net).toBeLessThan(0);
  });

  it('agrees with net points on the sign', () => {
    for (const p of s.pairs) {
      if (p.expected <= 0) continue;
      expect(Math.sign(p.netAffinity)).toBe(Math.sign(p.net));
    }
  });
});

describe('superlative shape', () => {
  const shaped = computeStats(parseLeague([{ name: 'demo.csv', text: buildDemoCsv() }]));

  it('shows a winner and at most two runners-up', () => {
    for (const superlative of shaped.superlatives) {
      expect((superlative.runnersUp ?? []).length).toBeLessThanOrEqual(2);
    }
    // At least one card should actually have runners-up to show.
    expect(shaped.superlatives.some((x) => (x.runnersUp ?? []).length === 2)).toBe(true);
  });

  it('never repeats the same entry among its own runners-up', () => {
    for (const superlative of shaped.superlatives) {
      // The figure alone can legitimately tie — three songs can all reach 100%
      // breadth — and two songs can even share a title across rounds, so
      // identity is the whole entry.
      const identity = (entry: { value: string; subject?: string; meta?: string[] }) =>
        [entry.value, entry.subject ?? '', (entry.meta ?? []).join('|')].join('~');
      const rest = (superlative.runnersUp ?? []).map(identity);
      expect(rest).not.toContain(identity(superlative));
      expect(new Set(rest).size).toBe(rest.length);
    }
  });

  it('separates the figure, the subject and the supporting detail', () => {
    // One prose blob per card was unreadable; each part is now its own field.
    for (const superlative of shaped.superlatives) {
      expect(superlative.value.length).toBeGreaterThan(0);
      expect(superlative.value.length).toBeLessThan(40);
      for (const item of superlative.meta ?? []) {
        // Meta items are chips, not sentences.
        expect(item.length).toBeLessThan(70);
        expect(item.endsWith('.')).toBe(false);
      }
    }
  });
});

describe('taste alignment superlatives', () => {
  const s = computeStats(parseLeague([{ name: 'demo.csv', text: buildDemoCsv() }]));
  const superlative = (label: string) => s.superlatives.find((x) => x.label === label)!;

  it('gives the contrarian card the larger number, so the winner looks like one', () => {
    const contrarian = superlative('Biggest contrarian');
    const winner = Number((contrarian.value.match(/(\d+)%/) ?? [])[1]);
    const runnersUp = (contrarian.runnersUp ?? []).map((r) =>
      Number((r.value.match(/(\d+)%/) ?? [])[1]),
    );
    for (const other of runnersUp) expect(winner).toBeGreaterThanOrEqual(other);
  });

  it('keeps the mainstream card highest-first as well', () => {
    const mainstream = superlative('Most mainstream taste');
    const winner = Number((mainstream.value.match(/(\d+)%/) ?? [])[1]);
    const runnersUp = (mainstream.runnersUp ?? []).map((r) =>
      Number((r.value.match(/(\d+)%/) ?? [])[1]),
    );
    for (const other of runnersUp) expect(winner).toBeGreaterThanOrEqual(other);
  });

  it('explains what the percentage measures', () => {
    expect((superlative('Biggest contrarian').meta ?? []).join(' ')).toMatch(/percentile/);
    // Runners-up share the winner's chips, so they must not claim a rank.
    for (const r of superlative('Biggest contrarian').runnersUp ?? []) {
      expect((r.meta ?? []).join(' ')).not.toContain('lowest in the league');
    }
    expect((superlative('Most mainstream taste').meta ?? []).join(' ')).toMatch(/50% is average/);
  });

  it('describes the two directions with opposite wording', () => {
    expect(superlative('Biggest contrarian').value).toContain('against the room');
    expect(superlative('Most mainstream taste').value).toContain('with the room');
  });
});

describe('empty and degenerate input', () => {
  it('handles a league with no votes at all', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist
R1,A,SA,ArtA
`;
    const s = computeStats(parseLeague([{ name: 'd.csv', text: csv }]));
    expect(s.hasVotes).toBe(false);
    expect(s.players).toHaveLength(1);
    expect(s.players[0].pointsReceived).toBe(0);
    expect(s.superlatives.every((x) => typeof x.value === 'string')).toBe(true);
  });

  it('handles a completely empty file without throwing', () => {
    const s = computeStats(parseLeague([{ name: 'empty.csv', text: '' }]));
    expect(s.songs).toEqual([]);
    expect(s.players).toEqual([]);
    expect(s.superlatives).toEqual([]);
  });

  it('produces no NaN anywhere in the demo league', () => {
    const s = computeStats(parseLeague([{ name: 'demo.csv', text: buildDemoCsv() }]));
    const numbers: number[] = [];
    for (const p of s.players) {
      for (const v of Object.values(p)) if (typeof v === 'number') numbers.push(v);
    }
    for (const song of s.songs) {
      for (const v of Object.values(song)) if (typeof v === 'number') numbers.push(v);
    }
    for (const pr of s.pairs) {
      for (const v of Object.values(pr)) if (typeof v === 'number') numbers.push(v);
    }
    expect(numbers.every((n) => Number.isFinite(n))).toBe(true);
  });
});

describe('demo league integration', () => {
  const s = computeStats(parseLeague([{ name: 'demo.csv', text: buildDemoCsv() }]));

  it('parses the full synthetic export', () => {
    expect(s.league.rounds).toHaveLength(6);
    expect(s.players).toHaveLength(7);
    expect(s.hasVotes).toBe(true);
    expect(s.league.standings).toHaveLength(7);
  });

  it('infers competitive scoring from its official standings', () => {
    expect(s.scoring).toBe('competitive');
    expect(s.scoringInferred).toBe(true);
  });

  it('reproduces the official standings exactly under that model', () => {
    for (const row of s.league.standings) {
      const player = s.players.find((p) => p.playerId === row.playerId)!;
      expect(player.breakdown.total).toBe(row.points);
    }
  });

  it('respects the vote budget: every voter spends ten upvote points a round', () => {
    for (const round of s.rounds) {
      for (const voterId of round.voters) {
        const spent = s.league.votes
          .filter((v) => v.roundId === round.round.id && v.voterId === voterId && v.points > 0)
          .reduce((a, v) => a + v.points, 0);
        expect(spent).toBe(10);
      }
    }
  });

  it('never lets anyone vote on their own song', () => {
    const owner = new Map(s.league.submissions.map((x) => [x.trackId, x.submitterId]));
    for (const v of s.league.votes) expect(owner.get(v.trackId)).not.toBe(v.voterId);
  });

  it('surfaces the planted superfan relationship', () => {
    // Ada was wired to favour Bo heavily.
    const adaToBo = s.pairs.find((p) => p.voterName === 'Ada' && p.targetName === 'Bo')!;
    const adaAvg =
      s.pairs.filter((p) => p.voterName === 'Ada').reduce((a, p) => a + p.affinity, 0) /
      s.pairs.filter((p) => p.voterName === 'Ada').length;
    expect(adaToBo.affinity).toBeGreaterThan(adaAvg);
    expect(adaToBo.affinity).toBeGreaterThan(1);
    expect(adaToBo.devotion).toBe(1); // maxed out on Bo every single round
  });

  it('ranks the season-long superfan above a short-lived maximiser', () => {
    // Gus also maxed out on Esme, but only had two chances to do it. Affinity
    // alone would put him first because his ballots were smaller.
    const gusToEsme = s.pairs.find((p) => p.voterName === 'Gus' && p.targetName === 'Esme')!;
    const adaToBo = s.pairs.find((p) => p.voterName === 'Ada' && p.targetName === 'Bo')!;
    expect(gusToEsme.affinity).toBeGreaterThan(adaToBo.affinity);
    expect(gusToEsme.devotion).toBe(1);
    expect(adaToBo.devotion).toBe(1);
    const superfan = s.superlatives.find((x) => x.label === 'Biggest superfan')!;
    expect(superfan.value).toBe('Ada → Bo');
  });

  it('surfaces the planted cold shoulder', () => {
    const adaToGus = s.pairs.find((p) => p.voterName === 'Ada' && p.targetName === 'Gus')!;
    expect(adaToGus.affinity).toBeLessThan(1);
  });

  it('surfaces the planted serial non-voter', () => {
    const gus = s.players.find((p) => p.name === 'Gus')!;
    expect(gus.roundsMissedVoting).toBe(3);
    expect(gus.forfeitedUpvotes).toBeGreaterThan(0);
    const worst = [...s.players].sort((a, b) => b.forfeitedUpvotes - a.forfeitedUpvotes)[0];
    expect(worst.name).toBe('Gus');
  });

  it('records downvotes against the planted target', () => {
    const received = s.players.find((p) => p.name === 'Gus')!.downvotesReceived;
    expect(received).toBeGreaterThan(0);
  });

  it('builds a superlative for every headline question asked of it', () => {
    const labels = s.superlatives.map((x) => x.label);
    for (const expected of [
      'Biggest single haul',
      'Widest appeal',
      'Most divisive',
      'Biggest superfan',
      'Coldest shoulder',
      'Most forfeited by not voting',
      'Most rounds skipped voting',
      'Arch-nemesis',
      'Most mainstream taste',
      'Biggest contrarian',
      'Mutual admiration society',
      'Most unrequited',
    ]) {
      expect(labels).toContain(expected);
    }
  });

  it('tracks a cumulative score for every player across every round', () => {
    for (const p of s.players) {
      const line = s.timelines.get(p.playerId)!;
      expect(line).toHaveLength(6);
      for (let i = 1; i < line.length; i += 1) {
        expect(line[i].cumulative).toBeGreaterThanOrEqual(line[i - 1].cumulative);
      }
    }
  });

  it('counts the repeated artist in the demo data', () => {
    const top = s.artistCounts[0];
    expect(top.count).toBeGreaterThan(1);
  });
});
