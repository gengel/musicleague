import { describe, expect, it } from 'vitest';
import { buildHistoryLeagues, joinHistory } from '../lib/history';

const csv = (rows: string) => `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
${rows}

[votes]
Round,Voter,Submitter,Song Title,Points
All About Bob,Ann,Bob,Bob1,5
All About Bob,Ann,Cleo,Cleo1,2
All About Bob,Bob,Ann,Ann1,0
All About Bob,Cleo,Ann,Ann1,0
`;

const l1Files = [
  {
    name: 'l1.csv',
    text: csv(`All About Bob,Ann,Ann1,Art,ann1
All About Bob,Bob,Bob1,Art,bob1
All About Bob,Cleo,Cleo1,Art,cleo1`),
  },
];

const leagues = buildHistoryLeagues([
  { id: 'league1', label: 'League 1', files: l1Files, options: { scoring: 'competitive', flooring: 'none' } },
]);

// Ids the parser assigns are the lowercased names here.
const current = [
  { id: 'bob', name: 'Bob' },
  { id: 'cleo', name: 'Cleo' },
  { id: 'ann', name: 'Ann' },
  { id: 'newbie', name: 'Newbie' },
];

describe('history join', () => {
  it('joins players by id and records their finish', () => {
    const h = joinHistory(current, leagues);
    const bob = h.byPlayer.get('bob');
    expect(bob).toHaveLength(1);
    expect(bob![0].label).toBe('League 1');
    expect(bob![0].finish).toBe(1); // Bob won
    expect(bob![0].of).toBe(3);
  });

  it('lists a player who was not in the history league', () => {
    const h = joinHistory(current, leagues);
    expect(h.newPlayers).toContain('Newbie');
    expect(h.byPlayer.has('newbie')).toBe(false);
  });

  it('falls back to a name match with a warning', () => {
    // Same person, different account id across seasons.
    const h = joinHistory([{ id: 'different-id', name: 'Bob' }], leagues);
    expect(h.byPlayer.get('different-id')).toHaveLength(1);
    expect(h.warnings.some((w) => /matched to League 1 by name/.test(w))).toBe(true);
  });
});
