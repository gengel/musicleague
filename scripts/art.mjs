/**
 * Fetches album art for submitted songs, at bake time, and writes it to real
 * image files under the output directory rather than inlining it.
 *
 * Spotify's oEmbed endpoint returns a thumbnail URL for any track, with no API
 * key and no quota, so the artwork can be resolved from the track ids the
 * export already contains. Only track ids leave the machine, never names,
 * votes or comments. Pass --no-art to skip this step entirely.
 *
 * Files are written once, keyed by track id, and shared across every past
 * snapshot rather than duplicated per edition: a round-7 build only downloads
 * the handful of covers it has not seen before.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
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

async function fetchBuffer(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type') ?? 'image/jpeg';
    const ext = EXT_BY_TYPE[type] ?? 'jpg';
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, ext };
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
 * Resolves artwork for the given tracks, writing each size to its own file
 * under `artDir` and returning a manifest of what was written.
 *
 * @param {{id: string, sizes: ('sm' | 'lg' | 'xl')[]}[]} tracks  ids to
 *   resolve, with the variants each one needs.
 * @param {object} [opts]
 * @param {string} [opts.artDir]     directory to write image files into
 * @param {string} [opts.cachePath]  manifest cache, shared across builds
 * @returns {Promise<{art: Record<string, Partial<Record<'sm'|'lg'|'xl', string>>>, fetched: number, failed: number, bytes: number, fromCache: number}>}
 *   `art[id][size]` is a filename relative to `artDir`.
 */
export async function fetchArtwork(tracks, opts = {}) {
  const {
    artDir,
    cachePath = '.cache/art.json',
    concurrency = 6,
    timeoutMs = 10000,
    onProgress,
  } = opts;
  if (!artDir) throw new Error('fetchArtwork needs an artDir to write images into');

  mkdirSync(artDir, { recursive: true });
  const cache = loadCache(cachePath);
  const art = {};
  let fetched = 0;
  let failed = 0;
  let fromCache = 0;
  let bytes = 0;

  await pooled(tracks, concurrency, async ({ id, sizes }) => {
    const wanted = sizes ?? ['lg'];
    const have = {};

    for (const size of wanted) {
      const cached = cache[`${id}:${size}`];
      if (cached && existsSync(join(artDir, cached))) {
        have[size] = cached;
      }
    }
    if (Object.keys(have).length === wanted.length) {
      art[id] = have;
      fromCache += wanted.length;
      onProgress?.();
      return;
    }

    try {
      const meta = await fetchJson(`${OEMBED}${encodeURIComponent(id)}`, timeoutMs);
      const thumb = meta?.thumbnail_url;
      if (!thumb) throw new Error('no thumbnail in oEmbed response');

      for (const size of wanted) {
        if (have[size]) continue;
        const { buffer, ext } = await fetchBuffer(resize(thumb, size), timeoutMs);
        const fileName = `${id}-${size}.${ext}`;
        writeFileSync(join(artDir, fileName), buffer);
        have[size] = fileName;
        cache[`${id}:${size}`] = fileName;
        bytes += buffer.length;
        fetched += 1;
      }
      art[id] = have;
    } catch {
      // Missing artwork is a cosmetic loss, never a build failure.
      failed += 1;
    }
    onProgress?.();
  });

  saveCache(cachePath, cache);

  return { art, fetched, failed, bytes, fromCache };
}
