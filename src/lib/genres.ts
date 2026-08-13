import type { Stats } from './stats';

/**
 * Genre analysis, with the sample sizes kept in view.
 *
 * Genre is the one figure here that does not come from the export: it is
 * resolved from artist names at bake time. Two consequences are handled
 * explicitly rather than hidden. Coverage is partial, so a share is always
 * reported against the songs actually tagged, not against every song. And a
 * league of sixty-odd songs spread over a dozen genres leaves three or four
 * songs each, which is far too thin to crown a best genre — so rankings are
 * suppressed below a minimum sample.
 */

/** Below this many songs, a genre gets a row but no verdict. */
export const MIN_SAMPLE = 4;

export interface GenreStat {
  genre: string;
  /** Songs tagged with this genre. */
  songs: number;
  /** Share of every song in the league, tagged or not. */
  share: number;
  /** Mean counted score per song. */
  avgScore: number;
  /** Total counted points. */
  points: number;
  /** Mean upvotes and downvotes per song. */
  avgUpvotes: number;
  avgDownvotes: number;
  /** Rounds won by a song of this genre. */
  wins: number;
  /** Distinct players who submitted it. */
  submitters: number;
  /**
   * Points per song above or below the league average. A difference rather
   * than a ratio: this league averages 0.7 points a song, and dividing by a
   * near-zero or negative baseline turns noise into wild multipliers.
   */
  delta: number;
  /** True when there are enough songs to draw any conclusion. */
  reliable: boolean;
}

export interface GenreReport {
  /** Every song with a result, the denominator for `share`. */
  total: number;
  /** Songs that carried at least one genre. */
  tagged: number;
  /** Songs whose artists could not be resolved. */
  untagged: number;
  /** Mean counted score across tagged songs, the baseline for `index`. */
  baseline: number;
  stats: GenreStat[];
  /** Artists with no genre, so the gap is visible rather than silent. */
  missingArtists: string[];
}

const mean = (values: number[]): number =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

/**
 * Builds the report from a song list and an artist → genres lookup.
 * A song inherits the genres of every artist credited on it.
 */
export function genreReport(
  stats: Stats,
  lookup: Record<string, string[]>,
): GenreReport {
  const normalised = new Map(
    Object.entries(lookup).map(([artist, genres]) => [artist.toLowerCase().trim(), genres]),
  );

  const genresFor = (artistField: string): string[] => {
    const found = new Set<string>();
    for (const artist of artistField.split(/\s*,\s*/).filter(Boolean)) {
      for (const genre of normalised.get(artist.toLowerCase().trim()) ?? []) found.add(genre);
    }
    return [...found];
  };

  const songs = stats.songs.filter((s) => s.roundRank > 0);
  const withGenres = songs.map((song) => ({ song, genres: genresFor(song.artist) }));
  const tagged = withGenres.filter((entry) => entry.genres.length);
  const untagged = withGenres.length - tagged.length;

  const missing = new Set<string>();
  for (const entry of withGenres) {
    if (entry.genres.length) continue;
    for (const artist of entry.song.artist.split(/\s*,\s*/).filter(Boolean)) missing.add(artist);
  }

  const baseline = mean(tagged.map((entry) => entry.song.countedScore));

  const buckets = new Map<string, typeof tagged>();
  for (const entry of tagged) {
    for (const genre of entry.genres) {
      buckets.set(genre, [...(buckets.get(genre) ?? []), entry]);
    }
  }

  const winners = new Set(
    stats.rounds.map((r) => r.winnerTrackId).filter((id): id is string => Boolean(id)),
  );

  const statsList: GenreStat[] = [...buckets.entries()]
    .map(([genre, entries]) => {
      const scores = entries.map((e) => e.song.countedScore);
      const avgScore = mean(scores);
      return {
        genre,
        songs: entries.length,
        // Against every song, not just the tagged ones: a share of a subset
        // reads larger than it is.
        share: songs.length ? entries.length / songs.length : 0,
        avgScore,
        points: scores.reduce((a, b) => a + b, 0),
        avgUpvotes: mean(entries.map((e) => e.song.upvotes)),
        avgDownvotes: mean(entries.map((e) => e.song.downvotes)),
        wins: entries.filter((e) => winners.has(e.song.trackId)).length,
        submitters: new Set(entries.map((e) => e.song.submitterId).filter(Boolean)).size,
        delta: avgScore - baseline,
        reliable: entries.length >= MIN_SAMPLE,
      };
    })
    .sort((a, b) => b.songs - a.songs || a.genre.localeCompare(b.genre));

  return {
    total: songs.length,
    tagged: tagged.length,
    untagged,
    baseline,
    stats: statsList,
    missingArtists: [...missing].sort(),
  };
}

/**
 * The one or two things worth saying, or nothing when the samples are too thin
 * to support a claim.
 */
export function genreHighlights(report: GenreReport): string[] {
  const reliable = report.stats.filter((s) => s.reliable);
  if (reliable.length < 2) return [];

  const best = [...reliable].sort((a, b) => b.avgScore - a.avgScore)[0];
  const worst = [...reliable].sort((a, b) => a.avgScore - b.avgScore)[0];
  const mostSubmitted = [...reliable].sort((a, b) => b.songs - a.songs)[0];
  const punchbag = [...reliable].sort((a, b) => b.avgDownvotes - a.avgDownvotes)[0];

  const out: string[] = [];
  if (best.genre !== worst.genre) {
    out.push(
      `${best.genre} scores best at ${best.avgScore.toFixed(1)} a song against a league average of ${report.baseline.toFixed(1)}; ${worst.genre} does worst at ${worst.avgScore.toFixed(1)}.`,
    );
  }
  out.push(
    `${mostSubmitted.genre} is the most submitted at ${mostSubmitted.songs} songs, ${Math.round(
      mostSubmitted.share * 100,
    )}% of all songs${
      mostSubmitted.delta >= 0.5
        ? ', and it earns its place'
        : mostSubmitted.delta <= -0.5
          ? ', despite scoring below average'
          : ''
    }.`,
  );
  if (punchbag.avgDownvotes > 0) {
    out.push(
      `${punchbag.genre} attracts the most downvotes, ${punchbag.avgDownvotes.toFixed(1)} a song.`,
    );
  }
  return out;
}
