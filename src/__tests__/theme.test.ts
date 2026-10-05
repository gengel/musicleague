import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseLeague } from '../lib/parse';
import { computeStats } from '../lib/stats';
import type { ThemeRules } from '../lib/theme';

const RULES: ThemeRules = { source: 'title', win: 3, lose: -3, skip: -3, overrides: {} };

/**
 * Builds a one- or two-round league where each submitter gets a fixed net
 * score, so a theme outcome is easy to force. `points[name]` is the single
 * up (or down) vote a neutral voter places on that player's song.
 */
/**
 * Builds a league where each named player submits one song per round and a
 * fixed pair of extra voters (Ann, Ben) place the points, so a contestant who
 * "doesn't vote" is deliberate. `points[name]` is the net the song receives.
 * Ann and Ben also submit and vote every round, so they are never non-voters.
 */
function league(rounds: { title: string; points: Record<string, number> }[]): string {
  const subs: string[] = [];
  const votes: string[] = [];
  rounds.forEach((r) => {
    const t = r.title;
    // Ann and Ben are structural: they submit and vote so the round has a
    // full electorate and no accidental forfeits.
    subs.push(`${t},Ann,Ann_${t},Art,ann_${t}`);
    subs.push(`${t},Ben,Ben_${t},Art,ben_${t}`);
    votes.push(`${t},Ann,Ben,Ben_${t},1`);
    votes.push(`${t},Ben,Ann,Ann_${t},1`);
    for (const [name, pts] of Object.entries(r.points)) {
      subs.push(`${t},${name},${name}_${t},Art,${name}_${t}`);
      // Split the net into an up and a down so both budgets are exercised.
      if (pts >= 0) {
        votes.push(`${t},Ann,${name},${name}_${t},${pts}`);
      } else {
        votes.push(`${t},Ann,${name},${name}_${t},${pts}`);
      }
      // Each contestant votes once (on Ann's song) so they are not non-voters.
      votes.push(`${t},${name},Ann,Ann_${t},0`);
    }
  });
  return `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
${subs.join('\n')}

[votes]
Round,Voter,Submitter,Song Title,Points
${votes.join('\n')}
`;
}

const stats = (csv: string, rules: ThemeRules = RULES) =>
  computeStats(parseLeague([{ name: 't.csv', text: csv }]), {
    scoring: 'competitive',
    flooring: 'none',
    theme: rules,
  });

