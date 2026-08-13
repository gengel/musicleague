import { describe, expect, it } from 'vitest';
import {
  buildRedactionMap,
  contextFromName,
  isPersonColumn,
  redactCsvText,
  redactName,
} from '../lib/redact';
import { parseLeague } from '../lib/parse';
import { computeStats } from '../lib/stats';

describe('redactName', () => {
  it('keeps the first name and reduces a surname to an initial', () => {
    expect(redactName('Tim Engel')).toBe('Tim E---');
    expect(redactName('Meredith Conde')).toBe('Meredith C---');
  });

  it('leaves a single-token name alone', () => {
    expect(redactName('Greggo')).toBe('Greggo');
    expect(redactName('t33nwitch')).toBe('t33nwitch');
    expect(redactName('Go_BirdzDH')).toBe('Go_BirdzDH');
  });

  it('leaves a surname that is already a single initial alone', () => {
    // "Laura M" is nothing left to hide, and "Laura M---" would imply more.
    expect(redactName('Laura M')).toBe('Laura M');
  });

  it('trims stray whitespace', () => {
    expect(redactName('Cynthia Dallas ')).toBe('Cynthia D---');
    expect(redactName('  Tim   Engel  ')).toBe('Tim E---');
  });

  it('redacts every token after the first, including middle names', () => {
    expect(redactName('Ana Maria Cruz')).toBe('Ana M--- C---');
  });

  it('preserves the case it was given', () => {
    expect(redactName('greg engel')).toBe('greg e---');
  });

  it('leaves tokens that are not words alone', () => {
    expect(redactName('Dave 🎸')).toBe('Dave 🎸');
    expect(redactName('Bob 123')).toBe('Bob 123');
  });

  it('reveals more letters only when asked', () => {
    expect(redactName('Dave Sanders', 2)).toBe('Dave Sa---');
    // Never exposes the entire surname, however many letters are requested.
    expect(redactName('Dave Ng', 5)).toBe('Dave N---');
  });
});

describe('buildRedactionMap', () => {
  const lookup = (map: Map<string, string>, name: string) =>
    map.get(name.trim().toLowerCase().replace(/\s+/g, ' '));

  it('maps a whole roster', () => {
    const map = buildRedactionMap(['Tim Engel', 'Greggo', 'Laura M']);
    expect(lookup(map, 'Tim Engel')).toBe('Tim E---');
    expect(lookup(map, 'Greggo')).toBe('Greggo');
    expect(lookup(map, 'Laura M')).toBe('Laura M');
  });

  it('keeps colliding surnames distinguishable', () => {
    // Both would read "Dave S---", merging two players in every table.
    const map = buildRedactionMap(['Dave Smith', 'Dave Sanders']);
    const a = lookup(map, 'Dave Smith');
    const b = lookup(map, 'Dave Sanders');
    expect(a).toBe('Dave Sm---');
    expect(b).toBe('Dave Sa---');
    expect(a).not.toBe(b);
  });

  it('separates names that agree for several letters', () => {
    const map = buildRedactionMap(['Jo Anderson', 'Jo Andersen']);
    expect(lookup(map, 'Jo Anderson')).not.toBe(lookup(map, 'Jo Andersen'));
  });

  it('does not collide a bare first name with a redacted one', () => {
    const map = buildRedactionMap(['Caroline', 'Caroline Cone']);
    expect(lookup(map, 'Caroline')).toBe('Caroline');
    expect(lookup(map, 'Caroline Cone')).toBe('Caroline C---');
  });

  it('falls back to a suffix for genuinely identical names', () => {
    const map = buildRedactionMap(['Sam Smith', 'sam  smith', 'Sam Smith']);
    // Case and spacing variants are one person, so one entry.
    expect(map.size).toBe(1);
  });

  it('never emits the same label for two different people', () => {
    const roster = [
      'Brittny Laudani',
      'Caroline Cone',
      'Caroline',
      'Cynthia Dallas ',
      'Laura M',
      'Megan Pallace',
      'Meredith Conde',
      'Tim Engel',
      'Bob',
      'Greggo',
      'Go_BirdzDH',
      't33nwitch',
    ];
    const map = buildRedactionMap(roster);
    const values = [...map.values()];
    expect(new Set(values).size).toBe(values.length);
    expect(values).toHaveLength(12);
  });
});

