/**
 * Resolves a song's original release year from MusicBrainz, keyed by the
 * recording's own title and artist — not the release the league happened to
 * submit, which may be a remaster, a live version, or a cover.
 *
 * Same reasoning as genres.mjs: no API key or quota, at the cost of asking
 * for one request a second and getting a recording rather than an artist
 * back, so the match has to be judged rather than trusted outright.
 *
 * A year here is "when MusicBrainz's best match was first released", which
 * is right most of the time but has been caught wrong before — Dolly
 * Parton's cover of "Shine" resolved to 1998 rather than 2001. Sanity
 * checking output before publishing it is a human step; see PLAN.md §9.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const ENDPOINT = 'https://musicbrainz.org/ws/2/recording';
const RATE_LIMIT_MS = 1100;
const AGENT = 'MusicLeagueDashboard/1.0 (local static site build)';

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

async function lookup(title, artist, timeoutMs) {
  const queries = [
    `recording:"${title.replace(/"/g, '')}" AND artist:"${artist.replace(/"/g, '')}"`,
    `${title} ${artist}`.replace(/["\-–—]/g, ' '),
  ];
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
      const match = body?.recordings?.[0];
      const date = match?.['first-release-date'];
      if (match && (match.score ?? 0) >= 60 && date) {
        const year = Number(date.slice(0, 4));
        if (Number.isFinite(year)) return year;
      }
    } catch {
      /* try the next query shape */
    } finally {
      clearTimeout(timer);
    }
    await sleep(RATE_LIMIT_MS);
  }
  return undefined;
}

/**
 * Resolves release years for a list of `{ uri, title, artist }` tracks.
 *
 * @returns {Promise<{years: Record<string, number>, resolved: number, unresolved: {uri: string, title: string, artist: string}[], fromCache: number}>}
 */
export async function fetchYears(tracks, opts = {}) {
  const { cachePath = '.cache/years.json', timeoutMs = 10000, onProgress } = opts;
  const cache = loadCache(cachePath);
  const years = {};
  const unresolved = [];
  let resolved = 0;
  let fromCache = 0;

  for (const track of tracks) {
    const key = `${track.title.toLowerCase()}|||${track.artist.toLowerCase()}`;
    if (key in cache) {
      if (cache[key] != null) {
        years[track.uri] = cache[key];
        fromCache += 1;
      } else {
        unresolved.push(track);
      }
      onProgress?.();
      continue;
    }

    const year = await lookup(track.title, track.artist, timeoutMs);
    cache[key] = year ?? null;
    if (year) {
      years[track.uri] = year;
      resolved += 1;
    } else {
      unresolved.push(track);
    }
    onProgress?.();
  }

  saveCache(cachePath, cache);
  return { years, resolved, unresolved, fromCache };
}
