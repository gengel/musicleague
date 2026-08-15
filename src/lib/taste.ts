import type { Stats } from './stats';

/**
 * What era a player's taste actually sits in, blending what they submit with
 * what they reward, and how that lines up with obscurity when it is known.
 *
 * Submissions count twice as much as upvotes in the blend, per an explicit
 * product decision: a submission is a deliberate statement ("this is my
 * song"), while an upvote is one of several spent on a crowded ballot and
 * says less on its own. This is a stated choice, not a statistically
 * defended one — the archetypes are for fun, and the weighting is fixed at
 * 2:1 so a label means the same thing for every player.
 *
 * Two things this deliberately does not correct for, on the same "this is
 * for fun" basis: round 1's theme was "a song from your birth year", so
 * every player's earliest data point is really an age proxy, and any given
 * player's obscurity number is collinear with their era number more often
 * than not. Both are left in — a footnote, not a blocker.
 */

export interface PlayerEraProfile {
  playerId: string;
  name: string;
  /** Median release year of songs this player submitted. */
  submittedYear?: number;
  submittedCount: number;
  /** Points-weighted mean release year of songs this player upvoted. */
  upvotedYear?: number;
  upvotedCount: number;
  /** (2 * submittedYear + upvotedYear) / 3, the era this player is filed under. */
  blendYear?: number;
  /** |submittedYear - upvotedYear| — how far apart what they submit and reward are. */
  eraGap?: number;
}

