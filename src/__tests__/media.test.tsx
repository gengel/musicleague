// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SongLinks,
  SongPlayer,
  spotifyEmbedUrl,
  spotifyTrackUrl,
  youTubeSearchUrl,
} from '../components/SongMedia';
import { iconFor } from '../components/Icons';
import { spotifyTrackId } from '../lib/parse';

afterEach(cleanup);

describe('spotifyTrackId', () => {
  it('reads the id out of the classic export URI', () => {
    expect(spotifyTrackId('spotify:track:2SHTKB8YYlawTGIuJ2b2ok')).toBe('2SHTKB8YYlawTGIuJ2b2ok');
  });

  it('reads it out of a share URL', () => {
    expect(spotifyTrackId('https://open.spotify.com/track/2SHTKB8YYlawTGIuJ2b2ok?si=abc')).toBe(
      '2SHTKB8YYlawTGIuJ2b2ok',
    );
  });

  it('accepts a bare id', () => {
    expect(spotifyTrackId('2SHTKB8YYlawTGIuJ2b2ok')).toBe('2SHTKB8YYlawTGIuJ2b2ok');
  });

  it('returns nothing for anything else, rather than a broken link', () => {
    expect(spotifyTrackId(undefined)).toBeUndefined();
    expect(spotifyTrackId('')).toBeUndefined();
    expect(spotifyTrackId('not-a-track')).toBeUndefined();
    expect(spotifyTrackId('track123')).toBeUndefined();
  });
});

describe('link building', () => {
  it('points at the exact Spotify track', () => {
    expect(spotifyTrackUrl('abc123')).toBe('https://open.spotify.com/track/abc123');
    expect(spotifyEmbedUrl('abc123')).toContain('open.spotify.com/embed/track/abc123');
  });

  it('escapes a search query rather than breaking the URL', () => {
    const url = youTubeSearchUrl('Nothin\u2019 But A Good Time', 'Poison');
    expect(url.startsWith('https://www.youtube.com/results?search_query=')).toBe(true);
    expect(url).not.toMatch(/[ "]/);
    expect(decodeURIComponent(url.split('=')[1])).toBe('Nothin\u2019 But A Good Time Poison');
  });
});

describe('SongLinks', () => {
  it('offers Spotify and YouTube when the track id is known', () => {
    render(<SongLinks title="Real Love" artist="Mary J. Blige" spotifyId="abc123" />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toContain('open.spotify.com/track/abc123');
    expect(links[1].getAttribute('href')).toContain('youtube.com/results');
  });

  it('falls back to a YouTube search when there is no track id', () => {
    render(<SongLinks title="Real Love" artist="Mary J. Blige" />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toContain('youtube.com/results');
  });

  it('opens in a new tab without leaking the referrer', () => {
    render(<SongLinks title="Real Love" artist="Mary J. Blige" spotifyId="abc123" />);
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noreferrer');
    }
  });
});

describe('SongPlayer', () => {
  it('requests nothing from Spotify until asked', () => {
    render(<SongPlayer title="Real Love" spotifyId="abc123" />);
    // The whole privacy claim rests on this: no iframe before the click.
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('button', { name: /play/i })).toBeDefined();
  });

  it('loads the embed once play is pressed', async () => {
    const user = userEvent.setup();
    render(<SongPlayer title="Real Love" spotifyId="abc123" />);
    await user.click(screen.getByRole('button', { name: /play/i }));

    const frame = document.querySelector('iframe')!;
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('src')).toContain('open.spotify.com/embed/track/abc123');
    expect(frame.getAttribute('loading')).toBe('lazy');
    expect(frame.getAttribute('title')).toContain('Real Love');
    // Sandboxed: the embed cannot navigate the page hosting it.
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
  });
});

describe('icon choice', () => {
  it('picks a distinct icon for each headline card', () => {
    const labels = [
      'Biggest single haul',
      'Widest appeal',
      'Most divisive',
      'Biggest superfan',
      'Coldest shoulder',
      'Mutual admiration society',
      'Most unrequited',
      'Arch-nemesis',
      'Biggest contrarian',
      'Most mainstream taste',
      'Chattiest',
    ];
    const chosen = labels.map(iconFor);
    // A wall of identical icons would be worse than none.
    expect(new Set(chosen).size).toBeGreaterThanOrEqual(labels.length - 1);
  });

  it('matches the sense of the label', () => {
    expect(iconFor('Most unrequited')).toBe('heartBreak');
    expect(iconFor('Mutual admiration society')).toBe('handshake');
    expect(iconFor('Coldest shoulder')).toBe('snowflake');
    expect(iconFor('Held a grudge')).toBe('snowflake');
    expect(iconFor('Arch-nemesis')).toBe('swords');
    expect(iconFor('Biggest contrarian')).toBe('compass');
    expect(iconFor('The cost of silence')).toBe('mute');
    expect(iconFor('Runaway leader')).toBe('crown');
  });

  it('falls back rather than rendering nothing for an unknown label', () => {
    expect(iconFor('Some brand new superlative')).toBe('spark');
  });
});
