import { describe, expect, it } from 'vitest';
import { validateLeagueConfig } from '../lib/config';

const base = { id: 'l', label: 'L', export: 'data/l/export' };

describe('validateLeagueConfig', () => {
  it('accepts a minimal config', () => {
    const c = validateLeagueConfig(base);
    expect(c.id).toBe('l');
    expect(c.theme).toBeUndefined();
  });

  it('accepts a full league 2 style config', () => {
    const c = validateLeagueConfig({
      ...base,
      totalRounds: 12,
      scoring: 'competitive',
      flooring: 'none',
      budget: { upvotes: 10, downvotes: 10 },
      theme: { source: 'title', win: 3, lose: -3, skip: -3, overrides: { 'Round X': 'Bob' } },
      history: ['league1'],
      redact: true,
      publish: { out: 'docs/v2', single: true },
    });
    expect(c.theme?.win).toBe(3);
    expect(c.budget?.upvotes).toBe(10);
    expect(c.history).toEqual(['league1']);
    expect(c.publish?.single).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(() => validateLeagueConfig({ ...base, wat: 1 })).toThrow(/unknown key "wat"/);
  });

  it('requires id, label and export', () => {
    expect(() => validateLeagueConfig({})).toThrow(/"id" is required/);
    expect(() => validateLeagueConfig({ id: 'l' })).toThrow(/"label" is required/);
    expect(() => validateLeagueConfig({ id: 'l', label: 'L' })).toThrow(/"export" is required/);
  });

  it('rejects a bad scoring mode', () => {
    expect(() => validateLeagueConfig({ ...base, scoring: 'weird' })).toThrow(/"scoring" must be/);
  });

  it('rejects a non-integer totalRounds', () => {
    expect(() => validateLeagueConfig({ ...base, totalRounds: 1.5 })).toThrow(/positive integer/);
  });

  it('rejects a theme missing a number', () => {
    expect(() =>
      validateLeagueConfig({ ...base, theme: { source: 'title', win: 3, lose: -3 } }),
    ).toThrow(/"theme.skip" must be a number/);
  });

  it('rejects a league that lists itself as history', () => {
    expect(() => validateLeagueConfig({ ...base, history: ['l'] })).toThrow(/cannot list itself/);
  });

  it('rejects a bad budget', () => {
    expect(() => validateLeagueConfig({ ...base, budget: { upvotes: 0, downvotes: 10 } })).toThrow(
      /"budget.upvotes" must be a positive number/,
    );
  });
});
