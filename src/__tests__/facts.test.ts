import { describe, expect, it } from 'vitest';
import { parseLeague } from '../lib/parse';
import { computeStats } from '../lib/stats';
import { headlineFacts } from '../lib/facts';
import { buildDemoCsv } from '../lib/demo';
import { genreReport } from '../lib/genres';
import { sortByRankOrder } from '../components/ui';

const demo = computeStats(parseLeague([{ name: 'demo.csv', text: buildDemoCsv() }]));

describe('headlineFacts', () => {
  it('returns a handful of facts, best first', () => {
    const facts = headlineFacts(demo);
    expect(facts.length).toBeGreaterThanOrEqual(3);
    // At most the limit, plus one song card added for the art.
    expect(facts.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < facts.length; i += 1) {
      // Within the diversity rule, later facts are never more interesting.
      expect(facts[i].interest).toBeLessThanOrEqual(facts[0].interest);
    }
  });

  it('writes a headline and a supporting detail for each', () => {
    for (const fact of headlineFacts(demo)) {
      expect(fact.label.length).toBeGreaterThan(3);
      expect(fact.headline).toMatch(/\.$/);
      expect(fact.detail.length).toBeGreaterThan(20);
    }
  });

  it('adds a song card for the art only when none of the chosen facts already has one', () => {
    const facts = headlineFacts(demo, 4);
    const withArt = facts.filter((f) => f.artId);
    // At least one fact in the final set carries art — either one of the
    // top facts already had a song attached, or a 5th was appended for it.
    expect(withArt.length).toBeGreaterThanOrEqual(1);
    // Never displaces an earned fact: the set is only ever 4 (exactly the
    // limit) or 5 (limit plus one appended card).
    expect([4, 5]).toContain(facts.length);
  });

  it('does not tell more than two stories about the same player', () => {
    const counts = new Map<string, number>();
    for (const fact of headlineFacts(demo, 4)) {
      counts.set(fact.subject, (counts.get(fact.subject) ?? 0) + 1);
    }
    for (const [subject, n] of counts) {
      if (subject === '__league__') continue;
      expect(n).toBeLessThanOrEqual(2);
    }
  });

  it('quantifies what not voting cost, when the league is competitive', () => {
    const fact = headlineFacts(demo, 8).find((f) => f.label === 'The cost of silence');
    expect(fact).toBeDefined();
    // The demo's serial non-voter is Gus.
    expect(fact!.headline).toContain('Gus');
    expect(fact!.detail).toMatch(/would sit \d+(st|nd|rd|th)|never counted/);
  });

  it('says nothing about forfeits under friendly scoring', () => {
    const friendly = computeStats(parseLeague([{ name: 'd.csv', text: buildDemoCsv() }]), {
      scoring: 'friendly',
    });
    const labels = headlineFacts(friendly, 8).map((f) => f.label);
    expect(labels).not.toContain('The cost of silence');
    expect(labels).not.toContain('Best song nobody got credit for');
  });

  it('stays silent when there is nothing to report', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist
R1,Ada,Song,Artist
`;
    const bare = computeStats(parseLeague([{ name: 'e.csv', text: csv }]));
    expect(headlineFacts(bare)).toEqual([]);
  });

  it('reports the collapse without summing signed totals', () => {
    // Three players, each +5 and −4, so every score is 1.
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Ada,A,x,s1
R1,Bo,B,x,s2
R1,Cleo,C,x,s3

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Bo,Ada,A,5
R1,Cleo,Ada,A,-4
R1,Ada,Bo,B,5
R1,Cleo,Bo,B,-4
R1,Ada,Cleo,C,5
R1,Bo,Cleo,C,-4
`;
    const s = computeStats(parseLeague([{ name: 'f.csv', text: csv }]), { flooring: 'none' });
    const fact = headlineFacts(s, 8).find((f) => f.label === 'Mutually assured destruction');
    expect(fact).toBeDefined();
    expect(fact!.headline).toContain('15'); // upvotes cast
    expect(fact!.headline).toContain('12'); // downvotes spent
    expect(fact!.detail).toContain('3 points have survived'); // the three scores of 1
  });

  it('never claims a surviving total below the leader s own score', () => {
    // Signed totals cancel: this league sums to 33 while its leader has 44.
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Win,W,x,s1
R1,Lose,L,x,s2
R1,Mid,M,x,s3

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Lose,Win,W,9
R1,Mid,Win,W,9
R1,Win,Lose,L,1
R1,Mid,Lose,L,-9
R1,Win,Mid,M,1
R1,Lose,Mid,M,-4
`;
    const s = computeStats(parseLeague([{ name: 'g.csv', text: csv }]), { flooring: 'none' });
    const leader = [...s.players].sort((a, b) => b.pointsCounted - a.pointsCounted)[0];
    const signedSum = s.players.reduce((a, p) => a + p.pointsCounted, 0);
    expect(signedSum).toBeLessThan(leader.pointsCounted); // the trap this guards

    const fact = headlineFacts(s, 8).find((f) => f.label === 'Mutually assured destruction');
    if (fact) {
      const claimed = Number((fact.detail.match(/Only (-?\d+) points have survived/) ?? [])[1]);
      expect(claimed).toBeGreaterThanOrEqual(leader.pointsCounted);
    }
  });

  it('flags a winner who outscored the rest of the league combined', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Win,W,x,s1
R1,A,AA,x,s2
R1,B,BB,x,s3
R1,C,CC,x,s4

[votes]
Round,Voter,Submitter,Song Title,Points
R1,A,Win,W,8
R1,B,Win,W,8
R1,C,Win,W,8
R1,Win,A,AA,1
R1,B,A,AA,-4
R1,C,B,BB,-4
R1,A,C,CC,-2
`;
    const s = computeStats(parseLeague([{ name: 'h.csv', text: csv }]), { flooring: 'none' });
    const fact = headlineFacts(s, 8).find((f) => f.label === 'Runaway winner');
    expect(fact).toBeDefined();
    expect(fact!.headline).toContain('Win');
    expect(fact!.headline).toMatch(/other 3 players put together/);
  });
});

