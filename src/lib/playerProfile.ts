/**
 * A single player's dossier across every league they have played.
 *
 * The deep player page needs one player's record from the current league and
 * from each history league, laid side by side: how they finished, what they
 * submitted, how they voted, who they backed and who backed them. This module
 * assembles that from already-computed `Stats` objects so the page component
 * only renders — no analysis in the view.
 */
import type { PairStats, PlayerStats, SongStats, Stats } from './stats';
import type { History } from './history';
import { identityKey } from './types';

export interface RankedOpponent {
  opponentId: string;
  name: string;
  /** Upvote points this player gave the opponent. */
  up: number;
  /** Downvote points, as a positive magnitude. */
  down: number;
  net: number;
  netAffinity: number;
  devotion: number;
  /** The opponent's reciprocal net toward this player, when known. */
  reciprocalNet?: number;
}

export interface LeagueAppearance {
  leagueId: string;
  label: string;
  /** Whether this is the current (in-progress) league. */
  current: boolean;
  player: PlayerStats;
  finish?: number;
  of?: number;
  songs: SongStats[];
  /** Who this player ranked, warmest first by net affinity. */
  ranks: RankedOpponent[];
  /** Who ranked this player, warmest first — their fans and critics. */
  backers: RankedOpponent[];
  /** The player's own genres, most-submitted first: [genre, count]. */
  submitGenres: [string, number][];
  /** Genres they rewarded with upvotes, points-weighted: [genre, points]. */
  voteGenres: [string, number][];
  /** Eras they rewarded with upvotes, points-weighted: [decadeLabel, points]. */
  voteDecades: [string, number][];
  /** Decade blend of their submissions: [decadeLabel, count]. */
  decades: [string, number][];
  /** Their taste alignment (mainstream↔contrarian), when computable. */
  tasteAlignment?: number;
  /** The voter who rates this player highest, by net affinity. */
  biggestFan?: RankedOpponent;
  /** The voter who rates them lowest, given a real sample. */
  leastImpressed?: RankedOpponent;
  /** The player this player rates highest. */
  ownFavourite?: RankedOpponent;
}

export interface ThemeBrief {
  /** Artists they most rewarded, across all leagues: [artist, points]. */
  favouriteArtists: [string, number][];
  /** Genres they most rewarded: [genre, points]. */
  favouriteGenres: [string, number][];
  /** Songs they most downvoted: [title, points]. */
  mostDownvoted: { title: string; artist: string; points: number }[];
  /** Their own best-received submissions across leagues. */
  bestSubmissions: { title: string; artist: string; net: number; league: string }[];
}

export interface CareerTotals {
  points: number;
  songs: number;
  wins: number;
  upvotesReceived: number;
  downvotesReceived: number;
  upvotesGiven: number;
  downvotesGiven: number;
  roundsMissedVoting: number;
  /** Per-league finish, newest first, for the strip shown in every scope. */
  finishes: { label: string; finish?: number; of?: number; points: number }[];
}

/**
 * A pooled view across every league the player has played: their whole
 * career as one appearance. Totals sum; genre/era and who-they-rank pool;
 * finish and theme do not aggregate and are shown per league instead.
 */
export interface AggregateAppearance {
  songs: SongStats[];
  ranks: RankedOpponent[];
  backers: RankedOpponent[];
  submitGenres: [string, number][];
  voteGenres: [string, number][];
  voteDecades: [string, number][];
  decades: [string, number][];
  biggestFan?: RankedOpponent;
  leastImpressed?: RankedOpponent;
  ownFavourite?: RankedOpponent;
  totals: CareerTotals;
}

export interface PlayerProfile {
  playerId: string;
  name: string;
  slug: string;
  appearances: LeagueAppearance[];
  /** The pooled career view across all appearances. */
  aggregate: AggregateAppearance;
  /** The player's theme round in the current league, when they have one. */
  themeRoundName?: string;
  themeOutcome?: import('./theme').ThemeOutcome;
  /** True when their theme round has not been decided yet. */
  themePending: boolean;
  /** A cross-league brief for scouting the theme player. */
  brief: ThemeBrief;
}

/** URL-safe slug for a (redacted) display name. */
export function playerSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const genresForArtist = (artist: string, genreMap: Record<string, string[]>): string[] => {
  const out = new Set<string>();
  for (const a of artist.split(/\s*,\s*/)) {
    for (const g of genreMap[a.trim().toLowerCase()] ?? []) out.add(g);
  }
  return [...out];
};

