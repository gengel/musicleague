import { describe, expect, it } from 'vitest';
import { parseLeague } from '../lib/parse';
import { computeStats } from '../lib/stats';
import { buildHistoryLeagues, joinHistory } from '../lib/history';
import { buildPlayerProfile, playerSlug, resolveSlug } from '../lib/playerProfile';

const bobRound = (title: string) => `${title},Ann,Ann_${title},Art,ann_${title}
${title},Bob,Bob_${title},Art,bob_${title}
${title},Cleo,Cleo_${title},Art,cleo_${title}`;

const votes = (title: string, bobPts: number) => `${title},Ann,Bob,Bob_${title},${bobPts}
${title},Ann,Cleo,Cleo_${title},2
${title},Bob,Cleo,Cleo_${title},3
${title},Cleo,Ann,Ann_${title},1`;

const mk = (title: string, bobPts: number) => `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
${bobRound(title)}

[votes]
Round,Voter,Submitter,Song Title,Points
${votes(title, bobPts)}
`;

const currentFiles = [{ name: 'l2.csv', text: mk('All About Bob', 5) }];
const current = computeStats(parseLeague(currentFiles), {
  scoring: 'competitive',
  flooring: 'none',
  theme: { source: 'title', win: 3, lose: -3, skip: -3, overrides: {} },
});

const historyFiles = [{ name: 'l1.csv', text: mk('Opening Round', 4) }];
const leagues = buildHistoryLeagues([
  { id: 'league1', label: 'League 1', files: historyFiles, options: { scoring: 'competitive', flooring: 'none' } },
]);
const history = joinHistory(
  current.players.map((p) => ({ id: p.playerId, name: p.name })),
  leagues,
);

const genres = { art: ['Rock'] };
const historyGenres = new Map([['league1', { art: ['Rock'] }]]);

describe('buildPlayerProfile', () => {
  const profile = buildPlayerProfile('bob', current, 'League 2', genres, history, historyGenres)!;

  it('combines the current league and history into appearances', () => {
    expect(profile.appearances.map((a) => a.leagueId)).toEqual(['current', 'league1']);
    expect(profile.appearances[0].current).toBe(true);
    expect(profile.appearances[0].finish).toBe(1); // Bob leads with 5 + 3 theme
  });

  it('records the theme outcome for the current league', () => {
    expect(profile.themeOutcome?.outcome).toBe('won');
    expect(profile.themeRoundName).toBe('All About Bob');
    expect(profile.themePending).toBe(false);
  });

  it('lists who they ranked, with reciprocals', () => {
    const cleo = profile.appearances[0].ranks.find((r) => r.name === 'Cleo');
    expect(cleo).toBeDefined();
    expect(cleo!.up).toBe(3);
  });

  it('builds a cross-league brief', () => {
    // Bob upvoted Cleo in both leagues (3 each), so Cleo's artist leads.
    expect(profile.brief.favouriteGenres[0][0]).toBe('Rock');
    expect(profile.brief.bestSubmissions.length).toBeGreaterThan(0);
  });

  it('slugs and resolves names', () => {
    expect(playerSlug('Tim E---')).toBe('tim-e');
    expect(resolveSlug('bob', current)).toBe('bob');
    expect(resolveSlug('cleo', current)).toBe('cleo');
  });
});