describe('genre headline fact', () => {
  /** Enough songs per genre to clear the reliability threshold. */
  const bigCsv = () => {
    const rows: string[] = [];
    const votes: string[] = [];
    const players = ['A', 'B', 'C', 'D', 'E'];
    let track = 0;
    // Two rounds, five songs each: three Pop, two Rock.
    for (const round of ['R1', 'R2']) {
      players.forEach((player, i) => {
        track += 1;
        const artist = i < 3 ? 'Pop Star' : 'Guitar Band';
        rows.push(`${round},${player},S${track},${artist},s${track}`);
        // Rock scores well, Pop badly.
        const points = i < 3 ? 1 : 6;
        const voter = players[(i + 1) % players.length];
        votes.push(`${round},${voter},${player},S${track},${points}`);
      });
    }
    return `[rounds]
Position,Title
1,R1
2,R2

[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
${rows.join('\n')}

[votes]
Round,Voter,Submitter,Song Title,Points
${votes.join('\n')}
`;
  };

  const stats = computeStats(parseLeague([{ name: 'g.csv', text: bigCsv() }]));
  const report = genreReport(stats, { 'Pop Star': ['Pop'], 'Guitar Band': ['Rock'] });

  it('adds a sixth card when genre data is available', () => {
    const withGenre = headlineFacts(stats, 4, report);
    const withoutGenre = headlineFacts(stats, 4);
    expect(withGenre.length).toBe(withoutGenre.length + 1);
    expect(withGenre.at(-1)!.label).toBe('Genre');
  });

  it('leads on the favourite-but-worst contrast when there is one', () => {
    const fact = headlineFacts(stats, 4, report).find((f) => f.label === 'Genre')!;
    // Pop is submitted most (6 songs) and scores worst (1 a song).
    expect(fact.headline).toContain('Pop');
    expect(fact.headline).toMatch(/favourite genre and one of its worst-scoring/);
    expect(fact.detail).toContain('Rock');
  });

  it('keeps the card to the numbers, leaving provenance to the Genres panel', () => {
    const fact = headlineFacts(stats, 4, report).find((f) => f.label === 'Genre')!;
    expect(fact.detail).not.toMatch(/artist names|export/);
  });

  it('measures share against every song, not just the tagged ones', () => {
    const fact = headlineFacts(stats, 4, report).find((f) => f.label === 'Genre')!;
    // Six Pop songs of ten in the fixture.
    expect(fact.detail).toContain('60% of all songs');
    expect(fact.detail).not.toMatch(/everything tagged/);
  });

  it('is attributed to the league, so it cannot crowd out a player', () => {
    const fact = headlineFacts(stats, 4, report).find((f) => f.label === 'Genre')!;
    expect(fact.subject).toBe('__league__');
  });

  it('stays quiet when every genre sample is too thin', () => {
    const thin = genreReport(stats, { 'Pop Star': ['Pop'] });
    const onlyOne = { ...thin, stats: thin.stats.slice(0, 1) };
    expect(headlineFacts(stats, 4, onlyOne).some((f) => f.label === 'Genre')).toBe(false);
  });

  it('says nothing at all when no genres were resolved', () => {
    const none = genreReport(stats, {});
    expect(headlineFacts(stats, 4, none).some((f) => f.label === 'Genre')).toBe(false);
  });
});

