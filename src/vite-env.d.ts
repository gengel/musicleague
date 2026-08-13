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
  /** Album art inlined at bake time, keyed by Spotify track id. */
  export const embeddedArt: Record<string, { sm?: string; lg?: string; xl?: string }>;
  /** Artist genres resolved at bake time, when --genres was passed. */
  export const embeddedGenres: Record<string, string[]>;
}
