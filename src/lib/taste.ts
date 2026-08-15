import type { Stats } from './stats';
import { obscurityBand, type ObscurityBand } from './obscurity';

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
  /** Mean obscurity (listener count) across this player's submitted songs, when any are rated. */
  avgObscurity?: number;
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

    const ratedMine = mine.filter((s) => s.obscurity !== undefined);
    const avgObscurity = ratedMine.length
      ? ratedMine.reduce((a, s) => a + s.obscurity!.value, 0) / ratedMine.length
      : undefined;

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
      avgObscurity,
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

/** Average net score by release decade, across every dated song.
 *  Decades before 1990 are merged into a single pre-1990 bucket (decade=0). */
export function computeDecadeTable(stats: Stats): DecadeStats[] {
  const byDecade = new Map<number, number[]>();
  for (const song of stats.songs) {
    if (song.year === undefined) continue;
    const raw = Math.floor(song.year / 10) * 10;
    const decade = raw < 1990 ? 0 : raw;
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
export interface QuadrantMidpoints {
  year: number;
  obscurity: number;
}

/**
 * The quadrant table. Returns an empty array when no song has both a year
 * and an obscurity reading (I6). The split midpoints are derived from the
 * actual data so the quadrant is always four meaningful groups regardless
 * of the obscurity provider's scale (Last.fm listeners vs Spotify popularity).
 */
export function computeQuadrantTable(stats: Stats): { rows: QuadrantStats[]; midpoints: QuadrantMidpoints } {
  const dated = stats.songs.filter((s) => s.year !== undefined && s.obscurity !== undefined);
  if (!dated.length) return { rows: [], midpoints: { year: 0, obscurity: 0 } };

  const medianYear = median(dated.map((s) => s.year as number));
  const medianObscurity = median(dated.map((s) => s.obscurity!.value));

  const byQuadrant = new Map<ObscurityQuadrant, number[]>();
  for (const song of dated) {
    const q = classifyQuadrant(song.year as number, song.obscurity!.value, medianYear, medianObscurity);
    const arr = byQuadrant.get(q);
    if (arr) arr.push(song.net);
    else byQuadrant.set(q, [song.net]);
  }

  const rows = [...byQuadrant.entries()].map(([quadrant, nets]) => ({
    quadrant,
    count: nets.length,
    avgNet: nets.reduce((a, b) => a + b, 0) / nets.length,
  }));

  return { rows, midpoints: { year: medianYear, obscurity: medianObscurity } };
}

export type EraBucket = 'pre-1990' | '1990s' | '2000s' | '2010s' | '2020s';
export type PopBucket = 'Deep cut' | 'Niche' | 'Known' | 'Popular' | 'Hit';

export const ERA_BUCKETS: EraBucket[] = ['pre-1990', '1990s', '2000s', '2010s', '2020s'];
export const POP_BUCKETS: PopBucket[] = ['Deep cut', 'Niche', 'Known', 'Popular', 'Hit'];

function eraBucket(year: number): EraBucket {
  if (year < 1990) return 'pre-1990';
  if (year < 2000) return '1990s';
  if (year < 2010) return '2000s';
  if (year < 2020) return '2010s';
  return '2020s';
}

function popBucket(listeners: number, source: string): PopBucket {
  if (source !== 'lastfm-listeners') return 'Known';
  if (listeners < 20_000)    return 'Deep cut';
  if (listeners < 100_000)   return 'Niche';
  if (listeners < 500_000)   return 'Known';
  if (listeners < 1_000_000) return 'Popular';
  return 'Hit';
}

export interface MatrixCell {
  era: EraBucket;
  pop: PopBucket;
  count: number;
  avgNet: number;
}

/**
 * Era × popularity matrix. Only cells that have at least one song are
 * returned; the panel is responsible for rendering empty cells as blanks.
 * Returns empty when no song has both a year and an obscurity reading (I6).
 */
export function computeEraPopMatrix(stats: Stats): MatrixCell[] {
  const rated = stats.songs.filter((s) => s.year !== undefined && s.obscurity !== undefined);
  if (!rated.length) return [];

  const buckets = new Map<string, number[]>();
  for (const song of rated) {
    const key = `${eraBucket(song.year!)}|${popBucket(song.obscurity!.value, song.obscurity!.source)}`;
    const arr = buckets.get(key);
    if (arr) arr.push(song.net);
    else buckets.set(key, [song.net]);
  }

  return [...buckets.entries()].map(([key, nets]) => {
    const [era, pop] = key.split('|') as [EraBucket, PopBucket];
    return { era, pop, count: nets.length, avgNet: nets.reduce((a, b) => a + b, 0) / nets.length };
  });
}

export interface EraGenreCell {
  era: EraBucket;
  genre: string;
  count: number;
  avgNet: number;
}

/**
 * Era × genre matrix. Genres are passed in from the virtual:league-data module
 * so this pure function stays testable without a bundler. Only the top N genres
 * (by song count) are included to keep the table narrow. Returns empty when no
 * song has both a year and a genre (I6).
 */
export function computeEraGenreMatrix(
  stats: Stats,
  genreMap: Record<string, string[]>,
  topN = 6,
): { cells: EraGenreCell[]; genres: string[] } {
  // Pick the top genres by song count across all songs.
  const genreCounts = new Map<string, number>();
  for (const song of stats.songs) {
    if (song.year === undefined) continue;
    const artist = (song.artist?.split(',')[0] ?? '').trim().toLowerCase();
    const genres = genreMap[artist] ?? [];
    for (const g of genres.slice(0, 1)) {
      genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
    }
  }

  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([g]) => g);

  if (!topGenres.length) return { cells: [], genres: [] };

  const buckets = new Map<string, number[]>();
  for (const song of stats.songs) {
    if (song.year === undefined) continue;
    const artist = (song.artist?.split(',')[0] ?? '').trim().toLowerCase();
    const genres = genreMap[artist] ?? [];
    const genre = genres.find((g) => topGenres.includes(g));
    if (!genre) continue;
    const key = `${eraBucket(song.year)}|${genre}`;
    const arr = buckets.get(key);
    if (arr) arr.push(song.net);
    else buckets.set(key, [song.net]);
  }

  const cells = [...buckets.entries()].map(([key, nets]) => {
    const [era, genre] = key.split('|') as [EraBucket, string];
    return { era, genre, count: nets.length, avgNet: nets.reduce((a, b) => a + b, 0) / nets.length };
  });

  return { cells, genres: topGenres };
}

export interface PopularityBandStats {
  band: ObscurityBand;
  count: number;
  avgNet: number;
}

/**
 * Average score by listener-count band. Returns empty when no song has an
 * obscurity reading — callers should self-suppress (I6).
 */
export function computePopularityBands(stats: Stats): PopularityBandStats[] {
  const rated = stats.songs.filter((s) => s.obscurity !== undefined);
  if (!rated.length) return [];

  const buckets = new Map<ObscurityBand, number[]>();
  for (const song of rated) {
    const band = obscurityBand(song.obscurity!.value, song.obscurity!.source);
    const arr = buckets.get(band);
    if (arr) arr.push(song.net);
    else buckets.set(band, [song.net]);
  }

  const ORDER: ObscurityBand[] = ['deep cut', 'niche', 'known', 'popular', 'hit'];
  return ORDER.filter((b) => buckets.has(b)).map((band) => {
    const nets = buckets.get(band)!;
    return { band, count: nets.length, avgNet: nets.reduce((a, b) => a + b, 0) / nets.length };
  });
}

export interface PlayerTasteProfile {
  playerId: string;
  name: string;
  /** Top genre across this player's submitted songs (by song count). */
  submitGenre?: string;
  /** Top genre across songs they upvoted (points-weighted). */
  voteGenre?: string;
  /** Most common pop band across their rated submitted songs. */
  submitPopBand?: ObscurityBand;
  /** Most common pop band across songs they upvoted, weighted by points. */
  votePopBand?: ObscurityBand;
}

function mostCommon<T>(counts: Map<T, number>): T | undefined {
  if (!counts.size) return undefined;
  return [...counts.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

function genresForArtist(artist: string, genreMap: Record<string, string[]>): string[] {
  // Artists can be multi-credit ("ROSÉ, Bruno Mars"); try the full string first,
  // then each individual credit.
  const full = genreMap[artist.toLowerCase()];
  if (full?.length) return full;
  const parts = artist.split(/,|feat\.|ft\.|&/i).map((s) => s.trim().toLowerCase());
  for (const part of parts) {
    const hit = genreMap[part];
    if (hit?.length) return hit;
  }
  return [];
}

/**
 * Per-player taste profile: favourite genre and popularity band, split by
 * whether they are submitting or voting. Returns empty when there are no
 * players with songs.
 */
export function computePlayerTasteProfiles(
  stats: Stats,
  genreMap: Record<string, string[]>,
): PlayerTasteProfile[] {
  const songByKey = new Map(stats.songs.map((s) => [`${s.trackId}|${s.roundId}`, s]));

  return stats.players
    .filter((p) => p.songs > 0)
    .sort((a, b) => b.pointsCounted - a.pointsCounted)
    .map((p) => {
      const mySongs = stats.songs.filter((s) => s.submitterId === p.playerId);
      const myUpvotes = stats.league.votes.filter(
        (v) => v.voterId === p.playerId && v.points > 0,
      );

      // Genre by submission
      const sgCounts = new Map<string, number>();
      for (const song of mySongs) {
        for (const g of genresForArtist(song.artist, genreMap)) {
          sgCounts.set(g, (sgCounts.get(g) ?? 0) + 1);
        }
      }

      // Genre by vote (points-weighted)
      const vgCounts = new Map<string, number>();
      for (const vote of myUpvotes) {
        const song = songByKey.get(`${vote.trackId}|${vote.roundId}`);
        if (!song) continue;
        for (const g of genresForArtist(song.artist, genreMap)) {
          vgCounts.set(g, (vgCounts.get(g) ?? 0) + vote.points);
        }
      }

      // Pop band by submission
      const spCounts = new Map<ObscurityBand, number>();
      for (const song of mySongs) {
        if (!song.obscurity) continue;
        const band = obscurityBand(song.obscurity.value, song.obscurity.source);
        spCounts.set(band, (spCounts.get(band) ?? 0) + 1);
      }

      // Pop band by vote (points-weighted)
      const vpCounts = new Map<ObscurityBand, number>();
      for (const vote of myUpvotes) {
        const song = songByKey.get(`${vote.trackId}|${vote.roundId}`);
        if (!song?.obscurity) continue;
        const band = obscurityBand(song.obscurity.value, song.obscurity.source);
        vpCounts.set(band, (vpCounts.get(band) ?? 0) + vote.points);
      }

      return {
        playerId: p.playerId,
        name: p.name,
        submitGenre: mostCommon(sgCounts),
        voteGenre: mostCommon(vgCounts),
        submitPopBand: mostCommon(spCounts),
        votePopBand: mostCommon(vpCounts),
      };
    });
}
