import { useMemo } from 'react';
import { embeddedGenres } from 'virtual:league-data';
import type { Stats } from '../lib/stats';
import type { History } from '../lib/history';
import {
  buildPlayerProfile,
  playerSlug,
  type LeagueAppearance,
  type PlayerProfile,
} from '../lib/playerProfile';
import { SongArt, SongLinks, SongPlayer, SongTags } from './SongMedia';
import { ThemeChip } from './ThemeChip';
import { Card, Empty, n1 } from './ui';

/**
 * The deep, one-player dossier reachable at #player/<slug>.
 *
 * It lays the player's record from the current league beside each earlier
 * league: how they finished, what they submitted, how they voted, who they
 * ranked, and — for the player a round is themed around — a scouting brief
 * drawn from every league they have played.
 */
export function PlayerPage({
  playerId,
  stats,
  currentLabel,
  history,
  historyGenres,
  onNavigate,
}: {
  playerId: string;
  stats: Stats;
  currentLabel: string;
  history: History | null;
  historyGenres: Map<string, Record<string, string[]>>;
  onNavigate: (slug: string) => void;
}) {
  const profile = useMemo<PlayerProfile | undefined>(
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

  if (!profile) return <Card wide><Empty>No such player.</Empty></Card>;

  return (
    <>
      <PlayerHeader profile={profile} />
      {profile.themePending || profile.themeOutcome ? <ThemeBriefCard profile={profile} /> : null}
      {profile.appearances.map((a) => (
        <AppearanceCard key={a.leagueId} appearance={a} onNavigate={onNavigate} />
      ))}
    </>
  );
}

function PlayerHeader({ profile }: { profile: PlayerProfile }) {
  const current = profile.appearances.find((a) => a.current);
  const p = current?.player;
  return (
    <Card wide>
      <header className="player-head">
        <div>
          <h2 className="player-head__name">{profile.name}</h2>
          <div className="player-head__meta dim small">
            {profile.appearances.map((a, i) => (
              <span key={a.leagueId}>
                {i > 0 && ' · '}
                {a.label}:{' '}
                {a.finish ? (
                  <strong>
                    {ordinal(a.finish)} of {a.of}
                  </strong>
                ) : (
                  'did not submit'
                )}
              </span>
            ))}
          </div>
        </div>
        {p && (
          <div className="player-head__score">
            <span className={p.pointsCounted < 0 ? 'neg' : 'pos'}>
              {p.pointsCounted > 0 ? '+' : ''}
              {p.pointsCounted}
            </span>
            {p.themeBonus !== 0 && (
              <ThemeChip points={p.themeBonus} reason={profile.themeOutcome?.reason} compact />
            )}
          </div>
        )}
      </header>
      {(profile.themeRoundName || profile.themePending) && (
        <p className="dim small">
          {profile.themeOutcome
            ? `Theme round: ${profile.themeRoundName} — ${profile.themeOutcome.outcome}, ${
                profile.themeOutcome.points > 0 ? '+' : ''
              }${profile.themeOutcome.points}.`
            : `Theme round still to come: ${profile.themeRoundName}.`}
        </p>
      )}
    </Card>
  );
}

function ThemeBriefCard({ profile }: { profile: PlayerProfile }) {
  const b = profile.brief;
  return (
    <Card
      title={profile.themePending ? `Scouting ${profile.name}` : `What is quintessentially ${profile.name}?`}
      subtitle="Drawn from every league they have played — what they reward, what they punish, and what has worked for them."
      wide
    >
      <div className="brief-grid">
        <BriefList title="Artists they reward" rows={b.favouriteArtists.map((r) => [r[0], `${r[1]} pts`])} />
        <BriefList title="Genres they reward" rows={b.favouriteGenres.map((r) => [r[0], `${r[1]} pts`])} />
        <BriefList
          title="They tend to downvote"
          rows={b.mostDownvoted.map((d) => [`${d.title} — ${d.artist}`, `−${d.points}`])}
        />
        <BriefList
          title="Their best-received songs"
          rows={b.bestSubmissions.map((s) => [`${s.title} — ${s.artist}`, `${s.net > 0 ? '+' : ''}${s.net} (${s.league})`])}
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

function AppearanceCard({
  appearance: a,
  onNavigate,
}: {
  appearance: LeagueAppearance;
  onNavigate: (slug: string) => void;
}) {
  const p = a.player;
  return (
    <Card title={`${a.label}${a.current ? ' (current)' : ''}`} wide>
      <div className="player-record dim small">
        <span>
          <strong className={p.pointsCounted < 0 ? 'neg' : 'pos'}>
            {p.pointsCounted > 0 ? '+' : ''}
            {p.pointsCounted}
          </strong>{' '}
          points
        </span>
        <span>{p.songs} songs</span>
        <span>avg {n1(p.avgPerSong)}/song</span>
        {p.wins > 0 && <span>{p.wins} round win{p.wins === 1 ? '' : 's'}</span>}
        {p.roundsMissedVoting > 0 && <span className="neg">{p.roundsMissedVoting} round(s) not voted</span>}
        {p.tasteAlignment !== undefined && (
          <span>
            taste {Math.round(p.tasteAlignment * 100)}%{' '}
            {p.tasteAlignment >= 0.5 ? 'mainstream' : 'contrarian'}
          </span>
        )}
      </div>

      {(a.submitGenres.length > 0 || a.decades.length > 0) && (
        <p className="dim small player-tags">
          {a.submitGenres.length > 0 && <>Submits: {a.submitGenres.map((g) => g[0]).join(', ')}. </>}
          {a.decades.length > 0 && <>Eras: {a.decades.map((d) => `${d[0]} (${d[1]})`).join(', ')}.</>}
        </p>
      )}

      {(a.voteGenres.length > 0 || a.voteDecades.length > 0) && (
        <p className="dim small player-tags">
          {a.voteGenres.length > 0 && <>Rewards: {a.voteGenres.map((g) => `${g[0]} (${g[1]})`).join(', ')}. </>}
          {a.voteDecades.length > 0 && <>Favours eras: {a.voteDecades.map((d) => `${d[0]} (${d[1]})`).join(', ')}.</>}
        </p>
      )}

      <h4 className="player-sub">Submissions</h4>
      {a.songs.length === 0 ? (
        <Empty>No submissions in this league.</Empty>
      ) : (
        <div className="song-list">
          {a.songs.map((s) => (
            <article className="song-row" key={`${s.roundId}-${s.trackId}`}>
              <div className="song-row__art">
                <SongArt title={s.title} spotifyId={s.spotifyId} size="sm" />
              </div>
              <div className="song-row__body">
                <strong>{s.title || 'Untitled'}</strong>
                {s.artist && <span className="dim"> — {s.artist}</span>}
                <div className="dim small">{s.roundName}</div>
                <SongTags year={s.year} obscurity={s.obscurity} artist={s.artist} durationMs={s.durationMs} cover={s.cover} />
                {s.forfeited && <span className="tag tag--neg">forfeited</span>}
              </div>
              <div className="song-row__score">
                <strong className={s.effectiveNet < 0 ? 'neg' : s.effectiveNet > 0 ? 'pos' : 'dim'}>
                  {s.effectiveNet > 0 ? '+' : ''}
                  {s.effectiveNet}
                </strong>
                <div className="dim small">+{s.upvotes}/−{s.downvotes}</div>
              </div>
              <div className="song-row__links">
                <SongLinks title={s.title} artist={s.artist} spotifyId={s.spotifyId} />
                {s.spotifyId && <SongPlayer title={s.title} spotifyId={s.spotifyId} compact />}
              </div>
            </article>
          ))}
        </div>
      )}

      <h4 className="player-sub">Who they rank</h4>
      {a.ranks.length === 0 ? (
        <Empty>They cast no votes in this league.</Empty>
      ) : (
        <table className="t">
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">Up</th>
              <th className="num">Down</th>
              <th className="num">Net</th>
              <th className="num">Devotion</th>
              <th className="num">They gave back</th>
            </tr>
          </thead>
          <tbody>
            {a.ranks.map((r) => (
              <tr key={r.opponentId}>
                <td>
                  <button className="linklike" onClick={() => onNavigate(playerSlug(r.name))}>
                    {r.name}
                  </button>
                </td>
                <td className="num pos">{r.up || ''}</td>
                <td className="num neg">{r.down ? `−${r.down}` : ''}</td>
                <td className={`num ${r.net < 0 ? 'neg' : r.net > 0 ? 'pos' : 'dim'}`}>
                  {r.net > 0 ? '+' : ''}
                  {r.net}
                </td>
                <td className="num dim">{Math.round(r.devotion * 100)}%</td>
                <td className="num dim">
                  {r.reciprocalNet === undefined
                    ? '—'
                    : `${r.reciprocalNet > 0 ? '+' : ''}${r.reciprocalNet}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h4 className="player-sub">Their fans and critics</h4>
      {a.backers.length === 0 ? (
        <Empty>No votes received in this league.</Empty>
      ) : (
        <table className="t">
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">Up</th>
              <th className="num">Down</th>
              <th className="num">Net</th>
              <th className="num">They got back</th>
            </tr>
          </thead>
          <tbody>
            {a.backers.map((r) => (
              <tr key={r.opponentId}>
                <td>
                  <button className="linklike" onClick={() => onNavigate(playerSlug(r.name))}>
                    {r.name}
                  </button>
                </td>
                <td className="num pos">{r.up || ''}</td>
                <td className="num neg">{r.down ? `−${r.down}` : ''}</td>
                <td className={`num ${r.net < 0 ? 'neg' : r.net > 0 ? 'pos' : 'dim'}`}>
                  {r.net > 0 ? '+' : ''}
                  {r.net}
                </td>
                <td className="num dim">
                  {r.reciprocalNet === undefined
                    ? '—'
                    : `${r.reciprocalNet > 0 ? '+' : ''}${r.reciprocalNet}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
