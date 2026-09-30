import { useMemo, useState } from 'react';
import { embeddedGenres } from 'virtual:league-data';
import type { SongStats, Stats } from '../lib/stats';
import type { History } from '../lib/history';
import {
  buildPlayerProfile,
  highlightSongs,
  playerSlug,
  type AggregateAppearance,
  type LeagueAppearance,
  type PlayerProfile,
  type RankedOpponent,
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

  return <PlayerTabs profile={profile} onNavigate={onNavigate} />;
}

/**
 * Player profile sub-tabs.
 *
 * The first three tabs are the pooled, all-leagues view broken up by question:
 * Summary (at a glance), Submissions (their songs), Relationships (who they
 * rank and who ranks them). Each league then gets its own tab with the full
 * single-season breakdown, so a season can be read independently.
 */
function PlayerTabs({
  profile,
  onNavigate,
}: {
  profile: PlayerProfile;
  onNavigate: (slug: string) => void;
}) {
  const pooled = aggregateView(profile.aggregate);
  const leagueViews = profile.appearances.map((a) => ({ id: a.leagueId, label: a.label, view: leagueView(a) }));
  const multi = profile.appearances.length > 1;

  type TabKey = string;
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'submissions', label: 'Submissions' },
    { key: 'relationships', label: 'Relationships' },
    ...(multi ? leagueViews.map((l) => ({ key: l.id, label: l.label })) : []),
  ];
  const [tab, setTab] = useState<TabKey>('summary');

  // For a single-league player the pooled view *is* that league, so the
  // aggregate tabs already show everything; no separate per-league tab needed.
  const perLeague = leagueViews.find((l) => l.id === tab);

  return (
    <>
      <PlayerHeader profile={profile} />
      {profile.themePending || profile.themeOutcome ? <ThemeBriefCard profile={profile} /> : null}

      <div className="scope-tabs" role="tablist" aria-label="Profile sections">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`scope-tab${tab === t.key ? ' scope-tab--on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && <SummaryCard view={pooled} onNavigate={onNavigate} />}
      {tab === 'submissions' && <SubmissionsCard view={pooled} title="Submissions — all leagues" />}
      {tab === 'relationships' && <RelationshipsCard view={pooled} onNavigate={onNavigate} />}
      {perLeague && (
        <>
          <SummaryCard view={perLeague.view} onNavigate={onNavigate} />
          <SubmissionsCard view={perLeague.view} title="Submissions" />
          <RelationshipsCard view={perLeague.view} onNavigate={onNavigate} />
        </>
      )}
    </>
  );
}

/** The common shape both the aggregate and a single league render through. */
interface ScopeView {
  title: string;
  /** Summary chips shown under the title. */
  chips: { text: string; tone?: 'pos' | 'neg' }[];
  /** Per-league finish strip, only shown in the pooled view. */
  finishes?: { label: string; finish?: number; of?: number; points: number }[];
  songs: SongStats[];
  ranks: RankedOpponent[];
  backers: RankedOpponent[];
  submitGenres: [string, number][];
  voteGenres: [string, number][];
  voteDecades: [string, number][];
  decades: [string, number][];
  biggestFan?: RankedOpponent;
  leastImpressed?: RankedOpponent;
  ownFavourite?: RankedOpponent;
  votingStyle?: { avgSongsVotedPer: number; avgPointsPerVote: number; tasteAlignment?: number; roundsMissedVoting: number; roundsVoted: number };
  /** Whether the who-they-rank table shows a devotion column (per-league only). */
  showDevotion: boolean;
}

function leagueView(a: LeagueAppearance): ScopeView {
  const p = a.player;
  return {
    title: `${a.label}${a.current ? ' — current season' : ''}`,
    chips: [
      { text: `${p.pointsCounted > 0 ? '+' : ''}${p.pointsCounted} points`, tone: p.pointsCounted < 0 ? 'neg' : 'pos' },
      { text: `${p.songs} songs` },
      { text: `avg ${n1(p.avgPerSong)}/song` },
      ...(p.wins > 0 ? [{ text: `${p.wins} round win${p.wins === 1 ? '' : 's'}` }] : []),
      ...(a.finish ? [{ text: `finished ${ordinal(a.finish)} of ${a.of}` }] : []),
      ...(p.roundsMissedVoting > 0 ? [{ text: `${p.roundsMissedVoting} round(s) not voted`, tone: 'neg' as const }] : []),
    ],
    songs: a.songs,
    ranks: a.ranks,
    backers: a.backers,
    submitGenres: a.submitGenres,
    voteGenres: a.voteGenres,
    voteDecades: a.voteDecades,
    decades: a.decades,
    biggestFan: a.biggestFan,
    leastImpressed: a.leastImpressed,
    ownFavourite: a.ownFavourite,
    votingStyle: {
      avgSongsVotedPer: p.avgSongsVotedPer,
      avgPointsPerVote: p.avgPointsPerVote,
      tasteAlignment: p.tasteAlignment,
      roundsMissedVoting: p.roundsMissedVoting,
      roundsVoted: p.roundsVoted,
    },
    showDevotion: true,
  };
}

function aggregateView(agg: AggregateAppearance): ScopeView {
  const t = agg.totals;
  return {
    title: 'All leagues — career',
    chips: [
      { text: `${t.points > 0 ? '+' : ''}${t.points} points`, tone: t.points < 0 ? 'neg' : 'pos' },
      { text: `${t.songs} songs` },
      ...(t.wins > 0 ? [{ text: `${t.wins} round win${t.wins === 1 ? '' : 's'}` }] : []),
      { text: `+${t.upvotesReceived}/−${t.downvotesReceived} received` },
      ...(t.roundsMissedVoting > 0 ? [{ text: `${t.roundsMissedVoting} round(s) not voted`, tone: 'neg' as const }] : []),
    ],
    finishes: t.finishes,
    songs: agg.songs,
    ranks: agg.ranks,
    backers: agg.backers,
    submitGenres: agg.submitGenres,
    voteGenres: agg.voteGenres,
    voteDecades: agg.voteDecades,
    decades: agg.decades,
    biggestFan: agg.biggestFan,
    leastImpressed: agg.leastImpressed,
    ownFavourite: agg.ownFavourite,
    // Devotion and taste alignment are per-league ratios; omitted when pooled.
    showDevotion: false,
  };
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

function SummaryCard({ view: a, onNavigate }: { view: ScopeView; onNavigate: (slug: string) => void }) {
  const { best, worst } = highlightSongs(a.songs);
  return (
    <Card title={a.title} wide>
      <div className="player-record dim small">
        {a.chips.map((c, i) => (
          <span key={i} className={c.tone === 'neg' ? 'neg' : undefined}>
            {c.tone === 'pos' ? <strong className="pos">{c.text}</strong> : c.text}
          </span>
        ))}
      </div>

      {a.finishes && a.finishes.length > 0 && (
        <p className="dim small player-tags">
          {a.finishes.map((f, i) => (
            <span key={f.label}>
              {i > 0 && ' · '}
              {f.label}: {f.finish ? `${ordinal(f.finish)} of ${f.of}` : 'did not submit'} (
              {f.points > 0 ? '+' : ''}
              {f.points})
            </span>
          ))}
        </p>
      )}

      <div className="summary-cols">
        <section className="summary-block">
          <h4 className="player-sub">{best.length > 1 ? 'Best submissions' : 'Best submission'}</h4>
          {best.length === 0 ? (
            <Empty>No submissions yet.</Empty>
          ) : (
            <div className="song-list">
              {best.map((s) => (
                <SongRow key={`${s.roundId}-${s.trackId}`} song={s} />
              ))}
            </div>
          )}
          {worst && (
            <>
              <h4 className="player-sub">Weakest submission</h4>
              <div className="song-list">
                <SongRow song={worst} />
              </div>
            </>
          )}
        </section>

        <section className="summary-block">
          <h4 className="player-sub">People</h4>
          <PlayerFacts view={a} onNavigate={onNavigate} />
          {(a.submitGenres.length > 0 || a.voteGenres.length > 0) && (
            <p className="dim small player-tags">
              {a.submitGenres.length > 0 && <>Submits: {a.submitGenres.map((g) => g[0]).join(', ')}. </>}
              {a.voteGenres.length > 0 && <>Rewards: {a.voteGenres.map((g) => g[0]).join(', ')}.</>}
            </p>
          )}
        </section>
      </div>
    </Card>
  );
}

function SubmissionsCard({ view: a, title }: { view: ScopeView; title: string }) {
  return (
    <Card title={title} subtitle={`${a.songs.length} songs${a.finishes && a.finishes.length > 1 ? ', across all leagues' : ''}`} wide>
      {a.songs.length === 0 ? (
        <Empty>No submissions.</Empty>
      ) : (
        <div className="song-list">
          {a.songs.map((s) => (
            <SongRow key={`${s.roundId}-${s.trackId}`} song={s} />
          ))}
        </div>
      )}
      {(a.voteGenres.length > 0 || a.voteDecades.length > 0) && (
        <>
          <h4 className="player-sub">What they submit</h4>
          <div className="vote-breakdowns">
            {a.submitGenres.length > 0 && (
              <VoteBreakdown title="Submissions by genre" rows={a.submitGenres} suffix="" />
            )}
            {a.decades.length > 0 && <VoteBreakdown title="Submissions by era" rows={a.decades} suffix="" />}
          </div>
        </>
      )}
    </Card>
  );
}

function RelationshipsCard({ view: a, onNavigate }: { view: ScopeView; onNavigate: (slug: string) => void }) {
  return (
    <Card title={`Relationships${a.finishes && a.finishes.length > 1 ? ' — all leagues' : ''}`} wide>
      {(a.voteGenres.length > 0 || a.voteDecades.length > 0) && (
        <div className="vote-breakdowns">
          {a.voteGenres.length > 0 && <VoteBreakdown title="Upvotes by genre" rows={a.voteGenres} />}
          {a.voteDecades.length > 0 && <VoteBreakdown title="Upvotes by era" rows={a.voteDecades} />}
        </div>
      )}

      <h4 className="player-sub">Who they rank</h4>
      {a.ranks.length === 0 ? (
        <Empty>They cast no votes.</Empty>
      ) : (
        <OpponentTable rows={a.ranks} onNavigate={onNavigate} showDevotion={a.showDevotion} backLabel="They gave back" />
      )}

      <h4 className="player-sub">Their fans and critics</h4>
      {a.backers.length === 0 ? (
        <Empty>No votes received.</Empty>
      ) : (
        <OpponentTable rows={a.backers} onNavigate={onNavigate} showDevotion={false} backLabel="They got back" />
      )}
    </Card>
  );
}

/** One submission row, shared by Summary and Submissions. */
function SongRow({ song: s }: { song: SongStats }) {
  return (
    <article className="song-row">
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
  );
}

/** A who-they-rank / fans table, shared by both directions. */
function OpponentTable({
  rows,
  onNavigate,
  showDevotion,
  backLabel,
}: {
  rows: RankedOpponent[];
  onNavigate: (slug: string) => void;
  showDevotion: boolean;
  backLabel: string;
}) {
  return (
    <table className="t">
      <thead>
        <tr>
          <th>Player</th>
          <th className="num">Up</th>
          <th className="num">Down</th>
          <th className="num">Net</th>
          {showDevotion && <th className="num">Devotion</th>}
          <th className="num">{backLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
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
            {showDevotion && <td className="num dim">{Math.round(r.devotion * 100)}%</td>}
            <td className="num dim">
              {r.reciprocalNet === undefined ? '—' : `${r.reciprocalNet > 0 ? '+' : ''}${r.reciprocalNet}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** A weighted bar chart. `suffix` distinguishes points (default '+') from counts (''). */
function VoteBreakdown({
  title,
  rows,
  suffix = '+',
}: {
  title: string;
  rows: [string, number][];
  suffix?: string;
}) {
  const max = rows[0]?.[1] ?? 1;
  return (
    <div className="vote-breakdown">
      <div className="vote-breakdown__title dim small">{title}</div>
      {rows.map(([label, pts]) => (
        <div key={label} className="vote-breakdown__row">
          <span className="vote-breakdown__label">{label}</span>
          <div className="vote-breakdown__bar-wrap">
            <div
              className="vote-breakdown__bar"
              style={{ width: `${Math.round((pts / max) * 100)}%` }}
            />
          </div>
          <span className="vote-breakdown__pts dim">
            {suffix}
            {pts}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Biggest fan / least impressed / their own favourite / voting style. */
function PlayerFacts({
  view: a,
  onNavigate,
}: {
  view: ScopeView;
  onNavigate: (slug: string) => void;
}) {
  const vs = a.votingStyle;
  const link = (r?: { name: string }) =>
    r ? (
      <button className="linklike" onClick={() => onNavigate(playerSlug(r.name))}>
        {r.name}
      </button>
    ) : (
      <span className="dim">—</span>
    );
  const sentiment = (r?: { up: number; down: number; net: number }) => {
    if (!r) return '';
    if (r.down === 0) return ` — +${r.up}, no downvotes`;
    if (r.up === 0) return ` — ${r.down} in downvotes, never a point given`;
    return ` — net ${r.net > 0 ? '+' : ''}${r.net} (${r.up} up, ${r.down} down)`;
  };
  return (
    <dl className="player-facts">
      <div>
        <dt>Biggest fan</dt>
        <dd>
          {link(a.biggestFan)}
          <span className="dim small">{sentiment(a.biggestFan)}</span>
        </dd>
      </div>
      <div>
        <dt>Least impressed</dt>
        <dd>
          {link(a.leastImpressed)}
          <span className="dim small">{sentiment(a.leastImpressed)}</span>
        </dd>
      </div>
      <div>
        <dt>Their own favourite</dt>
        <dd>
          {link(a.ownFavourite)}
          <span className="dim small">{sentiment(a.ownFavourite)}</span>
        </dd>
      </div>
      {vs && (
        <div>
          <dt>Voting style</dt>
          <dd>
            {vs.roundsVoted ? (
              <span className="dim small">
                {n1(vs.avgSongsVotedPer)} songs a round at {n1(vs.avgPointsPerVote)} pts each
                {vs.tasteAlignment !== undefined &&
                  ` · ${Math.round(vs.tasteAlignment * 100)}% ${vs.tasteAlignment >= 0.5 ? 'mainstream' : 'contrarian'}`}
                {vs.roundsMissedVoting > 0 && (
                  <span className="neg"> · skipped {vs.roundsMissedVoting}</span>
                )}
              </span>
            ) : (
              <span className="neg">never voted</span>
            )}
          </dd>
        </div>
      )}
    </dl>
  );
}
