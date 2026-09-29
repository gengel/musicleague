import { describe, expect, it } from 'vitest';
import { parseHash, routeToHash, tabSlug } from '../lib/route';

describe('parseHash', () => {
  it('defaults to This Round', () => {
    expect(parseHash('')).toEqual({ demo: false, route: { kind: 'tab', tab: 'This Round' } });
  });

  it('parses a tab slug', () => {
    expect(parseHash('#standings').route).toEqual({ kind: 'tab', tab: 'Standings' });
    expect(parseHash('#this-round').route).toEqual({ kind: 'tab', tab: 'This Round' });
  });

  it('redirects legacy names', () => {
    expect(parseHash('#the-race').route).toEqual({ kind: 'tab', tab: 'Standings' });
    expect(parseHash('#network').route).toEqual({ kind: 'tab', tab: 'Room' });
    expect(parseHash('#future').route).toEqual({ kind: 'tab', tab: 'Standings' });
    expect(parseHash('#play-by-play').route).toEqual({ kind: 'tab', tab: 'Rounds' });
  });

  it('parses a player route', () => {
    expect(parseHash('#player/bob').route).toEqual({ kind: 'player', slug: 'bob' });
    expect(parseHash('#player/tim-e').route).toEqual({ kind: 'player', slug: 'tim-e' });
  });

  it('parses a round route', () => {
    expect(parseHash('#round/3').route).toEqual({ kind: 'round', sequence: 3 });
  });

  it('handles the legacy demo form', () => {
    expect(parseHash('#demo:Voting')).toEqual({ demo: true, route: { kind: 'tab', tab: 'Room' } });
    expect(parseHash('#demo')).toEqual({ demo: true, route: { kind: 'tab', tab: 'This Round' } });
  });

  it('round-trips through routeToHash', () => {
    expect(routeToHash({ kind: 'tab', tab: 'Songs' })).toBe('songs');
    expect(routeToHash({ kind: 'player', slug: 'bob' })).toBe('player/bob');
    expect(routeToHash({ kind: 'round', sequence: 2 })).toBe('round/2');
    expect(parseHash('#' + routeToHash({ kind: 'player', slug: 'cleo' })).route).toEqual({
      kind: 'player',
      slug: 'cleo',
    });
  });

  it('slugs tab names', () => {
    expect(tabSlug('This Round')).toBe('this-round');
  });
});