describe('sortByRankOrder', () => {
  it('orders entries by the supplied ranking, not alphabetically', () => {
    const order = new Map([
      ['Zoe', 0],
      ['Ada', 1],
      ['Mike', 2],
    ]);
    const entries = [{ name: 'Ada' }, { name: 'Mike' }, { name: 'Zoe' }];
    expect(sortByRankOrder(entries, (e) => e.name, order).map((e) => e.name)).toEqual([
      'Zoe',
      'Ada',
      'Mike',
    ]);
  });

  it('puts unknown names last rather than first', () => {
    const order = new Map([['Ada', 0]]);
    const entries = [{ name: 'Ghost' }, { name: 'Ada' }];
    expect(sortByRankOrder(entries, (e) => e.name, order).map((e) => e.name)).toEqual([
      'Ada',
      'Ghost',
    ]);
  });
});

describe('a league still in progress', () => {
  const csv = `[rounds]
Position,Title
1,R1
2,R2

[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Ada,A,x,s1
R1,Bo,B,x,s2
R2,Ada,C,x,s3
R2,Bo,D,x,s4

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Bo,Ada,A,4
R1,Ada,Bo,B,2
R2,Bo,Ada,C,3
R2,Ada,Bo,D,5
`;

  it('knows the league is unfinished when told how many rounds it runs', () => {
    const s = computeStats(parseLeague([{ name: 'p.csv', text: csv }]), { totalRounds: 10 });
    expect(s.roundsPlayed).toBe(2);
    expect(s.totalRounds).toBe(10);
    expect(s.inProgress).toBe(true);
  });

  it('treats a league as finished when every planned round has results', () => {
    const s = computeStats(parseLeague([{ name: 'p.csv', text: csv }]), { totalRounds: 2 });
    expect(s.inProgress).toBe(false);
  });

  it('infers that it is unfinished from a round with no results yet', () => {
    // A third round exists but has no votes: voting has not closed.
    const pending = csv.replace('2,R2\n', '2,R2\n3,R3\n') + '\n';
    const s = computeStats(parseLeague([{ name: 'q.csv', text: pending }]));
    expect(s.roundsPlayed).toBe(2);
    expect(s.inProgress).toBe(true);
    expect(s.totalRounds).toBeUndefined();
  });

  it('does not call a complete league unfinished', () => {
    const s = computeStats(parseLeague([{ name: 'p.csv', text: csv }]));
    expect(s.inProgress).toBe(false);
  });

  it('hedges the copy while the season is running', () => {
    const s = computeStats(parseLeague([{ name: 'p.csv', text: csv }]), { totalRounds: 10 });
    const labels = headlineFacts(s, 8).map((f) => f.label);
    // No fact may claim a season result before the season is over.
    for (const label of labels) {
      expect(label).not.toContain('of the season');
      expect(label).not.toBe('Runaway winner');
    }
    for (const fact of headlineFacts(s, 8)) {
      expect(fact.headline).not.toMatch(/\ball season\b/);
      // "never" and "finished" both imply a closed book.
      expect(fact.headline).not.toMatch(/\bnever\b/);
      expect(`${fact.headline} ${fact.detail}`).not.toMatch(/\bfinished below zero\b/);
    }
  });

  it('speaks plainly about a finished league', () => {
    const finished = computeStats(parseLeague([{ name: 'p.csv', text: csv }]), { totalRounds: 2 });
    const best = headlineFacts(finished, 8).find((f) => f.label === 'Song of the season');
    expect(best).toBeDefined();
    expect(best!.headline).not.toContain('so far');
  });
});