describe('column classification', () => {
  it('treats name-like columns as people', () => {
    expect(isPersonColumn('Submitter')).toBe(true);
    expect(isPersonColumn('Voter')).toBe(true);
    expect(isPersonColumn('Author')).toBe(true);
    expect(isPersonColumn('Name', 'competitors')).toBe(true);
    expect(isPersonColumn('Name', 'standings')).toBe(true);
  });

  it('never rewrites an id column, which joins the export together', () => {
    expect(isPersonColumn('Submitter ID')).toBe(false);
    expect(isPersonColumn('Voter ID')).toBe(false);
    expect(isPersonColumn('ID', 'competitors')).toBe(false);
    expect(isPersonColumn('Spotify URI')).toBe(false);
  });

  it('does not mistake song or round metadata for a person', () => {
    expect(isPersonColumn('Song Title')).toBe(false);
    expect(isPersonColumn('Artist(s)')).toBe(false);
    expect(isPersonColumn('Album')).toBe(false);
    expect(isPersonColumn('Round Name')).toBe(false);
    // rounds.csv calls the round title plain "Name".
    expect(isPersonColumn('Name', 'rounds')).toBe(false);
  });

  it('reads the context from a file or section name', () => {
    expect(contextFromName('competitors.csv')).toBe('competitors');
    expect(contextFromName('rounds.csv')).toBe('rounds');
    expect(contextFromName('votes')).toBe('votes');
    expect(contextFromName('standings')).toBe('standings');
  });
});

describe('redactCsvText — classic multi-file export', () => {
  const competitors = 'ID,Name\nid-1,Tim Engel\nid-2,Greggo\nid-3,Megan Pallace\n';
  const rounds =
    'ID,Created,Name,Description,Playlist URL\n' +
    'r-1,2026-07-02T19:46:21Z,Born This Way,Songs from the year you were born,http://x\n';
  const submissions =
    'Spotify URI,Title,Album,Artist(s),Submitter ID,Created,Comment,Round ID,Visible To Voters\n' +
    'spotify:track:a,About A Girl,Bleach,Nirvana,id-1,2026-07-04T18:41:37Z,Tim Engel loves this,r-1,Yes\n' +
    'spotify:track:b,Come As You Are,Nevermind,Nirvana,id-3,2026-07-04T18:42:00Z,,r-1,Yes\n';
  const votes =
    'Spotify URI,Voter ID,Created,Points Assigned,Comment,Round ID\n' +
    'spotify:track:a,id-2,2026-07-05T21:13:16Z,3,,r-1\n' +
    'spotify:track:b,id-1,2026-07-05T21:14:00Z,2,,r-1\n';

  const map = buildRedactionMap(['Tim Engel', 'Greggo', 'Megan Pallace']);

  it('redacts the competitors roster', () => {
    const out = redactCsvText(competitors, map, 'competitors.csv');
    expect(out).toContain('id-1,Tim E---');
    expect(out).toContain('id-3,Megan P---');
    expect(out).toContain('id-2,Greggo');
    expect(out).not.toContain('Engel');
    expect(out).not.toContain('Pallace');
  });

  it('leaves the opaque ids untouched so the joins still work', () => {
    const out = redactCsvText(competitors, map, 'competitors.csv');
    expect(out).toContain('id-1');
    expect(out).toContain('id-2');
    expect(out).toContain('id-3');
  });

  it('does not touch a round title that happens to sit in a Name column', () => {
    const out = redactCsvText(rounds, map, 'rounds.csv');
    expect(out).toContain('Born This Way');
  });

  it('sweeps a surname out of a submission comment', () => {
    const out = redactCsvText(submissions, map, 'submissions.csv');
    expect(out).toContain('Tim E--- loves this');
    expect(out).not.toContain('Engel');
  });

  it('reports the free-text edits it made so they can be reviewed', () => {
    const report = { proseChanges: [] };
    redactCsvText(submissions, map, 'submissions.csv', report);
    expect(report.proseChanges).toHaveLength(1);
    expect(report.proseChanges[0]).toMatchObject({
      column: 'Comment',
      before: 'Tim Engel loves this',
      after: 'Tim E--- loves this',
    });
  });

  it('leaves song, album and artist columns alone', () => {
    const out = redactCsvText(submissions, map, 'submissions.csv');
    expect(out).toContain('About A Girl');
    expect(out).toContain('Bleach');
    expect(out).toContain('Nirvana');
  });

  it('keeps the whole export parseable and unchanged in shape', () => {
    const before = parseLeague([
      { name: 'competitors.csv', text: competitors },
      { name: 'rounds.csv', text: rounds },
      { name: 'submissions.csv', text: submissions },
      { name: 'votes.csv', text: votes },
    ]);
    const after = parseLeague(
      [
        { name: 'competitors.csv', text: competitors },
        { name: 'rounds.csv', text: rounds },
        { name: 'submissions.csv', text: submissions },
        { name: 'votes.csv', text: votes },
      ].map((f) => ({ name: f.name, text: redactCsvText(f.text, map, f.name) })),
    );

    expect(after.players).toHaveLength(before.players.length);
    expect(after.submissions).toHaveLength(before.submissions.length);
    expect(after.votes).toHaveLength(before.votes.length);
    expect(after.rounds.map((r) => r.name)).toEqual(before.rounds.map((r) => r.name));
    expect(after.players.map((p) => p.name).sort()).toEqual([
      'Greggo',
      'Megan P---',
      'Tim E---',
    ]);
    // The vote still points at the same song by the same submitter.
    expect(after.votes[0].points).toBe(before.votes[0].points);
    expect(after.submissions[0].submitterId).toBe(
      after.players.find((p) => p.name === 'Tim E---')!.id,
    );
  });
});