function decadeLabel(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

function topN<K>(map: Map<K, number>, n: number): [K, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/** Builds one appearance from a league's stats. */
function appearanceFor(
  playerId: string,
  stats: Stats,
  leagueId: string,
  label: string,
  current: boolean,
  finish: number | undefined,
  of: number | undefined,
  genreMap: Record<string, string[]>,
): LeagueAppearance | undefined {
  const player = stats.players.find((p) => p.playerId === playerId);
  if (!player) return undefined;

  const songs = stats.songs
    .filter((s) => s.submitterId === playerId)
    .sort((a, b) => b.effectiveNet - a.effectiveNet);

  // Who they ranked: their outgoing pairs, plus the reciprocal for context.
  const outgoing = stats.pairs.filter((p) => p.voterId === playerId);
  const reciprocalNet = new Map<string, number>();
  for (const p of stats.pairs) {
    if (p.targetId === playerId) reciprocalNet.set(p.voterId, p.net);
  }
  const ranks: RankedOpponent[] = outgoing
    .map((p: PairStats) => ({
      opponentId: p.targetId,
      name: p.targetName,
      up: p.upvotes,
      down: p.downvotes,
      net: p.net,
      netAffinity: p.netAffinity,
      devotion: p.devotion,
      reciprocalNet: reciprocalNet.get(p.targetId),
    }))
    .sort((a, b) => b.net - a.net);

  // Who ranked this player: incoming pairs (their fans and critics).
  const outgoingNet = new Map<string, number>();
  for (const p of outgoing) outgoingNet.set(p.targetId, p.net);
  const backers: RankedOpponent[] = stats.pairs
    .filter((p) => p.targetId === playerId)
    .map((p: PairStats) => ({
      opponentId: p.voterId,
      name: p.voterName,
      up: p.upvotes,
      down: p.downvotes,
      net: p.net,
      netAffinity: p.netAffinity,
      devotion: p.devotion,
      reciprocalNet: outgoingNet.get(p.voterId),
    }))
    .sort((a, b) => b.net - a.net);

  const songByKey = new Map(stats.songs.map((s) => [`${s.trackId}|${s.roundId}`, s]));
  const submitG = new Map<string, number>();
  const decades = new Map<string, number>();
  for (const s of songs) {
    for (const g of genresForArtist(s.artist, genreMap)) submitG.set(g, (submitG.get(g) ?? 0) + 1);
    if (s.year !== undefined) decades.set(decadeLabel(s.year), (decades.get(decadeLabel(s.year)) ?? 0) + 1);
  }
  const voteG = new Map<string, number>();
  const voteD = new Map<string, number>();
  for (const v of stats.league.votes.filter((v) => v.voterId === playerId && v.points > 0)) {
    const song = songByKey.get(`${v.trackId}|${v.roundId}`);
    if (!song) continue;
    for (const g of genresForArtist(song.artist, genreMap)) voteG.set(g, (voteG.get(g) ?? 0) + v.points);
    if (song.year !== undefined) voteD.set(decadeLabel(song.year), (voteD.get(decadeLabel(song.year)) ?? 0) + v.points);
  }

  return {
    leagueId,
    label,
    current,
    player,
    finish,
    of,
    songs,
    ranks,
    backers,
    submitGenres: topN(submitG, 6),
    voteGenres: topN(voteG, 6),
    voteDecades: topN(voteD, 6),
    decades: [...decades.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    tasteAlignment: player.tasteAlignment,
    // Same criteria as the old inline profile: warmth by net affinity, with a
    // real sample for the cold end so one stray downvote is not "least
    // impressed".
    biggestFan: [...backers]
      .filter((b) => b.up > 0)
      .sort((a, b) => b.netAffinity - a.netAffinity || b.up - a.up)[0],
    leastImpressed: stats.pairs
      .filter((p) => p.targetId === playerId && p.songsAvailable >= 2)
      .map((p) => backers.find((b) => b.opponentId === p.voterId)!)
      .filter(Boolean)
      .sort((a, b) => a.netAffinity - b.netAffinity)[0],
    ownFavourite: [...ranks]
      .filter((r) => r.up > 0)
      .sort((a, b) => b.netAffinity - a.netAffinity || b.up - a.up)[0],
  };
}

/** Assembles a cross-league scouting brief. */
function buildBrief(
  playerId: string,
  leagues: { stats: Stats; label: string }[],
  genreMap: Record<string, string[]>,
): ThemeBrief {
  const artistPts = new Map<string, number>();
  const genrePts = new Map<string, number>();
  const downvoted: { title: string; artist: string; points: number }[] = [];
  const best: { title: string; artist: string; net: number; league: string }[] = [];

  for (const { stats, label } of leagues) {
    const songByKey = new Map(stats.songs.map((s) => [`${s.trackId}|${s.roundId}`, s]));
    for (const v of stats.league.votes.filter((v) => v.voterId === playerId)) {
      const song = songByKey.get(`${v.trackId}|${v.roundId}`);
      if (!song) continue;
      if (v.points > 0) {
        artistPts.set(song.artist, (artistPts.get(song.artist) ?? 0) + v.points);
        for (const g of genresForArtist(song.artist, genreMap)) {
          genrePts.set(g, (genrePts.get(g) ?? 0) + v.points);
        }
      } else if (v.points < 0) {
        downvoted.push({ title: song.title, artist: song.artist, points: -v.points });
      }
    }
    for (const s of stats.songs.filter((s) => s.submitterId === playerId)) {
      best.push({ title: s.title, artist: s.artist, net: s.effectiveNet, league: label });
    }
  }

  // Collapse repeated downvote targets, keeping the heaviest.
  const downByKey = new Map<string, { title: string; artist: string; points: number }>();
  for (const d of downvoted) {
    const k = `${d.title}|${d.artist}`;
    downByKey.set(k, { ...d, points: (downByKey.get(k)?.points ?? 0) + d.points });
  }

  return {
    favouriteArtists: topN(artistPts, 6),
    favouriteGenres: topN(genrePts, 6),
    mostDownvoted: [...downByKey.values()].sort((a, b) => b.points - a.points).slice(0, 6),
    bestSubmissions: best.sort((a, b) => b.net - a.net).slice(0, 6),
  };
}

/**
 * Pools every appearance into one career view. Totals sum; genre/era and
 * who-they-rank pool across leagues; the fan facts are recomputed from the
 * pooled up/down so "biggest fan" means "who has given them the most,
 * all-time". Finish and theme do not aggregate and are carried per league.
 */
function buildAggregate(appearances: LeagueAppearance[]): AggregateAppearance {
  const mergeOpponents = (lists: RankedOpponent[][]): RankedOpponent[] => {
    const by = new Map<string, RankedOpponent>();
    for (const list of lists) {
      for (const r of list) {
        const cur = by.get(r.opponentId);
        if (cur) {
          cur.up += r.up;
          cur.down += r.down;
          cur.net += r.net;
          cur.reciprocalNet =
            (cur.reciprocalNet ?? 0) + (r.reciprocalNet ?? 0) || cur.reciprocalNet;
        } else {
          by.set(r.opponentId, { ...r });
        }
      }
    }
    // netAffinity/devotion are per-league ratios; a pooled sum is not
    // meaningful, so the aggregate ranks on raw net instead.
    return [...by.values()].sort((a, b) => b.net - a.net);
  };

  const sumPairs = (pairs: [string, number][][]): [string, number][] => {
    const by = new Map<string, number>();
    for (const list of pairs) for (const [k, v] of list) by.set(k, (by.get(k) ?? 0) + v);
    return topN(by, 6);
  };

  const ranks = mergeOpponents(appearances.map((a) => a.ranks));
  const backers = mergeOpponents(appearances.map((a) => a.backers));
  const decadeCounts = new Map<string, number>();
  for (const a of appearances) for (const [d, c] of a.decades) decadeCounts.set(d, (decadeCounts.get(d) ?? 0) + c);

  const totals: CareerTotals = {
    points: appearances.reduce((s, a) => s + a.player.pointsCounted, 0),
    songs: appearances.reduce((s, a) => s + a.player.songs, 0),
    wins: appearances.reduce((s, a) => s + a.player.wins, 0),
    upvotesReceived: appearances.reduce((s, a) => s + a.player.upvotesReceived, 0),
    downvotesReceived: appearances.reduce((s, a) => s + a.player.downvotesReceived, 0),
    upvotesGiven: appearances.reduce((s, a) => s + a.player.upvotesGiven, 0),
    downvotesGiven: appearances.reduce((s, a) => s + a.player.downvotesGiven, 0),
    roundsMissedVoting: appearances.reduce((s, a) => s + a.player.roundsMissedVoting, 0),
    finishes: appearances.map((a) => ({
      label: a.label,
      finish: a.finish,
      of: a.of,
      points: a.player.pointsCounted,
    })),
  };

  return {
    songs: appearances.flatMap((a) => a.songs).sort((x, y) => y.effectiveNet - x.effectiveNet),
    ranks,
    backers,
    submitGenres: sumPairs(appearances.map((a) => a.submitGenres)),
    voteGenres: sumPairs(appearances.map((a) => a.voteGenres)),
    voteDecades: sumPairs(appearances.map((a) => a.voteDecades)),
    decades: [...decadeCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    biggestFan: [...backers].filter((b) => b.up > 0).sort((a, b) => b.net - a.net)[0],
    leastImpressed: [...backers].sort((a, b) => a.net - b.net)[0],
    ownFavourite: [...ranks].filter((r) => r.up > 0).sort((a, b) => b.net - a.net)[0],
    totals,
  };
}

/**
 * Builds the full dossier for one player.
 *
 * `currentGenres` and each history league's genres are keyed by lowercased
 * artist name, as the bake embeds them.
 */
export function buildPlayerProfile(
  playerId: string,
  current: Stats,
  currentLabel: string,
  currentGenres: Record<string, string[]>,
  history: History,
  historyGenres: Map<string, Record<string, string[]>>,
): PlayerProfile | undefined {
  const player = current.players.find((p) => p.playerId === playerId);
  if (!player) return undefined;

  const appearances: LeagueAppearance[] = [];
  const currentFinishOrder = [...current.players]
    .filter((p) => p.songs > 0)
    .sort((a, b) => b.pointsCounted - a.pointsCounted)
    .map((p) => p.playerId);
  const currentApp = appearanceFor(
    playerId,
    current,
    'current',
    currentLabel,
    true,
    currentFinishOrder.indexOf(playerId) >= 0 ? currentFinishOrder.indexOf(playerId) + 1 : undefined,
    currentFinishOrder.length || undefined,
    currentGenres,
  );
  if (currentApp) appearances.push(currentApp);

  // History, oldest first.
  const entries = history.byPlayer.get(playerId) ?? [];
  const leaguesForBrief: { stats: Stats; label: string }[] = [
    { stats: current, label: currentLabel },
  ];
  for (const league of history.leagues) {
    const entry = entries.find((e) => e.leagueId === league.id);
    if (!entry) continue;
    const genres = historyGenres.get(league.id) ?? {};
    const app = appearanceFor(
      playerId,
      league.stats,
      league.id,
      league.label,
      false,
      entry.finish,
      entry.of,
      genres,
    );
    if (app) appearances.push(app);
    leaguesForBrief.push({ stats: league.stats, label: league.label });
  }

  const themeOutcome = current.themeOutcomes.find((o) => o.playerId === playerId);
  const themeRoundName = current.rounds.find((r) => r.themePlayerId === playerId)?.round.name;
  const themePending = Boolean(player.themeRoundId) && !themeOutcome;

  return {
    playerId,
    name: player.name,
    slug: playerSlug(player.name),
    appearances,
    aggregate: buildAggregate(appearances),
    themeRoundName,
    themeOutcome,
    themePending,
    brief: buildBrief(playerId, leaguesForBrief, currentGenres),
  };
}

/** Every player's slug in the current league, for routing. */
export function playerSlugIndex(stats: Stats): Map<string, string> {
  const bySlug = new Map<string, string>();
  for (const p of stats.players) bySlug.set(playerSlug(p.name), p.playerId);
  return bySlug;
}

/** Resolves a slug to a player id, tolerant of name/id drift. */
export function resolveSlug(slug: string, stats: Stats): string | undefined {
  const index = playerSlugIndex(stats);
  if (index.has(slug)) return index.get(slug);
  // Fall back to matching an id directly, or a normalised name.
  const byId = stats.players.find((p) => p.playerId === slug);
  if (byId) return byId.playerId;
  const byName = stats.players.find((p) => identityKey(p.name) === identityKey(slug.replace(/-/g, ' ')));
  return byName?.playerId;
}
