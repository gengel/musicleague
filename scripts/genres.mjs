/**
 * Resolves artist genres at bake time.
 *
 * The Music League export carries no genre field, so this is the one figure in
 * the dashboard that comes from outside the league. MusicBrainz is used because
 * it needs no API key and no quota, at the cost of crowd-sourced tags that are
 * noisy ("90s", "american", "male vocalists" all appear alongside real genres)
 * and incomplete — some artists simply have none.
 *
 * Tags are therefore mapped onto a fixed vocabulary and anything unrecognised is
 * discarded, so a genre label always means the same thing across a league.
 * Artists that cannot be resolved are reported rather than guessed at.
 *
 * Only artist names are sent, and only when --genres is passed.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const ENDPOINT = 'https://musicbrainz.org/ws/2/artist';
// MusicBrainz asks for one request a second and an identifying User-Agent.
const RATE_LIMIT_MS = 1100;
const AGENT = 'MusicLeagueDashboard/1.0 (local static site build)';

/**
 * Canonical genres, and the tag fragments that map onto them.
 *
 * Order matters: the first match wins, so specific fragments are listed before
 * the broad ones they contain ("punk rock" before "rock").
 */
/** @type {[string, string[]][]} */
const VOCABULARY = [
  ['Hip hop', ['hip hop', 'hip-hop', 'rap', 'trap', 'grime', 'drill']],
  ['R&B', ['r&b', 'rnb', 'rhythm and blues', 'new jack swing', 'neo soul', 'contemporary r&b']],
  ['Soul', ['soul', 'motown']],
  ['Funk', ['funk', 'p-funk']],
  ['Disco', ['disco', 'boogie']],
  ['House', ['house', 'garage house', 'deep house']],
  ['Techno', ['techno', 'trance', 'drum and bass', 'dubstep', 'jungle']],
  ['Electronic', ['electronic', 'electronica', 'edm', 'synth-pop', 'synthpop', 'downtempo', 'ambient', 'idm', 'dance-pop', 'eurodance']],
  ['K-pop', ['k-pop', 'kpop', 'j-pop', 'jpop']],
  ['Punk', ['punk', 'hardcore', 'post-punk']],
  ['Metal', ['metal', 'thrash', 'doom', 'grindcore']],
  ['Grunge', ['grunge']],
  ['Alternative', ['alternative', 'alt-rock', 'indie rock', 'shoegaze', 'post-rock', 'emo']],
  ['Indie', ['indie', 'indie pop', 'lo-fi', 'bedroom pop', 'dream pop']],
  ['New wave', ['new wave', 'no wave', 'darkwave']],
  ['Rock', ['rock', 'classic rock', 'hard rock', 'glam', 'psychedelic', 'prog']],
  ['Pop', ['pop', 'power pop', 'teen pop', 'bubblegum']],
  ['Country', ['country', 'bluegrass', 'honky tonk']],
  ['Folk', ['folk', 'americana', 'singer-songwriter', 'singer/songwriter']],
  ['Jazz', ['jazz', 'bebop', 'swing music', 'big band']],
  ['Blues', ['blues', 'delta blues']],
  ['Reggae', ['reggae', 'dancehall', 'ska', 'dub', 'afrobeat', 'afrobeats']],
  ['Latin', ['latin', 'reggaeton', 'salsa', 'bossa nova', 'cumbia', 'bachata']],
  ['Gospel', ['gospel', 'christian', 'worship']],
  ['Classical', ['classical', 'baroque', 'orchestral', 'opera']],
  ['Soundtrack', ['soundtrack', 'score', 'musical', 'video game']],
];

/**
 * Every fragment paired with its genre, longest first.
 *
 * Longest match wins, which is what stops "reggaeton" being filed as Reggae or
 * "indie rock" as Rock. Where two fragments are the same length the order above
 * decides, so "punk rock" lands on Punk rather than Rock.
 */
const FRAGMENTS = VOCABULARY.flatMap(([genre, fragments], order) =>
  fragments.map((fragment) => ({ fragment, genre, order })),
).sort((a, b) => b.fragment.length - a.fragment.length || a.order - b.order);

/** Maps one raw tag onto the vocabulary, or null if it is not a genre. */
export function canonicalGenre(tag) {
  const lower = String(tag?.name ?? tag ?? '')
    .toLowerCase()
    .trim();
  if (!lower) return null;
  for (const { fragment, genre } of FRAGMENTS) {
    // Substring rather than equality, since tags arrive as "90s r&b" and
    // "hip hop soul" rather than clean single words.
    if (lower === fragment || lower.includes(fragment)) return genre;
  }
  return null;
}

/**
 * Picks the genres for one artist from their tag counts.
 * Keeps at most two, because a list of six tells you nothing.
 */
export function genresFromTags(tags, keep = 2) {
  const scores = new Map();
  for (const tag of tags ?? []) {
    const genre = canonicalGenre(tag.name ?? tag);
    if (!genre) continue;
    const votes = typeof tag.count === 'number' ? Math.max(1, tag.count) : 1;
    scores.set(genre, (scores.get(genre) ?? 0) + votes);
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, keep)
    .map(([genre]) => genre);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadCache(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(path, cache) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(cache));
  } catch {
    /* a cache that cannot be written is not worth failing a build over */
  }
}

async function lookup(artist, timeoutMs) {
  // Exact phrase first; fall back to a loose query for names with punctuation
  // that the strict parser chokes on, such as "Bone Thugs-N-Harmony".
  const queries = [`artist:"${artist.replace(/"/g, '')}"`, artist.replace(/["\-–—]/g, ' ')];
  for (const query of queries) {
    const url = `${ENDPOINT}/?query=${encodeURIComponent(query)}&fmt=json&limit=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': AGENT, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const match = body?.artists?.[0];
      if (match && (match.score ?? 0) >= 70) {
        const genres = genresFromTags([...(match.genres ?? []), ...(match.tags ?? [])]);
        if (genres.length) return genres;
      }
    } catch {
      /* try the next query shape */
    } finally {
      clearTimeout(timer);
    }
    await sleep(RATE_LIMIT_MS);
  }
  return [];
}

/**
 * Resolves genres for a list of artist names.
 *
 * @returns {Promise<{genres: Record<string, string[]>, resolved: number, unresolved: string[], fromCache: number}>}
 */
export async function fetchGenres(artists, opts = {}) {
  const { cachePath = '.cache/genres.json', timeoutMs = 10000, onProgress } = opts;
  const cache = loadCache(cachePath);
  const genres = {};
  const unresolved = [];
  let resolved = 0;
  let fromCache = 0;

  // Sequential on purpose: MusicBrainz asks for one request per second.
  for (const artist of artists) {
    const key = artist.toLowerCase();
    if (cache[key]) {
      if (cache[key].length) {
        genres[artist] = cache[key];
        fromCache += 1;
      } else {
        unresolved.push(artist);
      }
      onProgress?.();
      continue;
    }

    const found = await lookup(artist, timeoutMs);
    cache[key] = found;
    if (found.length) {
      genres[artist] = found;
      resolved += 1;
    } else {
      unresolved.push(artist);
    }
    onProgress?.();
  }

  saveCache(cachePath, cache);
  return { genres, resolved, unresolved, fromCache };
}