function median(xs: number[]): number {
  if (!xs.length) return undefined as unknown as number;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Points-weighted mean, ignoring items with no year. */
function weightedMeanYear(pairs: { year: number; weight: number }[]): number | undefined {
  const totalWeight = pairs.reduce((a, p) => a + p.weight, 0);
  if (totalWeight <= 0) return undefined;
  return pairs.reduce((a, p) => a + p.year * p.weight, 0) / totalWeight;
}

/**
 * Builds an era profile for every player who submitted at least one dated
 * song. Players with no dated submissions are omitted rather than given a
 * fabricated era (I6) — a missing `year` on every one of their songs is a
 * real, supported state.
 */
export function computeEraProfiles(stats: Stats): PlayerEraProfile[] {
  const profiles: PlayerEraProfile[] = [];

  for (const player of stats.players) {
    if (player.songs === 0) continue;
    const mine = stats.songs.filter((s) => s.submitterId === player.playerId);
    const dated = mine.filter((s) => s.year !== undefined).map((s) => s.year as number);
    const submittedYear = dated.length ? median(dated) : undefined;

    // Every song this player gave a positive vote to, weighted by how many
    // points they gave it — a 5-point upvote says more about their taste
    // than a 1-point one.
    const upvotedPairs = stats.league.votes
      .filter((v) => v.voterId === player.playerId && v.points > 0)
      .map((v) => {
        const song = stats.songs.find((s) => s.trackId === v.trackId && s.roundId === v.roundId);
        return song?.year !== undefined ? { year: song.year, weight: v.points } : undefined;
      })
      .filter((x): x is { year: number; weight: number } => x !== undefined);
    const upvotedYear = weightedMeanYear(upvotedPairs);

    const blendYear =
      submittedYear !== undefined && upvotedYear !== undefined
        ? (2 * submittedYear + upvotedYear) / 3
        : submittedYear;

    profiles.push({
      playerId: player.playerId,
      name: player.name,
      submittedYear,
      submittedCount: dated.length,
      upvotedYear,
      upvotedCount: upvotedPairs.length,
      blendYear,
      eraGap:
        submittedYear !== undefined && upvotedYear !== undefined
          ? Math.abs(submittedYear - upvotedYear)
          : undefined,
    });
  }

  return profiles.sort((a, b) => (b.blendYear ?? 0) - (a.blendYear ?? 0));
}

/**
 * Players whose submit-era and reward-era diverge by at least `minGap`
 * years — the "double agent" tag: someone who submits one era but votes for
 * another. 13 is the smallest gap that separated a real signal from noise in
 * the league this was built against; treat it as a starting point, not a
 * constant with any statistical meaning.
 */
export function findDoubleAgents(profiles: PlayerEraProfile[], minGap = 13): PlayerEraProfile[] {
  return profiles
    .filter((p) => p.eraGap !== undefined && p.eraGap >= minGap)
    .sort((a, b) => (b.eraGap ?? 0) - (a.eraGap ?? 0));
}

export interface DecadeStats {
  decade: number; // e.g. 1990
  count: number;
  avgNet: number;
}

/** Average net score by release decade, across every dated song. */
export function computeDecadeTable(stats: Stats): DecadeStats[] {
  const byDecade = new Map<number, number[]>();
  for (const song of stats.songs) {
    if (song.year === undefined) continue;
    const decade = Math.floor(song.year / 10) * 10;
    const arr = byDecade.get(decade);
    if (arr) arr.push(song.net);
    else byDecade.set(decade, [song.net]);
  }
  return [...byDecade.entries()]
    .map(([decade, nets]) => ({
      decade,
      count: nets.length,
      avgNet: nets.reduce((a, b) => a + b, 0) / nets.length,
    }))
    .sort((a, b) => a.decade - b.decade);
}

/**
 * Archetype bands, defined on era alone so a label never changes meaning
 * once obscurity data arrives — obscurity only ever adds a modifier (see
 * `describeArchetype`), never re-buckets a player into a different band.
 */
const ERA_BANDS: { max: number; label: string }[] = [
  { max: 1979, label: 'Vinyl era' },
  { max: 1999, label: 'Crate digger' },
  { max: 2009, label: 'Y2K kid' },
  { max: 2019, label: 'Streaming native' },
  { max: Infinity, label: 'Algorithm native' },
];

export function eraBand(blendYear: number): string {
  return ERA_BANDS.find((b) => blendYear <= b.max)?.label ?? 'Algorithm native';
}

/**
 * Adds an obscurity modifier to an era band label, without changing the
 * band itself. Absent obscurity data yields the bare label — a supported,
 * unmodified state (I6), not a placeholder.
 */
export function describeArchetype(blendYear: number | undefined, obscurity?: number): string {
  if (blendYear === undefined) return 'Unclassified';
  const band = eraBand(blendYear);
  if (obscurity === undefined) return band;
  // Obscurity scale is provider-defined (0-100 typical for Spotify-shaped
  // popularity); treat the lower third as "deep cuts" and the upper third as
  // "greatest hits" without hard-coding a single provider's exact scale.
  if (obscurity <= 33) return `${band}, deep cuts`;
  if (obscurity >= 67) return `${band}, greatest hits`;
  return band;
}

export type ObscurityQuadrant = 'old & obscure' | 'old & famous' | 'new & obscure' | 'new & famous';

/**
 * The four-way split of old/new crossed with obscure/famous. Degrades to a
 * single axis (just old vs. new, i.e. the decade table) when no obscurity
 * data is available — see `computeDecadeTable` for that case; this function
 * simply returns no quadrant assignment for a song missing either axis.
 */
export function classifyQuadrant(
  year: number,
  obscurity: number,
  medianYear: number,
  obscurityMidpoint = 50,
): ObscurityQuadrant {
  const isOld = year <= medianYear;
  const isObscure = obscurity <= obscurityMidpoint;
  if (isOld && isObscure) return 'old & obscure';
  if (isOld && !isObscure) return 'old & famous';
  if (!isOld && isObscure) return 'new & obscure';
  return 'new & famous';
}

export interface QuadrantStats {
  quadrant: ObscurityQuadrant;
  count: number;
  avgNet: number;
}

/**
 * The quadrant table. Returns an empty array when no song has both a year
 * and an obscurity reading — callers should fall back to `computeDecadeTable`
 * in that case, which is the honest single-axis version of this same idea.
 */
export function computeQuadrantTable(stats: Stats): QuadrantStats[] {
  const dated = stats.songs.filter((s) => s.year !== undefined && s.obscurity !== undefined);
  if (!dated.length) return [];

  const medianYear = median(dated.map((s) => s.year as number));
  const byQuadrant = new Map<ObscurityQuadrant, number[]>();
  for (const song of dated) {
    const q = classifyQuadrant(song.year as number, song.obscurity!.value, medianYear);
    const arr = byQuadrant.get(q);
    if (arr) arr.push(song.net);
    else byQuadrant.set(q, [song.net]);
  }

  return [...byQuadrant.entries()].map(([quadrant, nets]) => ({
    quadrant,
    count: nets.length,
    avgNet: nets.reduce((a, b) => a + b, 0) / nets.length,
  }));
}
