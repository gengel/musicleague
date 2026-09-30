import { useMemo, useState } from 'react';
import { embeddedGenres } from 'virtual:league-data';
import type { Stats } from '../lib/stats';
import type { History } from '../lib/history';
import { buildPlayerProfile, playerSlug } from '../lib/playerProfile';
import { SongArt, SongLinks, SongPlayer } from './SongMedia';
import { ThemeBanner, ThemeChip } from './ThemeChip';
import { Card, Empty } from './ui';

/**
 * The landing tab: what just happened, what is next, and where the race stands.
 *
 * Kept deliberately scannable — a reader arriving mid-season should get the
 * latest result, the next round's theme brief, and the top of the table
 * without wading through every panel. The deeper analysis lives on the other
 * tabs.
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

  // The next themed round to look forward to. Prefer the schedule (which knows
  // rounds before their export exists); fall back to a themed round in the
  // export that has no result yet.
  const nextThemeId = useMemo(() => {
    const fromSchedule = stats.themeSchedule.find((s) => !s.exists && s.playerId)?.playerId;
    if (fromSchedule) return fromSchedule;
    return [...stats.rounds]
      .sort((a, b) => a.round.sequence - b.round.sequence)
      .find((r) => r.themePlayerId && !r.hasVotes)?.themePlayerId;
  }, [stats.themeSchedule, stats.rounds]);
  const nextThemeSeq = useMemo(() => {
    const s = stats.themeSchedule.find((s) => !s.exists && s.playerId);
    return s?.sequence;
  }, [stats.themeSchedule]);

  return (
    <>
      {/* Next-round intel comes first: it is the actionable thing. */}
      {nextThemeId && (
        <NextTheme
          playerId={nextThemeId}
          sequence={nextThemeSeq}
          totalRounds={stats.totalRounds}
          stats={stats}
          history={history}
          historyGenres={historyGenres}
          currentLabel={currentLabel}
          onNavigate={onNavigate}
        />
      )}

      {latest ? (
        <LatestRound stats={stats} latest={latest} nameOf={nameOf} onNavigate={onNavigate} />
      ) : (
        <Card title="This round" wide>
          <Empty>No round has results yet.</Empty>
        </Card>
      )}

      <StandingsSnapshot stats={stats} onNavigate={onNavigate} />
    </>
  );
}

/** The latest scored round: theme outcome + winner, compact. */
function LatestRound({
  stats,
  latest,
  nameOf,
  onNavigate,
}: {
  stats: Stats;
  latest: Stats['rounds'][number];
  nameOf: Map<string, string>;
  onNavigate: (hash: string) => void;
}) {
  const roundSongs = stats.songs
    .filter((s) => s.roundId === latest.round.id)
    .sort((a, b) => a.roundRank - b.roundRank);
  const winner = roundSongs[0];
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? roundSongs : roundSongs.slice(0, 5);

  return (
    <Card wide>
      <header className="player-head">
        <div>
          <span className="dim small">
            {currentRoundLabel(stats, latest.round.sequence)}
          </span>
          <h2 className="player-head__name">{latest.round.name}</h2>
        </div>
        <button className="linklike" onClick={() => onNavigate(`round/${latest.round.sequence}`)}>
          Full round →
        </button>
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
          {shown.map((s) => (
            <tr key={s.trackId}>
              <td className="dim">{s.roundRank}</td>
              <td>
                <strong>{s.title}</strong>
                {s.artist && <span className="dim"> — {s.artist}</span>}
              </td>
              <td className="nowrap">
                {s.submitterId ? (
                  <button
                    className="linklike"
                    onClick={() => onNavigate(`player/${playerSlug(nameOf.get(s.submitterId!) ?? '')}`)}
                  >
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
      {roundSongs.length > 5 && (
        <button className="linklike" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show top 5' : `Show all ${roundSongs.length}`}
        </button>
      )}
    </Card>
  );
}

/** Top of the table with movement, expandable to the full field. */
function StandingsSnapshot({ stats, onNavigate }: { stats: Stats; onNavigate: (hash: string) => void }) {
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
  const [expanded, setExpanded] = useState(false);

  if (!rows.length) return null;
  const shown = expanded ? rows : rows.slice(0, 5);

  return (
    <Card
      title="Standings"
      subtitle="Change is from the previous round. Full breakdown on the Standings tab."
      wide
    >
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
          {shown.map((r) => (
            <tr key={r.id}>
              <td className="num dim">{r.rank}</td>
              <td className="nowrap">
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
      {rows.length > 5 && (
        <button className="linklike" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show top 5' : `Show all ${rows.length}`}
        </button>
      )}
    </Card>
  );
}

/** A scouting brief for the next themed player, shown up top. */
function NextTheme({
  playerId,
  sequence,
  totalRounds,
  stats,
  history,
  historyGenres,
  currentLabel,
  onNavigate,
}: {
  playerId: string;
  sequence?: number;
  totalRounds?: number;
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
  const roundText = sequence
    ? `Round ${sequence}${totalRounds ? ` of ${totalRounds}` : ''}`
    : 'Next round';

  return (
    <Card
      title={`Next up — ${roundText}: ${profile.name}'s round`}
      subtitle={`What is quintessentially ${profile.name}? A brief from every league they have played, so you can write for their taste.`}
      wide
    >
      <p>
        {profile.name} gets <ThemeChip points={3} compact /> for winning their own round and{' '}
        <ThemeChip points={-3} compact /> otherwise.{' '}
        <button className="linklike" onClick={() => onNavigate(`player/${profile.slug}`)}>
          Full profile →
        </button>
      </p>
      <div className="brief-grid">
        <BriefList title="Artists they reward" rows={b.favouriteArtists.map((r) => [r[0], `${r[1]} pts`])} />
        <BriefList title="Genres they reward" rows={b.favouriteGenres.map((r) => [r[0], `${r[1]} pts`])} />
        <BriefList
          title="They tend to downvote"
          rows={b.mostDownvoted.map((d) => [`${d.title} — ${d.artist}`, `−${d.points}`])}
        />
        <BriefList
          title="Their own best songs"
          rows={b.bestSubmissions.map((s) => [`${s.title} — ${s.artist}`, `${s.net > 0 ? '+' : ''}${s.net}`])}
        />
      </div>
    </Card>
  );
}

function BriefList({ title, rows }: { title: string; rows: [string, string][] }) {
  if (!rows.length) return null;
  return (
    <div className="brief-list">
      <div className="brief-list__title dim small">{title}</div>
      <ul>
        {rows.map(([label, val], i) => (
          <li key={i}>
            <span className="brief-list__label">{label}</span>
            <span className="brief-list__val dim">{val}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function currentRoundLabel(stats: Stats, sequence: number): string {
  return `Round ${sequence}${stats.totalRounds ? ` of ${stats.totalRounds}` : ''} · latest result`;
}
