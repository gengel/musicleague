import { useState } from 'react';
import { embeddedArt } from 'virtual:league-data';
import { Icon } from './Icons';

/**
 * Album art, links and players for a submitted song.
 *
 * Artwork is resolved from the Spotify track id at bake time and inlined, so it
 * displays without the page fetching anything. Spotify links are exact for the
 * same reason. YouTube is offered as a search link rather than an embed: the
 * export carries no YouTube id, and resolving one would need the Data API plus
 * fuzzy matching that would sometimes land on a lyric video or a live cover.
 *
 * The player is click-to-load. Until someone presses play the page has made no
 * third-party request, which keeps a published copy inert for anyone who just
 * wants to read the numbers.
 */

export const spotifyTrackUrl = (id: string): string => `https://open.spotify.com/track/${id}`;

export const spotifyEmbedUrl = (id: string): string =>
  `https://open.spotify.com/embed/track/${id}?utm_source=musicleague-dashboard`;

export function youTubeSearchUrl(title: string, artist: string): string {
  const query = [title, artist].filter(Boolean).join(' ');
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export type ArtSize = 'sm' | 'lg' | 'xl';

/**
 * Inlined cover for a track, at whichever size was baked in.
 * Falls back down the chain, since a cover scaled up beats no cover at all.
 */
export function artFor(spotifyId: string | undefined, size: ArtSize): string | undefined {
  if (!spotifyId) return undefined;
  const entry = embeddedArt[spotifyId];
  if (!entry) return undefined;
  const chain: ArtSize[] = size === 'xl' ? ['xl', 'lg', 'sm'] : size === 'lg' ? ['lg', 'xl', 'sm'] : ['sm', 'lg', 'xl'];
  for (const candidate of chain) {
    const uri = entry[candidate];
    if (uri) return uri;
  }
  return undefined;
}

export function SongArt({
  title,
  spotifyId,
  size = 'lg',
  px,
}: {
  title: string;
  spotifyId?: string;
  size?: ArtSize;
  px?: number;
}) {
  const src = artFor(spotifyId, size);
  const style = px ? { width: px, height: px } : undefined;

  if (!src) {
    return (
      <span className="art art--blank" style={style} aria-hidden="true">
        <Icon name="disc" size={px ? Math.round(px * 0.5) : 16} />
      </span>
    );
  }
  return <img className="art" style={style} src={src} alt={`Cover art for ${title}`} loading="lazy" />;
}

export function SongLinks({
  title,
  artist,
  spotifyId,
}: {
  title: string;
  artist: string;
  spotifyId?: string;
}) {
  return (
    <span className="links">
      {spotifyId && (
        <a
          className="links__btn"
          href={spotifyTrackUrl(spotifyId)}
          target="_blank"
          rel="noreferrer noopener"
          title={`Open "${title}" on Spotify`}
        >
          <Icon name="spotify" size={15} />
        </a>
      )}
      <a
        className="links__btn"
        href={youTubeSearchUrl(title, artist)}
        target="_blank"
        rel="noreferrer noopener"
        title={`Search YouTube for "${title}"`}
      >
        <Icon name="youtube" size={15} />
      </a>
    </span>
  );
}

/** A Spotify player that only contacts Spotify once asked to. */
export function SongPlayer({
  title,
  spotifyId,
  compact,
}: {
  title: string;
  spotifyId: string;
  compact?: boolean;
}) {
  const [playing, setPlaying] = useState(false);

  if (!playing) {
    return (
      <button className="player__cue" onClick={() => setPlaying(true)}>
        <Icon name="play" size={15} />
        Play
      </button>
    );
  }

  return (
    <iframe
      className={compact ? 'player player--compact' : 'player'}
      src={spotifyEmbedUrl(spotifyId)}
      title={`Spotify player for ${title}`}
      loading="lazy"
      allow="encrypted-media; clipboard-write"
      // Spotify's embed needs scripts and same-origin for playback.
      sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
    />
  );
}
