export type ObscurityBand = 'deep cut' | 'niche' | 'known' | 'popular' | 'hit';

/**
 * Bucket a listener count into a human label.
 * Thresholds are calibrated for Last.fm listener counts; other sources fall
 * back to 'known' rather than guessing at their scale.
 */
export function obscurityBand(value: number, source: string): ObscurityBand {
  if (source !== 'lastfm-listeners') return 'known';
  if (value < 20_000)    return 'deep cut';
  if (value < 100_000)   return 'niche';
  if (value < 500_000)   return 'known';
  if (value < 1_000_000) return 'popular';
  return 'hit';
}
