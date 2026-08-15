import type { Stats } from '../lib/stats';
import { headlineFacts } from '../lib/facts';
import { genreReport } from '../lib/genres';
import { embeddedGenres } from 'virtual:league-data';
import { Card, n1 } from './ui';
import { LabelIcon } from './Icons';
import { artFor, SongArt, SongLinks, SongPlayer, SongTags } from './SongMedia';

/** The three or four things worth saying before any table. */
export function Headlines({ stats }: { stats: Stats }) {
  const facts = headlineFacts(stats, 4, genreReport(stats, embeddedGenres));
  if (!facts.length) return null;

  return (
    <section className="headlines">
      <h2>The short version</h2>
      <div className="headlines__grid">
        {facts.map((fact) => (
          <article className="headline" key={fact.label}>
            {artFor(fact.artId, 'xl') ? (
              <span className="headline__cover">
                <SongArt title={fact.label} spotifyId={fact.artId} size="xl" />
              </span>
            ) : (
              <span className="headline__badge">
                <LabelIcon label={fact.label} size={26} />
              </span>
            )}
            <div className="headline__body">
              <span className="headline__label">{fact.label}</span>
              <p className="headline__lead">{fact.headline}</p>
              <p className="headline__detail">{fact.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** The best-scoring songs, with a player for each. */
export function TopSongs({ stats }: { stats: Stats }) {
  const top = [...stats.songs]
    .filter((s) => s.countedScore > 0)
    .sort((a, b) => b.countedScore - a.countedScore)
    .slice(0, 4);
  if (!top.length) return null;

  const nameOf = new Map(stats.players.map((p) => [p.playerId, p.name]));

  return (
    <Card
      title={stats.inProgress ? 'Best songs so far' : 'Best songs of the season'}
      subtitle="Nothing is requested from Spotify until you press play."
      wide
    >
      <div className="showcase">
        {top.map((song, i) => (
          <article className="showcase__item" key={song.trackId}>
            <div className="showcase__cover">
              <SongArt title={song.title} spotifyId={song.spotifyId} size="xl" />
              <span className="showcase__rank">#{i + 1}</span>
              <span className="showcase__score">{n1(song.countedScore)} pts</span>
            </div>
            <div className="showcase__title">
              <strong>{song.title || 'Untitled'}</strong>
              {song.artist && <div className="dim">{song.artist}</div>}
              <SongTags year={song.year} obscurity={song.obscurity} artist={song.artist} durationMs={song.durationMs} cover={song.cover} />
            </div>
            <span className="showcase__meta">
              {song.submitterId ? nameOf.get(song.submitterId) : 'anonymous'} · {song.roundName} ·{' '}
              {song.distinctUpvoters} of {song.eligibleVoters} voters
            </span>
            <div className="showcase__actions">
              <SongLinks title={song.title} artist={song.artist} spotifyId={song.spotifyId} />
              {song.spotifyId && (
                <SongPlayer title={song.title} spotifyId={song.spotifyId} compact />
              )}
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

/** Gateway cards linking to each section. */
export function Overview({ stats, onNavigate }: { stats: Stats; onNavigate: (tab: string) => void }) {
  const totalForfeited = stats.players.reduce((a, p) => a + p.breakdown.forfeited, 0);
  const ranked = [...stats.players].sort((a, b) => b.pointsCounted - a.pointsCounted);
  const leader = ranked[0];
  const second = ranked[1];
  const gap = leader && second ? leader.pointsCounted - second.pointsCounted : 0;

  const topSong = [...stats.songs].sort((a, b) => b.effectiveNet - a.effectiveNet)[0];

  const activePlayers = stats.players.filter((p) => p.songs > 0);
  const topAvg = [...activePlayers].sort((a, b) => b.avgPerSong - a.avgPerSong)[0];

  const tiles: { tab: string; title: string; body: string | null }[] = [
    {
      tab: 'The Race',
      title: 'The Race',
      body: leader
        ? `${leader.name} leads on ${n1(leader.pointsCounted)}${gap > 0 && second ? ` — ${gap} pts ahead of ${second.name}${stats.inProgress ? ' with rounds to play' : ''}` : ''}.`
        : null,
    },
    {
      tab: 'The Songs',
      title: 'The Songs',
      body: topSong
        ? `Best song so far: ${topSong.title}${topSong.artist ? ` by ${topSong.artist}` : ''} — ${n1(topSong.effectiveNet)} pts.`
        : null,
    },
    {
      tab: 'The Room',
      title: 'The Room',
      body: stats.hasVotes
        ? `${stats.pairs.length} voter–player relationships tracked across ${stats.roundsPlayed} round${stats.roundsPlayed === 1 ? '' : 's'}.`
        : null,
    },
    {
      tab: 'Players',
      title: 'Players',
      body: topAvg
        ? `${activePlayers.length} players. ${topAvg.name} averages ${topAvg.avgPerSong.toFixed(1)} pts per song — the best conversion rate in the league.`
        : `${activePlayers.length} players.`,
    },
    {
      tab: 'Play-by-Play',
      title: 'Play-by-Play',
      body: `${stats.roundsPlayed} round${stats.roundsPlayed === 1 ? '' : 's'}, one chapter each.${stats.scoring === 'competitive' && totalForfeited > 0 ? ` ${n1(totalForfeited)} pts forfeited by non-voters.` : ''}`,
    },
  ];

  return (
    <>
      <Card title="Gateways" subtitle="One finding per section — click to go there." wide>
        <div className="gateways">
          {tiles.map(({ tab, title, body }) =>
            body === null ? null : (
              <button key={tab} className="gateway" onClick={() => onNavigate(tab)}>
                <strong className="gateway__title">{title} →</strong>
                <p className="gateway__body dim">{body}</p>
              </button>
            ),
          )}
        </div>
      </Card>
    </>
  );
}
