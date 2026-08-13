import { describe, expect, it } from 'vitest';
import { parseFlat, parseLeague, splitSections } from '../lib/parse';
import { computeStats } from '../lib/stats';

/** Modern layout: labelled sections, blank-line separated. */
const SECTIONED = `[rounds]
Position,Title,Description,Voting Closes,Status
1,Round One,First one,2026-01-03T18:00:00Z,Completed
2,Round Two,Second one,2026-01-10T18:00:00Z,Completed

[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID,Note
Round One,Ada,Glass Weather,Vellum,t1,"Saved this one, honestly"
Round One,Bo,Slow Parade,Sparrowgrass,t2,
Round Two,Ada,Tallboy,Low Ceiling,t3,

[votes]
Round,Voter,Submitter,Song Title,Points
Round One,Bo,Ada,Glass Weather,4
Round One,Ada,Bo,Slow Parade,3
Round Two,Bo,Ada,Tallboy,-2

[comments]
Round,Song Title,Author,Comment,Posted At
Round One,Glass Weather,Bo,Genuinely great,2026-01-02T10:00:00Z

[standings]
Position,Name,Points,Rounds Played
1,Ada,4,2
2,Bo,3,1
`;

describe('splitSections', () => {
  it('finds every labelled section', () => {
    const names = splitSections(SECTIONED).map((s) => s.name);
    expect(names).toEqual(['rounds', 'submissions', 'votes', 'comments', 'standings']);
  });

  it('keeps quoted commas intact', () => {
    const subs = splitSections(SECTIONED).find((s) => s.name === 'submissions')!;
    expect(subs.rows[0]['Note']).toBe('Saved this one, honestly');
  });

  it('stops a section at the blank separator, not at the next marker', () => {
    const votes = splitSections(SECTIONED).find((s) => s.name === 'votes')!;
    expect(votes.rows).toHaveLength(3);
  });

  it('returns nothing for a flat CSV', () => {
    expect(splitSections('a,b\n1,2\n')).toEqual([]);
  });
});

describe('parseLeague — modern export', () => {
  const league = parseLeague([{ name: 'Big League.csv', text: SECTIONED }]);

  it('orders rounds by declared position', () => {
    expect(league.rounds.map((r) => r.name)).toEqual(['Round One', 'Round Two']);
    expect(league.rounds[0].sequence).toBe(1);
  });

  it('reads submissions with submitter and artist', () => {
    expect(league.submissions).toHaveLength(3);
    const first = league.submissions[0];
    expect(first.title).toBe('Glass Weather');
    expect(first.artist).toBe('Vellum');
    expect(first.submitterId).toBe('ada');
  });

  it('links votes to the submission they refer to', () => {
    const trackIds = new Set(league.submissions.map((s) => s.trackId));
    for (const vote of league.votes) expect(trackIds.has(vote.trackId)).toBe(true);
  });

  it('preserves negative points as downvotes', () => {
    const down = league.votes.filter((v) => v.points < 0);
    expect(down).toHaveLength(1);
    expect(down[0].points).toBe(-2);
  });

  it('derives the player roster from names', () => {
    expect(league.players.map((p) => p.name)).toEqual(['Ada', 'Bo']);
  });

  it('reads comments and official standings', () => {
    expect(league.comments).toHaveLength(1);
    expect(league.comments[0].authorId).toBe('bo');
    expect(league.standings).toEqual([
      { playerId: 'ada', position: 1, points: 4, roundsPlayed: 2 },
      { playerId: 'bo', position: 2, points: 3, roundsPlayed: 1 },
    ]);
  });

  it('names the league after the file', () => {
    expect(league.name).toBe('Big League');
  });
});

describe('parseLeague — anonymity and privacy', () => {
  it('treats placeholder submitters as unknown rather than as a player', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,[Anonymous],Hidden Song,Someone,t9
R1,[Hidden until voting closes],Other Song,Someone,t8
R1,[Removed user],Third Song,Someone,t7
R1,Ada,Real Song,Vellum,t6
`;
    const league = parseLeague([{ name: 'x.csv', text: csv }]);
    expect(league.players.map((p) => p.name)).toEqual(['Ada']);
    expect(league.submissions.filter((s) => !s.submitterId)).toHaveLength(3);
    expect(league.warnings.some((w) => w.includes('no identifiable submitter'))).toBe(true);
  });

  it('does not mistake a real name that merely starts with "hidden"', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist
Hidden Gems,Hidden Valley Ranch,Song,Artist
`;
    const league = parseLeague([{ name: 'x.csv', text: csv }]);
    expect(league.players.map((p) => p.name)).toEqual(['Hidden Valley Ranch']);
    expect(league.rounds[0].name).toBe('Hidden Gems');
  });

  it('warns when the vote breakdown is withheld', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist
R1,Ada,Song,Artist

[votes]
Round,Voter,Submitter,Song Title,Points
`;
    const league = parseLeague([{ name: 'x.csv', text: csv }]);
    expect(league.votes).toHaveLength(0);
    expect(league.warnings.some((w) => w.includes('No vote rows'))).toBe(true);
  });

  it('recovers a submitter from the votes section when submissions hid it', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,[Anonymous],Mystery,Vellum,t1

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Bo,Ada,Mystery,3
`;
    const league = parseLeague([{ name: 'x.csv', text: csv }]);
    expect(league.submissions[0].submitterId).toBe('ada');
  });
});

