import { describe, expect, it } from 'vitest';
import { parseLeague } from '../lib/parse';
import { computeStats } from '../lib/stats';

/**
 * A non-voter whose song would otherwise win the round.
 *
 * Cara submits the best-liked song of R1 (14 points) but casts no votes.
 * In Competitive Mode she forfeits those upvotes and keeps a downvote, so
 * Dan's 9-point song wins the round instead.
 */
const CSV = `[rounds]
Position,Title
1,R1
2,R2

[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Cara,Released,ArtC,s1
R1,Dan,Shine,ArtD,s2
R1,Eve,Friends,ArtE,s3
R2,Cara,Second,ArtC,s4
R2,Dan,Encore,ArtD,s5
R2,Eve,Closer,ArtE,s6

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Dan,Cara,Released,8
R1,Eve,Cara,Released,6
R1,Eve,Dan,Shine,5
R1,Dan,Eve,Friends,2
R2,Cara,Dan,Encore,4
R2,Dan,Cara,Second,3
R2,Eve,Dan,Encore,5
R2,Dan,Eve,Closer,1
R2,Eve,Cara,Second,2
`;

/** R1 also carries a downvote against Cara, which survives forfeiture. */
const WITH_DOWNVOTE = CSV.replace(
  'R1,Dan,Eve,Friends,2',
  'R1,Dan,Eve,Friends,2\nR1,Eve,Cara,Released,-3',
);

const league = () => parseLeague([{ name: 'x.csv', text: CSV }]);
const competitive = computeStats(league(), { scoring: 'competitive' });
const friendly = computeStats(league(), { scoring: 'friendly' });

const song = (s: typeof competitive, title: string) => s.songs.find((x) => x.title === title)!;
const player = (s: typeof competitive, name: string) => s.players.find((x) => x.name === name)!;
const round = (s: typeof competitive, name: string) =>
  s.rounds.find((r) => r.round.name === name)!;

