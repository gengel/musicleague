import { useMemo } from 'react';
import { embeddedGenres } from 'virtual:league-data';
import type { Stats } from '../lib/stats';
import type { History } from '../lib/history';
import { buildPlayerProfile, playerSlug } from '../lib/playerProfile';
import { SongArt, SongLinks, SongPlayer } from './SongMedia';
import { ThemeBanner, ThemeChip } from './ThemeChip';
import { Card, Empty } from './ui';

/**
 * The landing tab: what just happened, and what is next.
 *
 * A reader arriving mid-season wants the latest round — its theme, who won,
 * how the standings moved — before any of the deeper analysis. Early in a
 * season the other tabs are mostly empty, so this is the sensible default.
 */
export function ThisRoundTab({
  stats,
  history,
  historyGenres,
  currentLabel,
  onNavigate,
}: {
  stats: Stats;
  history: History | null;
  historyGenres: Map<string, Record<string, string[]>>;
  currentLabel: string;
  onNavigate: (hash: string) => void;
}) {
  const played = useMemo(
    () => stats.rounds.filter((r) => r.hasVotes).sort((a, b) => b.round.sequence - a.round.sequence),
    [stats.rounds],
  );
  const latest = played[0];
  const nameOf = useMemo(() => new Map(stats.players.map((p) => [p.playerId, p.name])), [stats.players]);

  // The next themed round without a result yet, for the scouting brief.
  const nextTheme = useMemo(
    () =>
      [...stats.rounds]
        .sort((a, b) => a.round.sequence - b.round.sequence)
        .find((r) => r.themePlayerId && !r.hasVotes),
    [stats.rounds],
  );

  if (!latest) {
    return (
      <Card title="This round" wide>
        <Empty>No round has results yet.</Empty>
      </Card>
    );
  }

  const roundSongs = stats.songs
    .filter((s) => s.roundId === latest.round.id)
    .sort((a, b) => a.roundRank - b.roundRank);
  const winner = roundSongs[0];

  return (
    <>
      <Card wide>
        <header className="player-head">
          <div>
            <span className="dim small">
              {currentLabel} · Round {latest.round.sequence}
              {stats.totalRounds ? ` of ${stats.totalRounds}` : ''}
            </span>
            <h2 className="player-head__name">{latest.round.name}</h2>
          </div>
        </header>
        {(latest.theme || latest.themePlayerId) && (
          <ThemeBanner
            outcome={latest.theme}
            themeName={latest.themePlayerId ? nameOf.get(latest.themePlayerId) : undefined}
          />
        )}
        {winner && (
          <div className="chapter__winner-row">
            <div className="chapter__winner-art">
              <SongArt title={winner.title} spotifyId={winner.spotifyId} size="sm" />
            </div>
            <div className="chapter__winner-body">
              <span className="chapter__winner-badge">🏆 Winner</span>{' '}
              <strong>{winner.title}</strong>
              {winner.artist && <span className="dim"> — {winner.artist}</span>}
              <div className="dim small">
                {nameOf.get(winner.submitterId ?? '') ?? 'unknown'} ·{' '}
                {winner.effectiveNet > 0 ? '+' : ''}
                {winner.effectiveNet} pts
              </div>
            </div>
            <div className="chapter__winner-links">
              <SongLinks title={winner.title} artist={winner.artist} spotifyId={winner.spotifyId} />
              {winner.spotifyId && <SongPlayer title={winner.title} spotifyId={winner.spotifyId} compact />}
            </div>
          </div>
        )}
      </Card>

      <Card title="Round results" subtitle="As the room voted. The theme bonus, if any, applies to the season total." wide>
        <table className="t">
          <thead>
            <tr>
              <th></th>
              <th>Song</th>
              <th>By</th>
              <th className="num">Score</th>
            </tr>
          </thead>
          <tbody>
            {roundSongs.map((s) => (
              <tr key={s.trackId}>
                <td className="dim">{s.roundRank}</td>
                <td>
                  <strong>{s.title}</strong>
                  {s.artist && <span className="dim"> — {s.artist}</span>}
                </td>
                <td>
                  {s.submitterId ? (
                    <button className="linklike" onClick={() => onNavigate(`player/${playerSlug(nameOf.get(s.submitterId!) ?? '')}`)}>
                      {nameOf.get(s.submitterId) ?? 'unknown'}
                    </button>
                  ) : (
                    <span className="dim">anonymous</span>
                  )}
                </td>
                <td className={`num ${s.effectiveNet < 0 ? 'neg' : s.effectiveNet > 0 ? 'pos' : 'dim'}`}>
                  {s.effectiveNet > 0 ? '+' : ''}
                  {s.effectiveNet}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <StandingsMovement stats={stats} onNavigate={onNavigate} />

      {nextTheme?.themePlayerId && (
        <NextTheme
          playerId={nextTheme.themePlayerId}
          roundName={nextTheme.round.name}
          stats={stats}
          history={history}
          historyGenres={historyGenres}
          currentLabel={currentLabel}
          onNavigate={onNavigate}
        />
      )}
    </>
  );
}

/** How the standings moved after the latest scored round. */
function StandingsMovement({ stats, onNavigate }: { stats: Stats; onNavigate: (hash: string) => void }) {
  const rows = useMemo(() => {
    const out: { id: string; name: string; cumulative: number; delta: number; rank: number }[] = [];
    for (const [playerId, points] of stats.timelines) {
      if (!points.length) continue;
      const last = points[points.length - 1];
      const prev = points.length > 1 ? points[points.length - 2] : undefined;
      out.push({
        id: playerId,
        name: stats.players.find((p) => p.playerId === playerId)?.name ?? playerId,
        cumulative: last.cumulative,
        delta: last.cumulative - (prev?.cumulative ?? 0),
        rank: last.rank,
      });
    }
    return out.sort((a, b) => a.rank - b.rank);
  }, [stats]);

  if (!rows.length) return null;

  return (
    <Card title="Standings" subtitle="Change is from the previous round." wide>
      <table className="t">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Player</th>
            <th className="num">Total</th>
            <th className="num">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="num dim">{r.rank}</td>
              <td>
                <button className="linklike" onClick={() => onNavigate(`player/${playerSlug(r.name)}`)}>
                  {r.name}
                </button>
              </td>
              <td className={`num ${r.cumulative < 0 ? 'neg' : 'pos'}`}>
                {r.cumulative > 0 ? '+' : ''}
                {r.cumulative}
              </td>
              <td className={`num ${r.delta < 0 ? 'neg' : r.delta > 0 ? 'pos' : 'dim'}`}>
                {r.delta > 0 ? '+' : ''}
                {r.delta || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** A scouting brief for the next themed player. */
function NextTheme({
  playerId,
  roundName,
  stats,
  history,
  historyGenres,
  currentLabel,
  onNavigate,
}: {
  playerId: string;
  roundName: string;
  stats: Stats;
  history: History | null;
  historyGenres: Map<string, Record<string, string[]>>;
  currentLabel: string;
  onNavigate: (hash: string) => void;
}) {
  const profile = useMemo(
    () =>
      buildPlayerProfile(
        playerId,
        stats,
        currentLabel,
        embeddedGenres,
        history ?? { leagues: [], byPlayer: new Map(), newPlayers: [], warnings: [] },
        historyGenres,
      ),
    [playerId, stats, currentLabel, history, historyGenres],
  );
  if (!profile) return null;
  const b = profile.brief;
  return (
    <Card
      title={`Next up: ${roundName}`}
      subtitle={`What is quintessentially ${profile.name}? A brief from every league they have played.`}
      wide
    >
      <p>
        <ThemeChip points={0} /> {profile.name} gets{' '}
        <span className="pos">+3</span> for winning their own round and <span className="neg">−3</span>{' '}
        otherwise.{' '}
        <button className="linklike" onClick={() => onNavigate(`player/${profile.slug}`)}>
          See their full profile →
        </button>
      </p>
      <div className="brief-grid">
        {b.favouriteArtists.length > 0 && (
          <div className="brief-list">
            <div className="brief-list__title dim small">Artists they reward</div>
            <ul>
              {b.favouriteArtists.map(([a, pts]) => (
                <li key={a}>
                  <span className="brief-list__label">{a}</span>
                  <span className="brief-list__val dim">{pts} pts</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {b.favouriteGenres.length > 0 && (
          <div className="brief-list">
            <div className="brief-list__title dim small">Genres they reward</div>
            <ul>
              {b.favouriteGenres.map(([g, pts]) => (
                <li key={g}>
                  <span className="brief-list__label">{g}</span>
                  <span className="brief-list__val dim">{pts} pts</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
