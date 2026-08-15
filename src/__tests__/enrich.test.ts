import { describe, expect, it } from 'vitest';
import { attachEnrichment, computeAvailability, emptyEnrichment, parseEnrichment } from '../lib/enrich';

describe('parseEnrichment (I6 — absent data is a supported state)', () => {
  it('yields an empty but valid EnrichmentData when nothing is given', () => {
    const data = parseEnrichment({});
    expect(data.years.size).toBe(0);
    expect(data.covers.size).toBe(0);
    expect(data.facts.size).toBe(0);
    expect(data.obscurity.size).toBe(0);
    expect(data.rounds.size).toBe(0);
  });

  it('treats an explicit null the same as a missing file', () => {
    const data = parseEnrichment({ years: null, covers: null, facts: null });
    expect(data.years.size).toBe(0);
    expect(data.covers.size).toBe(0);
  });

  it('parses whichever files are actually present, independently', () => {
    // Enrichment JSON uses full spotify:track: URIs as keys; parseEnrichment
    // normalizes them to the bare id used by SongStats.spotifyId.
    const data = parseEnrichment({
      years: { 'spotify:track:a': 1994 },
      // covers, facts, obscurity, rounds all absent
    });
    expect(data.years.get('a')).toBe(1994);
    expect(data.covers.size).toBe(0);
  });

  it('parses covers, facts, obscurity and rounds when given', () => {
    const data = parseEnrichment({
      covers: {
        'spotify:track:a': {
          originalTitle: 'Get Back',
          originalArtist: 'The Beatles',
          originalYear: 1969,
          note: '#1 in US and UK',
        },
      },
      facts: { 'spotify:track:a': 'Reached number one in 1969.' },
      obscurity: {
        'spotify:track:a': { value: 42, source: 'spotify-popularity', fetchedAt: '2026-08-14T00:00:00Z' },
      },
      rounds: { r6: { kind: 'covers' } },
    });
    expect(data.covers.get('a')?.originalArtist).toBe('The Beatles');
    expect(data.facts.get('a')).toContain('1969');
    expect(data.obscurity.get('a')?.source).toBe('spotify-popularity');
    // Round ids are not normalized (they aren't spotify URIs).
    expect(data.rounds.get('r6')?.kind).toBe('covers');
  });
});

describe('computeAvailability', () => {
  it('reports zero coverage for every dimension with no ids', () => {
    expect(computeAvailability(emptyEnrichment(), [])).toEqual({
      years: 0,
      covers: 0,
      facts: 0,
      obscurity: 0,
    });
  });

  it('computes coverage as a fraction of the ids actually given', () => {
    const data = parseEnrichment({
      years: { a: 1994, b: 2001 },
      obscurity: {}, // present but empty — still a real, zero-coverage file
    });
    const availability = computeAvailability(data, ['a', 'b', 'c', 'd']);
    expect(availability.years).toBe(0.5);
    expect(availability.obscurity).toBe(0);
    expect(availability.covers).toBe(0);
  });

  it('ignores undefined ids rather than counting them against coverage', () => {
    const data = parseEnrichment({ years: { a: 1994 } });
    const availability = computeAvailability(data, ['a', undefined, undefined]);
    expect(availability.years).toBe(1);
  });
});

describe('attachEnrichment', () => {
  it('layers matching fields onto items with a spotifyId', () => {
    const data = parseEnrichment({
      years: { a: 1994 },
      facts: { a: 'A fact.' },
    });
    const items: { spotifyId?: string; title: string }[] = [{ spotifyId: 'a', title: 'X' }];
    const [song] = attachEnrichment<{ spotifyId?: string; title: string }>(items, data);
    expect(song.year).toBe(1994);
    expect(song.fact).toBe('A fact.');
    expect(song.cover).toBeUndefined();
    expect(song.title).toBe('X'); // original fields survive
  });

  it('leaves every field undefined for a song with no spotifyId, rather than throwing', () => {
    const data = parseEnrichment({ years: { a: 1994 } });
    const items: { spotifyId?: string; title: string }[] = [{ title: 'No id' }];
    const [song] = attachEnrichment<{ spotifyId?: string; title: string }>(items, data);
    expect(song.year).toBeUndefined();
    expect(song.title).toBe('No id');
  });

  it('leaves every field undefined for a song whose id has no enrichment', () => {
    const data = parseEnrichment({ years: { a: 1994 } });
    const [song] = attachEnrichment([{ spotifyId: 'unknown-id' }], data);
    expect(song.year).toBeUndefined();
  });

  it('does not mutate the input array', () => {
    const data = parseEnrichment({ years: { a: 1994 } });
    const input = [{ spotifyId: 'a' }];
    const [song] = attachEnrichment(input, data);
    expect(input[0]).not.toHaveProperty('year');
    expect(song.year).toBe(1994);
  });
});
