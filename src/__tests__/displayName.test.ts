import { describe, expect, it } from 'vitest';
import {
  buildDisplayNameResolver,
  hasNameCollision,
  identityKey,
  isPlaceholderName,
  type Player,
} from '../lib/types';

describe('displayName resolver (I1)', () => {
  // The real league this app was built against has two players sharing a
  // first name — "Caroline" and "Caroline Cone" — and one led the season
  // while the other finished last. Any narrative feature that shortens to
  // a first name would silently swap their story.
  const roster: Player[] = [
    { id: 'p1', name: 'Caroline', placeholder: false },
    { id: 'p2', name: 'Caroline Cone', placeholder: false },
    { id: 'p3', name: 'Tim Engel', placeholder: false },
    { id: 'p4', name: 'Greggo', placeholder: false },
  ];

  it('flags the collision in this roster', () => {
    expect(hasNameCollision(roster)).toBe(true);
  });

  it('does not flag a roster with no shared first names', () => {
    const distinct: Player[] = [
      { id: 'p1', name: 'Ada', placeholder: false },
      { id: 'p2', name: 'Bea', placeholder: false },
    ];
    expect(hasNameCollision(distinct)).toBe(false);
  });

  it('resolves each player to their own full name, never a shortened one', () => {
    const displayName = buildDisplayNameResolver(roster);
    expect(displayName('p1')).toBe('Caroline');
    expect(displayName('p2')).toBe('Caroline Cone');
    expect(displayName('p3')).toBe('Tim Engel');
  });

  it('never resolves two different players to the same string', () => {
    const displayName = buildDisplayNameResolver(roster);
    const resolved = roster.map((p) => displayName(p.id));
    expect(new Set(resolved).size).toBe(roster.length);
  });

  it('falls back to the id for an unknown player rather than throwing', () => {
    const displayName = buildDisplayNameResolver(roster);
    expect(displayName('nope')).toBe('nope');
  });
});

describe('isPlaceholderName', () => {
  it('still recognises bracketed and named placeholders', () => {
    expect(isPlaceholderName('[Anonymous]')).toBe(true);
    expect(isPlaceholderName('Removed User')).toBe(true);
    expect(isPlaceholderName('Caroline')).toBe(false);
  });
});

describe('identityKey', () => {
  it('is unaffected by the resolver addition', () => {
    expect(identityKey('  Caroline   Cone ')).toBe('caroline cone');
  });
});
