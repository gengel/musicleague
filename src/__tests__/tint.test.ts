import { describe, expect, it } from 'vitest';
import { isUsableTint, luminance, paletteTint, saturation, TINT_PALETTE } from '../lib/tint';
import { careerStoryline } from '../lib/playerProfile';

describe('paletteTint', () => {
  it('is deterministic and in-palette', () => {
    expect(paletteTint('abc')).toBe(paletteTint('abc'));
    expect(TINT_PALETTE).toContain(paletteTint('abc'));
  });
  it('spreads different ids across the palette', () => {
    const seen = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(paletteTint));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('isUsableTint', () => {
  it('rejects near-black, near-white and grey; accepts a vivid colour', () => {
    expect(isUsableTint(8, 8, 8)).toBe(false); // near-black
    expect(isUsableTint(250, 250, 250)).toBe(false); // near-white
    expect(isUsableTint(128, 128, 128)).toBe(false); // grey
    expect(isUsableTint(220, 40, 120)).toBe(true); // vivid pink
  });
  it('luminance and saturation are sane', () => {
    expect(luminance(0, 0, 0)).toBeCloseTo(0);
    expect(luminance(255, 255, 255)).toBeCloseTo(1);
    expect(saturation(128, 128, 128)).toBe(0);
    expect(saturation(255, 0, 0)).toBeGreaterThan(0.9);
  });
});

describe('careerStoryline', () => {
  const app = (label: string, finish: number, of: number, current = false) => ({ label, finish, of, current });

  it('reads a climb across seasons (current-first input)', () => {
    // current-first: newest S2 1st, older S1 12th → climbed
    expect(careerStoryline([app('S2', 1, 12, true), app('S1', 12, 13)])).toBe('Climbed 12th → 1st');
  });
  it('reads a slide', () => {
    expect(careerStoryline([app('S2', 12, 12, true), app('S1', 2, 13)])).toBe('Slid 2nd → 12th');
  });
  it('flags a podium every season', () => {
    expect(careerStoryline([app('S2', 2, 12, true), app('S1', 3, 13)])).toBe('Podium every season');
  });
  it('handles a single season', () => {
    expect(careerStoryline([app('S2', 1, 12, true)])).toBe('Won it');
    expect(careerStoryline([app('S2', 8, 12, true)])).toBeUndefined();
  });
  it('is undefined with no ranked finishes', () => {
    expect(careerStoryline([{ label: 'S2', current: true }])).toBeUndefined();
  });
});