describe('theme bonus', () => {
  it('awards +3 when the theme player wins their own round', () => {
    const s = stats(league([{ title: 'All About Bob', points: { Bob: 5, Cleo: 2 } }]));
    const bob = s.players.find((p) => p.name === 'Bob')!;
    expect(bob.themeBonus).toBe(3);
    expect(bob.breakdown.theme).toBe(3);
    expect(bob.pointsCounted).toBe(8); // 5 votes + 3
    expect(s.themeOutcomes[0].outcome).toBe('won');
  });

  it('counts a tie for first as a win', () => {
    const s = stats(league([{ title: 'All About Bob', points: { Bob: 5, Cleo: 5 } }]));
    const bob = s.players.find((p) => p.name === 'Bob')!;
    expect(bob.themeBonus).toBe(3);
    expect(s.themeOutcomes[0].outcome).toBe('won');
    expect(s.themeOutcomes[0].tiedWith).toEqual(['Cleo']);
  });

  it('penalises the theme player for finishing second', () => {
    const s = stats(league([{ title: 'All About Bob', points: { Bob: 2, Cleo: 5 } }]));
    const bob = s.players.find((p) => p.name === 'Bob')!;
    expect(bob.themeBonus).toBe(-3);
    expect(bob.pointsCounted).toBe(-1); // 2 − 3
    expect(s.themeOutcomes[0].outcome).toBe('lost');
  });

  it('penalises the theme player for finishing last', () => {
    const s = stats(league([{ title: 'All About Bob', points: { Bob: -4, Cleo: 5, Dan: 1 } }]));
    const bob = s.players.find((p) => p.name === 'Bob')!;
    expect(bob.themeBonus).toBe(-3);
    expect(s.themeOutcomes[0].outcome).toBe('lost');
  });

  it('penalises a theme player who submitted nothing', () => {
    // Bob is a member of the league (he votes) but submits nothing in his own
    // round, so he is skipped, not merely absent.
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
All About Bob,Ann,Ann_1,Art,ann1
All About Bob,Cleo,Cleo_1,Art,cleo1
All About Bob,Dan,Dan_1,Art,dan1

[votes]
Round,Voter,Submitter,Song Title,Points
All About Bob,Ann,Cleo,Cleo_1,5
All About Bob,Ann,Dan,Dan_1,1
All About Bob,Bob,Cleo,Cleo_1,3
All About Bob,Cleo,Ann,Ann_1,0
All About Bob,Dan,Ann,Ann_1,0
`;
    const s = stats(csv);
    const bob = s.players.find((p) => p.name === 'Bob')!;
    expect(s.themeOutcomes[0].outcome).toBe('skipped');
    expect(s.themeOutcomes[0].points).toBe(-3);
    expect(bob.themeBonus).toBe(-3);
  });

  it('judges a non-voting theme player on their counted (forfeited) score', () => {
    // Bob leads on raw votes but casts no votes himself, so Competitive Mode
    // forfeits his upvotes and Cleo wins the round instead.
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
All About Bob,Bob,Bob_1,Art,bob1
All About Bob,Cleo,Cleo_1,Art,cleo1
All About Bob,Ann,Ann_1,Art,ann1

[votes]
Round,Voter,Submitter,Song Title,Points
All About Bob,Cleo,Bob,Bob_1,6
All About Bob,Ann,Bob,Bob_1,1
All About Bob,Ann,Cleo,Cleo_1,4
All About Bob,Cleo,Ann,Ann_1,0
`;
    const s = stats(csv);
    const bob = s.players.find((p) => p.name === 'Bob')!;
    expect(bob.forfeitedUpvotes).toBeGreaterThan(0);
    expect(s.themeOutcomes[0].outcome).toBe('lost');
    expect(bob.themeBonus).toBe(-3);
  });

  it('does not score a round with no results', () => {
    // A round present but with no votes at all.
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Bob,Bob1,Art,b1
R1,Cleo,Cleo1,Art,c1
R2,Bob,Bob2,Art,b2
R2,Cleo,Cleo2,Art,c2

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Cleo,Bob,Bob1,5
R1,Bob,Cleo,Cleo1,1
`;
    const rounds = `[rounds]\nID,Name\nR1,All About Bob\nR2,Cleo Time\n`;
    const s = stats(rounds + '\n' + csv);
    // R2 (Cleo Time) has no votes → no outcome for Cleo yet.
    expect(s.themeOutcomes.map((o) => o.roundName)).toEqual(['All About Bob']);
  });

  it('flags an unresolvable title rather than guessing', () => {
    const s = stats(league([{ title: 'Mystery Round', points: { Bob: 5, Cleo: 2 } }]));
    expect(s.themeOutcomes).toHaveLength(0);
    expect(s.themeUnresolved[0]).toMatch(/no theme player found/);
  });

  it('honours an override', () => {
    const s = stats(league([{ title: 'Mystery Round', points: { Bob: 5, Cleo: 2 } }]), {
      ...RULES,
      overrides: { 'Mystery Round': 'Cleo' },
    });
    expect(s.themeOutcomes[0].playerName).toBe('Cleo');
    expect(s.themeOutcomes[0].outcome).toBe('lost');
  });

  it('changes nothing when no theme rules are supplied', () => {
    const csv = league([{ title: 'All About Bob', points: { Bob: 5, Cleo: 2 } }]);
    const withTheme = stats(csv);
    const without = computeStats(parseLeague([{ name: 't.csv', text: csv }]), {
      scoring: 'competitive',
      flooring: 'none',
    });
    const bobWith = withTheme.players.find((p) => p.name === 'Bob')!;
    const bobWithout = without.players.find((p) => p.name === 'Bob')!;
    expect(bobWithout.themeBonus).toBe(0);
    expect(bobWithout.breakdown.theme).toBe(0);
    expect(bobWithout.pointsCounted).toBe(5);
    expect(bobWith.pointsCounted).toBe(8);
  });

  it('keeps every player breakdown reconciled', () => {
    const s = stats(
      league([
        { title: 'All About Bob', points: { Bob: 5, Cleo: 2 } },
        { title: 'Cleo Time', points: { Bob: 1, Cleo: 4 } },
      ]),
    );
    for (const p of s.players) {
      const b = p.breakdown;
      expect(b.upvotes - b.downvotes - b.forfeited + b.absorbed + b.theme).toBe(b.total);
      expect(b.total).toBe(p.pointsCounted);
    }
  });
});

/* Real league 2 round 1, when the export is present locally. It is gitignored,
 * so this is skipped in a clean checkout rather than failing. */
const L2 = join(__dirname, '..', '..', 'data', 'league2', 'export');
const describeReal = existsSync(L2) ? describe : describe.skip;

describeReal('league 2 (real data)', () => {
  const files = existsSync(L2)
    ? readdirSync(L2)
        .filter((f) => f.endsWith('.csv'))
        .map((name) => ({ name, text: readFileSync(join(L2, name), 'utf8') }))
    : [];

  it('scores theme outcomes correctly for Bob and Nina', () => {
    const s = computeStats(parseLeague(files), {
      scoring: 'competitive',
      flooring: 'none',
      totalRounds: 12,
      theme: RULES,
      budget: { upvotes: 10, downvotes: 10 },
    });
    const bob = s.players.find((p) => p.name === 'Bob')!;
    expect(s.themeOutcomes.find((o) => o.playerName === 'Bob')?.outcome).toBe('won');
    expect(bob.themeBonus).toBe(3);
    expect(bob.pointsCounted).toBe(-11);

    const nina = s.players.find((p) => p.name === 't33nwitch')!;
    expect(s.themeOutcomes.find((o) => o.playerName === 't33nwitch')?.outcome).toBe('lost');
    expect(nina.themeBonus).toBe(-3);
    expect(nina.pointsCounted).toBe(19);
  });
});
