/**
 * Fetches album art for submitted songs, at bake time.
 *
 * Spotify's oEmbed endpoint returns a thumbnail URL for any track, with no API
 * key and no quota, so the artwork can be resolved from the track ids the
 * export already contains. The bytes are inlined into the build as data URIs,
 * which means the published page shows artwork while still requesting nothing
 * from anyone when a reader opens it.
 *
 * Only track ids leave the machine, never names, votes or comments. Pass
 * --no-art to skip this step entirely.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OEMBED = 'https://open.spotify.com/oembed?url=https://open.spotify.com/track/';

/**
 * Spotify encodes the dimensions of an image in the path prefix, so a smaller
 * variant can be requested without another lookup.
 */
const SIZE_PREFIX = {
  sm: 'ab67616d00004851', // 64px, ~2 kB — small thumbnails
  lg: 'ab67616d00001e02', // 300px, ~35 kB — table rows and covers
  xl: 'ab67616d0000b273', // 640px, ~150 kB — the few shown large
};

const resize = (url, size) => url.replace(/ab67616d[0-9a-f]{8}/, SIZE_PREFIX[size]);

/** Runs `worker` over `items`, a few at a time, collecting settled results. */
async function pooled(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDataUri(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type') ?? 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buffer.toString('base64')}`;
  } finally {
    clearTimeout(timer);
  }
}

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
    // A cache that cannot be written is not worth failing a build over.
  }
}

/**
 * Resolves artwork for the given tracks.
 *
 * @param {{id: string, sizes: ('sm'|'lg'|'xl')[]}[]} tracks  ids to resolve,
 *   with the variants each one needs.
 * @param {object} [opts]
 * @returns {Promise<{art: Record<string, {sm?: string, lg?: string}>, fetched: number, failed: number, bytes: number, fromCache: number}>}
 */
export async function fetchArtwork(tracks, opts = {}) {
  const { cachePath = '.cache/art.json', concurrency = 6, timeoutMs = 10000, onProgress } = opts;
  const cache = loadCache(cachePath);
  const art = {};
  let fetched = 0;
  let failed = 0;
  let fromCache = 0;

  await pooled(tracks, concurrency, async ({ id, sizes }) => {
    const wanted = sizes ?? ['lg'];
    const have = {};
    for (const size of wanted) {
      const key = `${id}:${size}`;
      if (cache[key]) have[size] = cache[key];
    }
    if (Object.keys(have).length === wanted.length) {
      art[id] = have;
      fromCache += 1;
      onProgress?.();
      return;
    }

    try {
      const meta = await fetchJson(`${OEMBED}${encodeURIComponent(id)}`, timeoutMs);
      const thumb = meta?.thumbnail_url;
      if (!thumb) throw new Error('no thumbnail in oEmbed response');

      for (const size of wanted) {
        if (have[size]) continue;
        const uri = await fetchDataUri(resize(thumb, size), timeoutMs);
        have[size] = uri;
        cache[`${id}:${size}`] = uri;
      }
      art[id] = have;
      fetched += 1;
    } catch {
      // Missing artwork is a cosmetic loss, never a build failure.
      failed += 1;
    }
    onProgress?.();
  });

  saveCache(cachePath, cache);

  const bytes = Object.values(art).reduce(
    (total, sizes) => total + Object.values(sizes).reduce((n, uri) => n + uri.length, 0),
    0,
  );
  return { art, fetched, failed, bytes, fromCache };
}
