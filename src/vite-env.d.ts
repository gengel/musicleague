/// <reference types="vite/client" />

/**
 * League data baked into the bundle by `npm run bake`.
 * All three are inert in a normal build, where the visitor supplies a file.
 */
declare module 'virtual:league-data' {
  export const embeddedFiles: { name: string; text: string }[] | null;
  export const embeddedLabel: string | null;
  /** True when surnames were redacted before embedding. */
  export const embeddedRedacted: boolean;
  /** Scoring model chosen at bake time, or null to infer. */
  export const embeddedScoring: 'competitive' | 'friendly' | null;
  /** Zero-floor rule chosen at bake time, or null to infer. */
  export const embeddedFlooring: 'song' | 'none' | null;
  /** Rounds the league will run in total, when stated at bake time. */
  export const embeddedTotalRounds: number | null;
  /** Album art fetched at bake time, written to dist/art and keyed here by
   *  Spotify track id. Values are filenames relative to the site's art/
   *  directory, not inlined data — see `artFor` in SongMedia.tsx. */
  export const embeddedArt: Record<string, { sm?: string; lg?: string; xl?: string }>;
  /** Artist genres resolved at bake time, when --genres was passed. */
  export const embeddedGenres: Record<string, string[]>;
  /**
   * Song enrichment (years, covers, facts, obscurity, round semantics) read
   * from enrich/*.json at bake time. Raw JSON shape — see RawEnrichmentFiles
   * in src/lib/enrich.ts, which is what actually parses this into usable
   * Maps. Empty in a normal (non-baked) build, which is a supported state.
   */
  export const embeddedEnrichment: {
    years?: Record<string, number>;
    covers?: Record<string, { originalTitle: string; originalArtist: string; originalYear?: number; note?: string }>;
    facts?: Record<string, string>;
    obscurity?: Record<string, { value: number; source: 'spotify-popularity' | 'lastfm-listeners' | 'manual'; fetchedAt: string }>;
    durations?: Record<string, number>;
    rounds?: Record<string, { kind: 'covers' | 'remix' | 'none' }>;
  };
}
