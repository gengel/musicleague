import { useEffect, useState } from 'react';
import { artFor } from './SongMedia';
import { isUsableTint, paletteTint, toCss } from '../lib/tint';

/** Initials from a display name, at most two letters. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + second).toUpperCase();
}

/**
 * A player's avatar: a 2×2 mosaic of their best covers, falling back to a
 * single cover, then to coloured initials. `spotifyIds` should be their
 * top songs, best first; up to four are used.
 */
export function PlayerAvatar({
  name,
  spotifyIds,
  tint,
  size = 40,
}: {
  name: string;
  spotifyIds: (string | undefined)[];
  tint: string;
  size?: number;
}) {
  const covers = spotifyIds
    .map((id) => artFor(id, 'sm'))
    .filter((u): u is string => Boolean(u))
    .slice(0, 4);

  const style = { width: size, height: size, borderColor: tint } as const;

  if (covers.length === 0) {
    return (
      <span className="avatar avatar--initials" style={{ ...style, background: tint }} aria-hidden="true">
        <span style={{ fontSize: size * 0.4 }}>{initials(name)}</span>
      </span>
    );
  }
  if (covers.length < 4) {
    return (
      <span className="avatar" style={style} aria-hidden="true">
        <img src={covers[0]} alt="" width={size} height={size} loading="lazy" />
      </span>
    );
  }
  return (
    <span className="avatar avatar--mosaic" style={style} aria-hidden="true">
      {covers.map((c, i) => (
        <img key={i} src={c} alt="" loading="lazy" />
      ))}
    </span>
  );
}

/**
 * A stable colour for a player. Tries the average of their first cover; if the
 * average is muddy, or there is no cover, or canvas is unavailable (tests),
 * falls back to a deterministic palette colour keyed by their id.
 */
export function usePlayerTint(id: string, coverId: string | undefined): string {
  const [tint, setTint] = useState<string>(() => paletteTint(id));

  useEffect(() => {
    const src = artFor(coverId, 'sm');
    if (!src || typeof document === 'undefined') return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 16, 16);
        const { data } = ctx.getImageData(0, 0, 16, 16);
        let r = 0;
        let g = 0;
        let b = 0;
        const n = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }
        r /= n;
        g /= n;
        b /= n;
        if (!cancelled && isUsableTint(r, g, b)) setTint(toCss(r, g, b));
      } catch {
        /* tainted canvas or no pixels — keep the palette colour */
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [id, coverId]);

  return tint;
}
