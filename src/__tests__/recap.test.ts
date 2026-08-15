import { describe, expect, it } from 'vitest';
import { parseLeague } from '../lib/parse';
import { computeStats } from '../lib/stats';
import { buildDemoCsv } from '../lib/demo';
import { buildPlayByPlay, buildRoundWinner, findRoundMoments } from '../lib/recap';

const stats = computeStats(parseLeague([{ name: 'demo.csv', text: buildDemoCsv() }]), {
  scoring: 'competitive',
  flooring: 'none',
});

describe('buildRoundWinner (I2 — never conflate the best song with the round winner)', () => {
  it('names the credited winner, not the raw top scorer, when a forfeit changes them', () => {
    // Reproduces the exact shape of the real round-6 bug this app was built
    // to catch: the highest raw score belongs to a forfeited song, so the
    // credited winner has to be someone else's lower score.
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Ada,Best Raw Song,Artist,2SHTKB8YYlawTGIuJ2b2aa
R1,Bo,Credited Winner,Artist,2SHTKB8YYlawTGIuJ2b2bb
R1,Cleo,Also Ran,Artist,2SHTKB8YYlawTGIuJ2b2cc

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Bo,Ada,Best Raw Song,7
R1,Cleo,Ada,Best Raw Song,7
R1,Cleo,Bo,Credited Winner,3
R1,Bo,Cleo,Also Ran,1
`;
    // Ada submitted the highest-raw-scoring song (14) but cast no votes, so
    // under Competitive Mode her song's upvotes are forfeited and Bo's much
    // lower 3-point song is what the league actually credits.
    const league = parseLeague([{ name: 'x.csv', text: csv }]);
    const roundStats = computeStats(league, { scoring: 'competitive', flooring: 'none' });
    const round = roundStats.rounds[0];
    const songs = roundStats.songs.filter((s) => s.roundId === round.round.id);

    const { winner, twist } = buildRoundWinner(round, songs);

    expect(winner?.title).toBe('Credited Winner');
    expect(twist?.song.title).toBe('Best Raw Song');
    expect(twist?.wasForfeited).toBe(true);
  });

  it('reports no twist when the raw top scorer is also the credited winner', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Ada,Winner,Artist,2SHTKB8YYlawTGIuJ2b2aa
R1,Bo,Runner Up,Artist,2SHTKB8YYlawTGIuJ2b2bb

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Ada,Bo,Runner Up,2
R1,Bo,Ada,Winner,7
`;
    const league = parseLeague([{ name: 'x.csv', text: csv }]);
    const roundStats = computeStats(league, { scoring: 'competitive', flooring: 'none' });
    const round = roundStats.rounds[0];
    const songs = roundStats.songs.filter((s) => s.roundId === round.round.id);

    const { winner, twist } = buildRoundWinner(round, songs);
    expect(winner?.title).toBe('Winner');
    expect(twist).toBeUndefined();
  });

  it('returns no winner for a round with no vote data, rather than guessing (I6)', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist
R1,Ada,Song,Artist

[votes]
Round,Voter,Submitter,Song Title,Points
`;
    const league = parseLeague([{ name: 'x.csv', text: csv }]);
    const roundStats = computeStats(league);
    const round = roundStats.rounds[0];
    const songs = roundStats.songs.filter((s) => s.roundId === round.round.id);
    expect(buildRoundWinner(round, songs).winner).toBeUndefined();
  });
});

describe('findRoundMoments', () => {
  it('produces no moments for either of the first two rounds', () => {
    const round1 = stats.rounds.find((r) => r.round.sequence === 1)!;
    const round2 = stats.rounds.find((r) => r.round.sequence === 2)!;
    const songs1 = stats.songs.filter((s) => s.roundId === round1.round.id);
    const songs2 = stats.songs.filter((s) => s.roundId === round2.round.id);
    const baselines = {
      songNets: stats.songs.map((s) => s.net),
      songUpvotes: stats.songs.map((s) => s.upvotes),
      roundTotals: stats.rounds.map((r) => r.totalUpvotes),
      roundTurnouts: stats.rounds.map((r) => r.voters.length),
    };
    expect(findRoundMoments(round1, songs1, baselines)).toEqual([]);
    expect(findRoundMoments(round2, songs2, baselines)).toEqual([]);
  });

  it('sorts by absolute z-score, most unusual first', () => {
    const round = stats.rounds.find((r) => r.round.sequence === 4 && r.hasVotes);
    if (!round) return;
    const songs = stats.songs.filter((s) => s.roundId === round.round.id);
    const baselines = {
      songNets: stats.songs.map((s) => s.net),
      songUpvotes: stats.songs.map((s) => s.upvotes),
      roundTotals: stats.rounds.map((r) => r.totalUpvotes),
      roundTurnouts: stats.rounds.map((r) => r.voters.length),
    };
    const moments = findRoundMoments(round, songs, baselines);
    for (let i = 1; i < moments.length; i += 1) {
      expect(Math.abs(moments[i - 1].zScore)).toBeGreaterThanOrEqual(Math.abs(moments[i].zScore));
    }
  });
});

describe('buildPlayByPlay', () => {
  const chapters = buildPlayByPlay(stats);

  it('produces one chapter per round, in season order', () => {
    expect(chapters.length).toBe(stats.rounds.length);
    for (let i = 1; i < chapters.length; i += 1) {
      expect(chapters[i].round.round.sequence).toBeGreaterThan(chapters[i - 1].round.round.sequence);
    }
  });

  it('never gives a chapter more than 3 moments', () => {
    for (const c of chapters) expect(c.moments.length).toBeLessThanOrEqual(3);
  });

  it('never anchors more than 2 moments on the same subject across the whole season', () => {
    const counts = new Map<string, number>();
    for (const c of chapters) {
      for (const m of c.moments) {
        if (m.subject === '__round__') continue;
        counts.set(m.subject, (counts.get(m.subject) ?? 0) + 1);
      }
    }
    for (const [, n] of counts) expect(n).toBeLessThanOrEqual(2);
  });

  it('gives every chapter with vote data a winner', () => {
    for (const c of chapters) {
      if (c.round.hasVotes) expect(c.winner).toBeDefined();
    }
  });
});