describe('redactCsvText — modern sectioned export', () => {
  const csv = `[rounds]
Position,Title,Description
1,Born This Way,Nothing to hide here

[submissions]
Round,Submitter,Song Title,Artist,Note
Born This Way,Tim Engel,About A Girl,Nirvana,A note from Tim Engel

[votes]
Round,Voter,Submitter,Song Title,Points
Born This Way,Megan Pallace,Tim Engel,About A Girl,4

[comments]
Round,Song Title,Author,Comment
Born This Way,About A Girl,Megan Pallace,Classic Engel pick

[standings]
Position,Name,Points,Rounds Played
1,Tim Engel,4,1
2,Megan Pallace,0,0
`;
  const map = buildRedactionMap(['Tim Engel', 'Megan Pallace']);
  const out = redactCsvText(csv, map, 'My League.csv');

  it('redacts submitters, voters, authors and standings alike', () => {
    expect(out).not.toContain('Engel');
    expect(out).not.toContain('Pallace');
    expect(out).toContain('Tim E---');
    expect(out).toContain('Megan P---');
  });

  it('keeps the section markers and structure intact', () => {
    for (const marker of ['[rounds]', '[submissions]', '[votes]', '[comments]', '[standings]']) {
      expect(out).toContain(marker);
    }
    const reparsed = parseLeague([{ name: 'x.csv', text: out }]);
    expect(reparsed.rounds.map((r) => r.name)).toEqual(['Born This Way']);
    expect(reparsed.submissions).toHaveLength(1);
    expect(reparsed.votes).toHaveLength(1);
    expect(reparsed.comments).toHaveLength(1);
    expect(reparsed.standings).toHaveLength(2);
  });

  it('produces identical statistics to the unredacted export', () => {
    const before = computeStats(parseLeague([{ name: 'x.csv', text: csv }]));
    const after = computeStats(parseLeague([{ name: 'x.csv', text: out }]));
    expect(after.songs.map((s) => s.net)).toEqual(before.songs.map((s) => s.net));
    expect(after.pairs.map((p) => p.upvotes)).toEqual(before.pairs.map((p) => p.upvotes));
    expect(after.players.map((p) => p.pointsCounted)).toEqual(
      before.players.map((p) => p.pointsCounted),
    );
  });

  it('does not alter a round description that names nobody', () => {
    expect(out).toContain('Nothing to hide here');
  });
});