describe('forfeiture detection', () => {
  it('flags songs whose submitter skipped voting that round', () => {
    // Cara voted in R2 only.
    expect(song(competitive, 'Released').forfeited).toBe(true);
    expect(song(competitive, 'Second').forfeited).toBe(false);
    expect(song(competitive, 'Shine').forfeited).toBe(false);
  });

  it('flags the same songs regardless of scoring model', () => {
    expect(song(friendly, 'Released').forfeited).toBe(true);
  });

  it('never flags a song in a round with no vote data', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist
R9,Cara,Lonely,Art

[votes]
Round,Voter,Submitter,Song Title,Points
`;
    const s = computeStats(parseLeague([{ name: 'y.csv', text: csv }]), {
      scoring: 'competitive',
    });
    expect(s.songs[0].forfeited).toBe(false);
  });
});

describe('competitive scoring', () => {
  it('withholds the upvotes a forfeited song earned', () => {
    const released = song(competitive, 'Released');
    expect(released.upvotes).toBe(14); // the room really did like it
    expect(released.net).toBe(14); // raw verdict is preserved
    expect(released.effectiveNet).toBe(0); // but nothing was counted
  });

  it('still applies downvotes to a forfeited song', () => {
    const s = computeStats(parseLeague([{ name: 'z.csv', text: WITH_DOWNVOTE }]), {
      scoring: 'competitive',
    });
    const released = song(s, 'Released');
    expect(released.upvotes).toBe(14);
    expect(released.downvotes).toBe(3);
    // Upvotes gone, downvote kept.
    expect(released.effectiveNet).toBe(-3);
  });

  it('does not crown a forfeited song as the round winner', () => {
    // The reported bug: Released led on raw points but never scored.
    const winner = round(competitive, 'R1').winnerTrackId;
    expect(winner).toBe(song(competitive, 'Shine').trackId);
    expect(song(competitive, 'Shine').roundRank).toBe(1);
    expect(song(competitive, 'Released').roundRank).toBe(3);
  });

  it('excludes forfeited points from the season total', () => {
    const cara = player(competitive, 'Cara');
    expect(cara.upvotesReceived).toBe(19); // 14 in R1 plus 5 in R2
    expect(cara.forfeitedUpvotes).toBe(14);
    expect(cara.pointsCounted).toBe(5); // only R2 counted
  });

  it('excludes forfeited points from the standings timeline', () => {
    const line = competitive.timelines.get(player(competitive, 'Cara').playerId)!;
    expect(line.map((p) => p.points)).toEqual([0, 5]);
    expect(line.at(-1)!.cumulative).toBe(5);
  });

  it('does not credit a round win that was forfeited', () => {
    expect(player(competitive, 'Cara').wins).toBe(0);
    expect(player(competitive, 'Dan').wins).toBe(2);
  });

  it('reports the biggest haul that never counted', () => {
    const lost = competitive.superlatives.find((s) => s.label === 'Biggest haul never counted');
    expect(lost).toBeDefined();
    expect(lost!.value).toBe('14 pts forfeited');
  });

  it('keeps the biggest-haul superlative to points that were actually scored', () => {
    const haul = competitive.superlatives.find((s) => s.label === 'Biggest single haul')!;
    // Released's 14 was forfeited, so Dan's Encore (9) is the real best.
    expect(haul.value).toBe('9 pts');
  });
});

describe('friendly scoring', () => {
  it('counts every point a song earned, voted or not', () => {
    expect(song(friendly, 'Released').effectiveNet).toBe(14);
    expect(player(friendly, 'Cara').pointsCounted).toBe(19);
  });

  it('lets the best-liked song win even if its submitter skipped voting', () => {
    expect(round(friendly, 'R1').winnerTrackId).toBe(song(friendly, 'Released').trackId);
    expect(player(friendly, 'Cara').wins).toBe(1);
  });

  it('still reports what non-voting would have cost', () => {
    expect(player(friendly, 'Cara').forfeitedUpvotes).toBe(14);
    const forfeit = friendly.superlatives.find(
      (s) => s.label === 'Most forfeited by not voting',
    )!;
    expect((forfeit.meta ?? []).join(' ')).toMatch(/Competitive Mode/);
  });

  it('does not claim a haul was lost when nothing was', () => {
    expect(
      friendly.superlatives.some((s) => s.label === 'Biggest haul never counted'),
    ).toBe(false);
  });
});

describe('choosing a scoring model', () => {
  const withStandings = (caraPoints: number) => `${CSV}
[standings]
Position,Name,Points,Rounds Played
1,Dan,14,2
2,Cara,${caraPoints},2
3,Eve,3,2
`;

  it('infers competitive scoring when it reproduces the official standings', () => {
    const s = computeStats(parseLeague([{ name: 'a.csv', text: withStandings(5) }]));
    expect(s.scoring).toBe('competitive');
    expect(s.scoringInferred).toBe(true);
  });

  it('infers friendly scoring when that is what the standings show', () => {
    const s = computeStats(parseLeague([{ name: 'b.csv', text: withStandings(19) }]));
    expect(s.scoring).toBe('friendly');
    expect(s.scoringInferred).toBe(true);
  });

  it('assumes friendly, without claiming inference, when there are no standings', () => {
    const s = computeStats(league());
    expect(s.scoring).toBe('friendly');
    expect(s.scoringInferred).toBe(false);
  });

  it('always honours an explicit choice over the standings', () => {
    const s = computeStats(parseLeague([{ name: 'c.csv', text: withStandings(19) }]), {
      scoring: 'competitive',
    });
    expect(s.scoring).toBe('competitive');
    expect(s.scoringInferred).toBe(false);
  });
});

describe('score breakdown', () => {
  const reconciles = (b: {
    upvotes: number;
    downvotes: number;
    forfeited: number;
    absorbed: number;
    total: number;
  }) => b.upvotes - b.downvotes - b.forfeited + b.absorbed;

  it('reconciles for a plain song with no downvotes', () => {
    const s = song(competitive, 'Shine');
    expect(s.breakdown).toEqual({
      upvotes: 5,
      downvotes: 0,
      forfeited: 0,
      absorbed: 0,
      total: 5,
    });
    expect(reconciles(s.breakdown)).toBe(s.breakdown.total);
  });

  it('attributes a forfeited song entirely to the forfeit', () => {
    const s = song(competitive, 'Released');
    expect(s.breakdown).toEqual({
      upvotes: 14,
      downvotes: 0,
      forfeited: 14,
      absorbed: 0,
      total: 0,
    });
    expect(reconciles(s.breakdown)).toBe(0);
  });

  it('shows downvotes that the zero floor discarded rather than losing them', () => {
    // 2 upvotes against 5 downvotes: only 2 can be deducted, 3 are absorbed.
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Cara,Sunk,ArtC,s1
R1,Dan,Fine,ArtD,s2

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Dan,Cara,Sunk,2
R1,Cara,Dan,Fine,4
R1,Cara,Cara,Sunk,0
R1,Dan,Dan,Fine,0
`;
    const withDown = csv.replace(
      'R1,Dan,Cara,Sunk,2',
      'R1,Dan,Cara,Sunk,2\nR1,Dan,Cara,Sunk,-5',
    );
    const s = computeStats(parseLeague([{ name: 'f.csv', text: withDown }]), {
      scoring: 'competitive',
    });
    const sunk = s.songs.find((x) => x.title === 'Sunk')!;
    expect(sunk.breakdown).toEqual({
      upvotes: 2,
      downvotes: 5,
      forfeited: 0,
      absorbed: 3,
      total: 0,
    });
    expect(reconciles(sunk.breakdown)).toBe(0);
    expect(sunk.net).toBe(-3); // raw verdict still available
  });

  it('sums song breakdowns into the player total', () => {
    for (const p of competitive.players) {
      expect(p.breakdown.total).toBe(p.pointsCounted);
      expect(reconciles(p.breakdown)).toBe(p.breakdown.total);
    }
  });

  it('accounts for every point cast in the league', () => {
    const cast = competitive.rounds.reduce((a, r) => a + r.totalUpvotes, 0);
    const received = competitive.players.reduce((a, p) => a + p.breakdown.upvotes, 0);
    // Every upvote point cast lands on somebody's song.
    expect(received).toBe(cast);
  });

  it('carries no forfeit term under friendly scoring', () => {
    for (const p of friendly.players) {
      expect(p.breakdown.forfeited).toBe(0);
      expect(reconciles(p.breakdown)).toBe(p.breakdown.total);
    }
    expect(player(friendly, 'Cara').breakdown.total).toBe(19);
  });

  it('reports the counted score per song, floored at zero', () => {
    expect(song(competitive, 'Released').countedScore).toBe(0);
    expect(song(competitive, 'Shine').countedScore).toBe(5);
    for (const s of competitive.songs) {
      expect(s.countedScore).toBe(Math.max(0, s.effectiveNet));
    }
  });
});
describe('flooring', () => {
  /** Cara's song takes 5 downvotes against 2 upvotes. */
  const csv = `[rounds]
Position,Title
1,R1

[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Cara,Sunk,ArtC,s1
R1,Dan,Fine,ArtD,s2

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Dan,Cara,Sunk,2
R1,Dan,Cara,Sunk,-5
R1,Cara,Dan,Fine,4
`;
  const floored = computeStats(parseLeague([{ name: 'a.csv', text: csv }]), {
    scoring: 'friendly',
    flooring: 'song',
  });
  const unfloored = computeStats(parseLeague([{ name: 'b.csv', text: csv }]), {
    scoring: 'friendly',
    flooring: 'none',
  });

  it('stops a song at zero when the league floors', () => {
    const sunk = floored.songs.find((s) => s.title === 'Sunk')!;
    expect(sunk.countedScore).toBe(0);
    expect(sunk.breakdown.absorbed).toBe(3);
    expect(floored.players.find((p) => p.name === 'Cara')!.pointsCounted).toBe(0);
  });

  it('lets a song go negative when the league does not floor', () => {
    const sunk = unfloored.songs.find((s) => s.title === 'Sunk')!;
    expect(sunk.countedScore).toBe(-3);
    expect(sunk.breakdown.absorbed).toBe(0);
    expect(unfloored.players.find((p) => p.name === 'Cara')!.pointsCounted).toBe(-3);
  });

  it('reconciles either way', () => {
    const check = (b: {
      upvotes: number;
      downvotes: number;
      forfeited: number;
      absorbed: number;
      total: number;
    }) => expect(b.upvotes - b.downvotes - b.forfeited + b.absorbed).toBe(b.total);
    for (const s of [...floored.songs, ...unfloored.songs]) check(s.breakdown);
    for (const p of [...floored.players, ...unfloored.players]) check(p.breakdown);
  });

  it('does not change who won the round', () => {
    // Ranking uses the raw score, so the floor cannot reorder anything.
    expect(floored.rounds[0].winnerTrackId).toBe(unfloored.rounds[0].winnerTrackId);
    expect(floored.songs.map((s) => s.roundRank)).toEqual(
      unfloored.songs.map((s) => s.roundRank),
    );
  });

  it('lets a standings timeline fall when scores can go negative', () => {
    const cara = unfloored.players.find((p) => p.name === 'Cara')!;
    expect(unfloored.timelines.get(cara.playerId)!.at(-1)!.cumulative).toBe(-3);
  });

  it('keeps a forfeited song at zero when floored, negative when not', () => {
    const forfeitCsv = `[rounds]
Position,Title
1,R1

[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Cara,Gone,ArtC,s1
R1,Dan,Here,ArtD,s2

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Dan,Cara,Gone,6
R1,Dan,Cara,Gone,-2
`;
    const f = computeStats(parseLeague([{ name: 'c.csv', text: forfeitCsv }]), {
      scoring: 'competitive',
      flooring: 'song',
    });
    const n = computeStats(parseLeague([{ name: 'd.csv', text: forfeitCsv }]), {
      scoring: 'competitive',
      flooring: 'none',
    });
    // Cara never voted, so her 6 upvotes are forfeited either way.
    expect(f.songs.find((s) => s.title === 'Gone')!.countedScore).toBe(0);
    expect(n.songs.find((s) => s.title === 'Gone')!.countedScore).toBe(-2);
    expect(f.songs.find((s) => s.title === 'Gone')!.breakdown.forfeited).toBe(6);
    expect(n.songs.find((s) => s.title === 'Gone')!.breakdown.forfeited).toBe(6);
  });

  it('infers the flooring rule from official standings', () => {
    const negative = `${csv}
[standings]
Position,Name,Points,Rounds Played
1,Dan,4,1
2,Cara,-3,1
`;
    const s = computeStats(parseLeague([{ name: 'e.csv', text: negative }]));
    expect(s.flooring).toBe('none');
    expect(s.flooringInferred).toBe(true);
    expect(s.players.find((p) => p.name === 'Cara')!.pointsCounted).toBe(-3);
  });

  it('defaults to flooring when nothing says otherwise', () => {
    const s = computeStats(parseLeague([{ name: 'f.csv', text: csv }]));
    expect(s.flooring).toBe('song');
    expect(s.flooringInferred).toBe(false);
  });
});

describe('metrics that describe voting, not scoring', () => {
  it('leaves the room s raw verdict on a forfeited song intact', () => {
    const released = song(competitive, 'Released');
    // Two of two eligible voters backed it; forfeiting does not change that.
    expect(released.breadth).toBe(1);
    expect(released.distinctUpvoters).toBe(2);
    expect(released.upvotes).toBe(14);
  });

  it('leaves affinity between players unchanged by the scoring model', () => {
    const key = (s: typeof competitive) =>
      s.pairs.map((p) => `${p.voterName}>${p.targetName}:${p.upvotes}:${p.affinity.toFixed(4)}`);
    expect(key(competitive)).toEqual(key(friendly));
  });
});
