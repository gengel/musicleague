/**
 * Loaders for song enrichment: release year, cover/remix relationships,
 * Wikipedia liner notes, obscurity, and round semantics.
 *
 * All of it is optional. A league with no `enrich/` directory, or with any
 * individual file missing, still works — every panel that reads this data
 * degrades to not showing that dimension rather than failing. See I6.
 *
 * Everything here is keyed by **Spotify track URI**, not by song title. A
 * title alone repeats across rounds and carries version suffixes such as
 * "Get Back - 2010 Remaster", so it cannot be trusted as a stable key; the
 * export's own track id can be.
 *
 * Nothing here is fetched at bake time by an LLM. Every file is data,
 * produced ahead of time by `scripts/enrich.mjs` or by hand, and committed,
 * so a build stays a pure function of its inputs — deterministic, offline,
 * and testable.
 */

export interface CoverInfo {
  originalTitle: string;
  originalArtist: string;
  /** Release year of the original, when known. */
  originalYear?: number;
  note?: string;
}

export interface ObscurityInfo {
  /** Higher means more mainstream. Scale depends on `source`. */
  value: number;
  source: 'spotify-popularity' | 'lastfm-listeners' | 'manual';
  /** ISO-8601. Popularity metrics drift, so a value is pinned to when it was read. */
  fetchedAt: string;
}

export type RoundKind = 'covers' | 'remix' | 'none';

export interface RoundMeta {
  kind: RoundKind;
}

export interface EnrichmentData {
  /** Spotify track URI -> release year. */
  years: Map<string, number>;
  /** Spotify track URI -> what it covers or remixes. */
  covers: Map<string, CoverInfo>;
  /** Spotify track URI -> one trimmed, editorially-chosen fact. */
  facts: Map<string, string>;
  /** Spotify track URI -> obscurity reading. */
  obscurity: Map<string, ObscurityInfo>;
  /** Spotify track URI -> track duration in milliseconds. */
  durations: Map<string, number>;
  /** Round id -> its semantics (is this a covers round, a remix round...). */
  rounds: Map<string, RoundMeta>;
}

/** An `EnrichmentData` with every dimension empty — the "no enrich/" case. */
export function emptyEnrichment(): EnrichmentData {
  return {
    years: new Map(),
    covers: new Map(),
    facts: new Map(),
    obscurity: new Map(),
    durations: new Map(),
    rounds: new Map(),
  };
}

/** Raw JSON shapes as read from enrich/*.json, before parsing into Maps. */
export interface RawEnrichmentFiles {
  years?: Record<string, number> | null;
  covers?: Record<string, CoverInfo> | null;
  facts?: Record<string, string> | null;
  obscurity?: Record<string, ObscurityInfo> | null;
  durations?: Record<string, number> | null;
  rounds?: Record<string, RoundMeta> | null;
}

/**
 * Builds `EnrichmentData` from whatever raw JSON was actually read. Any
 * missing or malformed file is treated as absent rather than an error — this
 * is the boundary that keeps every dimension optional (I6).
 */
export function parseEnrichment(raw: RawEnrichmentFiles): EnrichmentData {
  const data = emptyEnrichment();
  if (raw.years) for (const [uri, year] of Object.entries(raw.years)) data.years.set(uri, year);
  if (raw.covers) for (const [uri, info] of Object.entries(raw.covers)) data.covers.set(uri, info);
  if (raw.facts) for (const [uri, fact] of Object.entries(raw.facts)) data.facts.set(uri, fact);
  if (raw.obscurity) {
    for (const [uri, info] of Object.entries(raw.obscurity)) data.obscurity.set(uri, info);
  }
  if (raw.durations) {
    for (const [uri, ms] of Object.entries(raw.durations)) data.durations.set(uri, ms);
  }
  if (raw.rounds) for (const [id, meta] of Object.entries(raw.rounds)) data.rounds.set(id, meta);
  return data;
}

/**
 * Coverage of each optional dimension, as a fraction of the songs given.
 * Lets a panel decide whether it has enough to say something rather than
 * hard-coding a sample-size threshold at every call site.
 */
export interface MetricAvailability {
  years: number;
  covers: number;
  facts: number;
  obscurity: number;
}

export function computeAvailability(
  data: EnrichmentData,
  spotifyIds: (string | undefined)[],
): MetricAvailability {
  const ids = spotifyIds.filter((id): id is string => Boolean(id));
  const total = ids.length;
  if (total === 0) return { years: 0, covers: 0, facts: 0, obscurity: 0 };
  const frac = (map: Map<string, unknown>) => ids.filter((id) => map.has(id)).length / total;
  return {
    years: frac(data.years),
    covers: frac(data.covers),
    facts: frac(data.facts),
    obscurity: frac(data.obscurity),
  };
}

/**
 * Layers enrichment onto a list of songs (or anything with an optional
 * `spotifyId`), returning new objects rather than mutating in place.
 *
 * Kept separate from `computeStats` on purpose: the scoring engine stays a
 * pure function of the export alone, exactly reproducible from an archived
 * snapshot (I7), while enrichment is free to improve between rounds without
 * calling that guarantee into question.
 */
export function attachEnrichment<T extends { spotifyId?: string }>(
  items: T[],
  data: EnrichmentData,
): (T & {
  year?: number;
  cover?: CoverInfo;
  fact?: string;
  obscurity?: ObscurityInfo;
})[] {
  return items.map((item) => {
    const id = item.spotifyId;
    if (!id) return { ...item };
    return {
      ...item,
      year: data.years.get(id),
      cover: data.covers.get(id),
      fact: data.facts.get(id),
      obscurity: data.obscurity.get(id),
      durationMs: data.durations.get(id),
    };
  });
}
