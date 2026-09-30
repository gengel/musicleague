import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eraIcon, genreIcon, popularityIcon } from '../components/Icons';

describe('popularityIcon', () => {
  it('maps every band to a signal meter', () => {
    for (const band of ['deep cut', 'niche', 'known', 'popular', 'hit']) {
      expect(popularityIcon(band)).toMatch(/^signal[1-4]$/);
    }
    expect(popularityIcon('deep cut')).toBe('signal1');
    expect(popularityIcon('hit')).toBe('signal4');
    expect(popularityIcon('unknown')).toBe('signal3');
  });
});

describe('eraIcon', () => {
  it('maps decades to their medium', () => {
    expect(eraIcon('1960s')).toBe('vinyl');
    expect(eraIcon('1980s')).toBe('cassette');
    expect(eraIcon('2000s')).toBe('cd');
    expect(eraIcon('2010s')).toBe('phone');
    expect(eraIcon('2020s')).toBe('phone');
    expect(eraIcon('')).toBe('disc');
  });
});

describe('genreIcon', () => {
  it('groups common genres into families', () => {
    expect(genreIcon('Hip hop')).toBe('mic');
    expect(genreIcon('Alternative')).toBe('guitar');
    expect(genreIcon('Rock')).toBe('guitar');
    expect(genreIcon('Electronic')).toBe('synth');
    expect(genreIcon('Jazz')).toBe('sax');
    expect(genreIcon('Folk')).toBe('banjo');
    expect(genreIcon('Klezmer')).toBe('tag'); // fallback
  });

  it('resolves every genre present in the baked genre data', () => {
    // genreIcon must at least return a valid icon name for real vocabulary.
    const cache = JSON.parse(readFileSync(join(__dirname, '..', '..', '.cache', 'genres.json'), 'utf8'));
    const genres = new Set<string>();
    for (const list of Object.values(cache) as string[][]) for (const g of list) genres.add(g);
    for (const g of genres) expect(typeof genreIcon(g)).toBe('string');
    expect(genres.size).toBeGreaterThan(0);
  });
});
