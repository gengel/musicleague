/** Types for the build-time genre resolver. */

export interface RawTag {
  name: string;
  count?: number;
}

/** Maps one crowd-sourced tag onto the fixed vocabulary, or null if it is not a genre. */
export function canonicalGenre(tag: string | RawTag): string | null;

/** Picks at most `keep` genres for an artist from their weighted tags. */
export function genresFromTags(tags?: (RawTag | string)[] | null, keep?: number): string[];

export function fetchGenres(
  artists: string[],
  opts?: { cachePath?: string; timeoutMs?: number; onProgress?: () => void },
): Promise<{
  genres: Record<string, string[]>;
  resolved: number;
  unresolved: string[];
  fromCache: number;
}>;