describe('parseLeague — distinct identities', () => {
  const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Dave,Song One,A,t1
R1,Dave 🎸,Song Two,B,t2
R1,🎸,Song Three,C,t3
R1,  dave  ,Song Four,D,t4

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Dave 🎸,Dave,Song One,3
R1,🎸,Dave,Song One,2
`;
  const league = parseLeague([{ name: 'x.csv', text: csv }]);

  it('keeps players whose names differ only by emoji or punctuation apart', () => {
    expect(league.players.map((p) => p.name).sort()).toEqual(['Dave', 'Dave 🎸', '🎸']);
  });

  it('still folds pure case and whitespace differences together', () => {
    const dave = league.players.find((p) => p.name === 'Dave')!;
    const theirs = league.submissions.filter((s) => s.submitterId === dave.id);
    expect(theirs.map((s) => s.title)).toEqual(['Song One', 'Song Four']);
  });

  it('keeps an emoji-only player and their ballot', () => {
    const emoji = league.players.find((p) => p.name === '🎸')!;
    expect(league.votes.filter((v) => v.voterId === emoji.id)).toHaveLength(1);
    expect(league.votes).toHaveLength(2);
  });
});

describe('parseLeague — duplicate titles in one round', () => {
  it('keeps same-titled songs separate and attributes votes by submitter', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist
R1,Ada,Twin,A
R1,Bo,Twin,B
R1,Cleo,Other,C

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Cleo,Ada,Twin,3
R1,Cleo,Bo,Twin,1
`;
    const league = parseLeague([{ name: 'x.csv', text: csv }]);
    const twins = league.submissions.filter((s) => s.title === 'Twin');
    expect(twins).toHaveLength(2);
    expect(new Set(twins.map((s) => s.trackId)).size).toBe(2);

    const stats = computeStats(league);
    const ada = stats.songs.find((s) => s.title === 'Twin' && s.submitterId === 'ada')!;
    const bo = stats.songs.find((s) => s.title === 'Twin' && s.submitterId === 'bo')!;
    expect(ada.upvotes).toBe(3);
    expect(bo.upvotes).toBe(1);
    // Shares must not exceed the round's total.
    expect(stats.songs.reduce((a, s) => a + s.shareOfRound, 0)).toBeCloseTo(1, 6);
  });
});

describe('parseLeague — classic multi-file export', () => {
  const files = [
    {
      name: 'competitors.csv',
      text: 'ID,Name\nuser-1,Ada\nuser-2,Bo\n',
    },
    {
      name: 'rounds.csv',
      text:
        'ID,Created,Name,Description,Playlist URL\n' +
        'rnd-2,2026-02-01T00:00:00Z,Round Two,Second,http://y\n' +
        'rnd-1,2026-01-01T00:00:00Z,Round One,First,http://x\n',
    },
    {
      name: 'submissions.csv',
      text:
        'Spotify URI,Submitter ID,Created,Comment,Round ID,Visible To Voters\n' +
        'spotify:track:aaa,user-1,2026-01-01,Nice,rnd-1,Yes\n',
    },
    {
      name: 'votes.csv',
      text:
        'Spotify URI,Voter ID,Created,Points Assigned,Comment,Round ID\n' +
        'spotify:track:aaa,user-2,2026-01-02,5,Great,rnd-1\n',
    },
  ];
  const league = parseLeague(files);

  it('resolves opaque ids through competitors.csv', () => {
    expect(league.players.map((p) => p.name).sort()).toEqual(['Ada', 'Bo']);
    expect(league.submissions[0].submitterId).toBe('ada');
    expect(league.votes[0].voterId).toBe('bo');
  });

  it('matches votes to submissions by spotify uri', () => {
    expect(league.votes[0].trackId).toBe(league.submissions[0].trackId);
    expect(league.votes[0].points).toBe(5);
  });

  it('keys rounds by their own ID so submissions land in a named round', () => {
    // rounds.csv identifies a round by a bare "ID"; submissions reference it
    // as "Round ID". Keying on the name instead would leave every named round
    // empty and create a second, id-named round holding the songs.
    expect(league.rounds).toHaveLength(2);
    const round = league.rounds.find((r) => r.id === 'rnd-1')!;
    expect(round.name).toBe('Round One');
    expect(league.submissions[0].roundId).toBe(round.id);
    expect(league.votes[0].roundId).toBe(round.id);
  });

  it('orders undeclared rounds by date rather than file order', () => {
    // rounds.csv above lists Round Two first.
    expect(league.rounds.map((r) => r.name)).toEqual(['Round One', 'Round Two']);
    expect(league.rounds.map((r) => r.sequence)).toEqual([1, 2]);
  });

  it('counts comments that hang off submissions and votes', () => {
    const stats = computeStats(league);
    // No comments.csv exists in this export generation.
    expect(league.comments).toHaveLength(0);
    expect(stats.players.find((p) => p.name === 'Ada')!.comments).toBe(1); // submission note
    expect(stats.players.find((p) => p.name === 'Bo')!.comments).toBe(1); // vote remark
  });

  it('flags files it cannot classify', () => {
    const odd = parseLeague([{ name: 'mystery.csv', text: 'a,b\n1,2\n' }]);
    expect(odd.warnings.some((w) => w.includes('Could not classify'))).toBe(true);
  });
});

describe('parseFlat', () => {
  it('trims headers and values and drops empty rows', () => {
    const rows = parseFlat(' A , B \n 1 , 2 \n\n');
    expect(rows).toEqual([{ A: '1', B: '2' }]);
  });
});
