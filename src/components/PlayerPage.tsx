import { useMemo, useState, type CSSProperties } from 'react';
import { embeddedGenres } from 'virtual:league-data';
import type { SongStats, Stats } from '../lib/stats';
import type { History } from '../lib/history';
import {
  buildPlayerProfile,
  careerStoryline,
  highlightSongs,
  playerSlug,
  popularityPosition,
  tasteLead,
  type AggregateAppearance,
  type LeagueAppearance,
  type PlayerProfile,
  type RankedOpponent,
} from '../lib/playerProfile';
import { SongArt, SongLinks, SongPlayer, SongTags, artFor } from './SongMedia';
import { PlayerAvatar, usePlayerTint } from './PlayerAvatar';
import { InfoTip, MethodDrawer } from './InfoTip';
import { Icon, genreIcon, type IconName } from './Icons';
import { ThemeChip, ThemeMedal } from './ThemeChip';
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
  const sectionTabs: { key: TabKey; label: string; icon: IconName }[] = [
    { key: 'summary', label: 'Summary', icon: 'star' },
    { key: 'submissions', label: 'Submissions', icon: 'disc' },
    { key: 'relationships', label: 'Relationships', icon: 'users' },
  ];
  const seasonTabs = multi ? leagueViews.map((l) => ({ key: l.id, label: l.label })) : [];
  const [tab, setTab] = useState<TabKey>('summary');

  // For a single-league player the pooled view *is* that league, so the
  // aggregate tabs already show everything; no separate per-league tab needed.
  const perLeague = leagueViews.find((l) => l.id === tab);

  return (
    <>
      <PlayerHeader profile={profile} />
      {/* Before their theme round, the scouting brief is the point of the page;
          afterwards its unique parts fold into Summary rather than repeating. */}
      {profile.themePending ? <ThemeBriefCard profile={profile} /> : null}

      <div className="scope-tabs" role="tablist" aria-label="Profile sections">
        <span className="scope-tabs__sections">
          {sectionTabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={`scope-tab${tab === t.key ? ' scope-tab--on' : ''}`}
              onClick={() => setTab(t.key)}
            >
              <Icon name={t.icon} size={14} /> {t.label}
            </button>
          ))}
        </span>
        {seasonTabs.length > 0 && (
          <span className="scope-tabs__season">
            <span className="scope-tabs__season-label">Season</span>
            {seasonTabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                className={`scope-tab scope-tab--season${tab === t.key ? ' scope-tab--on' : ''}`}
                onClick={() => setTab(t.key)}
              >
                <Icon name="calendarX" size={14} /> {t.label}
              </button>
            ))}
          </span>
        )}
      </div>

      {tab === 'summary' && (
        <SummaryCard
          view={pooled}
          onNavigate={onNavigate}
          brief={profile.themePending ? undefined : profile.brief}
        />
      )}
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
  submitPop: [string, number][];
  votePop: [string, number][];
  decades: [string, number][];
  biggestFan?: RankedOpponent;
  leastImpressed?: RankedOpponent;
  ownFavourite?: RankedOpponent;
  nemesis?: RankedOpponent;
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
    submitPop: a.submitPop,
    votePop: a.votePop,
    decades: a.decades,
    biggestFan: a.biggestFan,
    leastImpressed: a.leastImpressed,
    ownFavourite: a.ownFavourite,
    nemesis: a.nemesis,
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
    title: 'Career — all leagues combined',
    chips: [
      { text: `${t.points > 0 ? '+' : ''}${t.points} career points`, tone: t.points < 0 ? 'neg' : 'pos' },
      { text: `${t.songs} songs` },
      ...(t.wins > 0 ? [{ text: `${t.wins} round win${t.wins === 1 ? '' : 's'}` }] : []),
      { text: `${t.upvotesReceived} upvotes and ${t.downvotesReceived} downvotes received` },
      ...(t.roundsMissedVoting > 0 ? [{ text: `${t.roundsMissedVoting} round(s) not voted` }] : []),
    ],
    finishes: t.finishes,
    songs: agg.songs,
    ranks: agg.ranks,
    backers: agg.backers,
    submitGenres: agg.submitGenres,
    voteGenres: agg.voteGenres,
    voteDecades: agg.voteDecades,
    submitPop: agg.submitPop,
    votePop: agg.votePop,
    decades: agg.decades,
    biggestFan: agg.biggestFan,
    leastImpressed: agg.leastImpressed,
    ownFavourite: agg.ownFavourite,
    nemesis: agg.nemesis,
    // Devotion and taste alignment are per-league ratios; omitted when pooled.
    showDevotion: false,
  };
}

function PlayerHeader({ profile }: { profile: PlayerProfile }) {
  const current = profile.appearances.find((a) => a.current);
  const p = current?.player;
  const topSongs = profile.aggregate.songs.slice(0, 4).map((s) => s.spotifyId);
  const bestId = profile.aggregate.songs[0]?.spotifyId;
  const tint = usePlayerTint(profile.playerId, bestId);
  const backdrop = artFor(bestId, 'lg');
  const story = careerStoryline(profile.appearances);

  return (
    <Card wide>
      <header
        className="player-head player-head--hero"
        style={{ '--tint': tint } as CSSProperties}
      >
        {backdrop && (
          <div className="player-head__bg" style={{ backgroundImage: `url(${backdrop})` }} aria-hidden="true" />
        )}
        <div className="player-head__id">
          <PlayerAvatar name={profile.name} spotifyIds={topSongs} tint={tint} size={56} />
          <div>
            <h2 className="player-head__name display">{profile.name}</h2>
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
            {story && <div className="player-head__story">{story}</div>}
          </div>
        </div>
        {p && (
          <div className="player-head__score">
            <div className="player-head__score-num display">
              <span className={p.pointsCounted < 0 ? 'neg' : 'pos'}>
                {p.pointsCounted > 0 ? '+' : ''}
                {p.pointsCounted}
              </span>
              {p.themeBonus !== 0 && (
                <ThemeChip points={p.themeBonus} reason={profile.themeOutcome?.reason} compact />
              )}
            </div>
            <div className="player-head__score-label dim small">
              {current!.label} points{p.themeBonus !== 0 ? ', incl. theme' : ''}
            </div>
          </div>
        )}
      </header>
      {(profile.themeRoundName || profile.themePending) && (
        <ThemeMedal
          roundName={profile.themeRoundName}
          outcome={profile.themeOutcome}
          pending={profile.themePending}
        />
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
          rows={b.bestSubmissions
            .filter((s) => s.net > 0)
            .map((s) => [`${s.title} — ${s.artist}`, `+${s.net} (${s.league})`])}
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

function SummaryCard({
  view: a,
  onNavigate,
  brief,
}: {
  view: ScopeView;
  onNavigate: (slug: string) => void;
  /** Scouting brief; only the lists no other block already shows are used. */
  brief?: PlayerProfile['brief'];
}) {
  const { best, worst } = highlightSongs(a.songs);
  const artists = brief?.favouriteArtists.slice(0, 4) ?? [];
  const punished = brief?.mostDownvoted.slice(0, 4) ?? [];
  return (
    <Card title={a.title} wide>
      <div className="player-record dim small">
        {a.chips.map((c, i) => (
          <span key={i} className={c.tone === 'neg' ? 'neg' : undefined}>
            {c.tone === 'pos' ? <strong className="pos">{c.text}</strong> : c.text}
          </span>
        ))}
      </div>

      <TasteBlock view={a} />

      <div className="summary-cols">
        <section className="summary-block">
          <h4 className="player-sub">
            <Icon name="trophy" size={15} /> {best.length > 1 ? 'Best submissions' : 'Best submission'}
          </h4>
          {best.length === 0 ? (
            <Empty>No submissions yet.</Empty>
          ) : (
            <>
              <SongHero song={best[0]} />
              {best.length > 1 && (
                <div className="song-tiles">
                  {best.slice(1).map((s) => (
                    <SongTile key={`${s.roundId}-${s.trackId}`} song={s} />
                  ))}
                </div>
              )}
            </>
          )}
          {worst && (
            <>
              <h4 className="player-sub">
                <Icon name="thumbsDown" size={15} /> Weakest submission
              </h4>
              <div className="song-list song-list--muted">
                <SongRow song={worst} />
              </div>
            </>
          )}
        </section>

        <section className="summary-block">
          <h4 className="player-sub">People</h4>
          <PlayerFacts view={a} onNavigate={onNavigate} />
          {(artists.length > 0 || punished.length > 0) && (
            <div className="brief-grid brief-grid--pair">
              <BriefList title="Artists they reward" rows={artists.map((r) => [r[0], `${r[1]} pts`])} />
              <BriefList
                title="Songs they punished"
                rows={punished.map((d) => [`${d.title} — ${d.artist}`, `−${d.points}`])}
              />
            </div>
          )}
        </section>
      </div>
    </Card>
  );
}

/**
 * The headline taste read as pictures: how popular the music they like is (a
 * dial), which eras (a timeline), and which genres (icon chips) — arguably the
 * most telling thing about a player, so it leads the summary. A plain-text
 * equivalent is kept for assistive tech.
 */
function TasteBlock({ view: a }: { view: ScopeView }) {
  const submitPos = popularityPosition(a.submitPop);
  const rewardPos = popularityPosition(a.votePop);
  const submitEra = tasteLead(a.decades);
  const voteEra = tasteLead(a.voteDecades);
  const submitGenre = tasteLead(a.submitGenres);
  const voteGenre = tasteLead(a.voteGenres);
  const popText = (b?: string) => (b ? POP_PHRASE[b] ?? b : undefined);

  const hasPop = Boolean(submitPos || rewardPos);
  const hasEra = a.decades.length > 0 || a.voteDecades.length > 0;
  const hasGenre = a.submitGenres.length > 0 || a.voteGenres.length > 0;
  if (!hasPop && !hasEra && !hasGenre) return null;

  const srText = [
    submitPos && `Submits ${popText(tasteLead(a.submitPop))}`,
    rewardPos && `rewards ${popText(tasteLead(a.votePop))}`,
    submitEra && `era mostly ${submitEra}`,
    voteEra && `rewards era ${voteEra}`,
    submitGenre && `genre ${submitGenre}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="taste-block">
      <span className="sr-only">{srText}.</span>

      {hasPop && (
        <div className="taste-panel">
          <div className="taste-panel__label">
            Popularity
            <InfoTip label="How popularity is worked out">
              From last.fm listener counts: deep cut &lt;20k, niche &lt;100k, known &lt;500k, popular &lt;1M, hit
              1M+. The dial averages their songs (filled) and what they upvote (ring).
            </InfoTip>
          </div>
          <PopularityDial submit={submitPos?.pos} reward={rewardPos?.pos} />
          <div className="taste-panel__legend dim small">
            {submitPos && (
              <span>
                <span className="dot dot--submit" /> submissions
              </span>
            )}
            {rewardPos && (
              <span>
                <span className="dot dot--reward" /> votes
              </span>
            )}
          </div>
        </div>
      )}

      {hasEra && (
        <div className="taste-panel">
          <div className="taste-panel__label">Era</div>
          <EraTimeline submit={a.decades} reward={a.voteDecades} />
          <div className="taste-panel__legend dim small">
            {submitEra && (
              <span>
                <span className="dot dot--submit" /> submissions
              </span>
            )}
            {voteEra && (
              <span>
                <span className="dot dot--reward" /> votes
              </span>
            )}
          </div>
        </div>
      )}

      {hasGenre && (
        <div className="taste-panel">
          <div className="taste-panel__label">Genre</div>
          <div className="genre-chips">
            {(a.submitGenres.length ? a.submitGenres : a.voteGenres).slice(0, 3).map(([g]) => (
              <span className="genre-chip" key={g}>
                <Icon name={genreIcon(g)} size={14} /> {g}
              </span>
            ))}
          </div>
          {voteGenre && voteGenre !== submitGenre && (
            <div className="taste-panel__legend dim small">rewards {voteGenre}</div>
          )}
        </div>
      )}
    </div>
  );
}

/** A semicircular gauge from deep cuts (left) to big hits (right). */
function PopularityDial({ submit, reward }: { submit?: number; reward?: number }) {
  // Semicircle from 180° (left) to 0° (right). pos 0→1 maps to angle 180→0.
  const point = (pos: number, r: number) => {
    const angle = Math.PI * (1 - pos);
    return { x: 50 + r * Math.cos(angle), y: 50 - r * Math.sin(angle) };
  };
  return (
    <svg className="dial" viewBox="0 0 100 56" role="img" aria-label="Popularity from deep cuts to hits">
      <path d="M6 50 A44 44 0 0 1 94 50" fill="none" stroke="var(--line)" strokeWidth="6" strokeLinecap="round" />
      {reward !== undefined &&
        (() => {
          const p = point(reward, 44);
          return <circle cx={p.x} cy={p.y} r="5" fill="none" stroke="var(--accent-2)" strokeWidth="2.5" />;
        })()}
      {submit !== undefined &&
        (() => {
          const p = point(submit, 44);
          return <circle cx={p.x} cy={p.y} r="5" fill="var(--tint, var(--accent))" />;
        })()}
      <text x="6" y="55" className="dial__end">
        deep
      </text>
      <text x="94" y="55" className="dial__end" textAnchor="end">
        hits
      </text>
    </svg>
  );
}

/** A 1960s→2020s strip with dots (submissions) and rings (rewards) per era. */
function EraTimeline({ submit, reward }: { submit: [string, number][]; reward: [string, number][] }) {
  const DECADES = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
  const submitMap = new Map(submit);
  const rewardMap = new Map(reward);
  const hasSubmit = submit.length > 0;
  const hasReward = reward.length > 0;
  const maxS = Math.max(1, ...DECADES.map((d) => submitMap.get(d) ?? 0));
  const maxR = Math.max(1, ...DECADES.map((d) => rewardMap.get(d) ?? 0));
  return (
    <div className="era-timeline">
      {DECADES.map((d) => {
        const s = submitMap.get(d) ?? 0;
        const r = rewardMap.get(d) ?? 0;
        const sizeS = s > 0 ? 5 + Math.round((s / maxS) * 6) : 3;
        const sizeR = r > 0 ? 7 + Math.round((r / maxR) * 6) : 3;
        return (
          <div className="era-timeline__col" key={d} title={`${d}: ${s} submitted, ${r} rewarded`}>
            {hasSubmit && (
              <div className="era-timeline__cell">
                <span
                  className={`era-timeline__dot${s > 0 ? ' era-timeline__dot--submit' : ''}`}
                  style={{ width: sizeS, height: sizeS }}
                />
              </div>
            )}
            {hasReward && (
              <div className="era-timeline__cell">
                {r > 0 ? (
                  <span
                    className="era-timeline__ring"
                    style={{ width: sizeR, height: sizeR }}
                  />
                ) : (
                  <span className="era-timeline__dot" style={{ width: 3, height: 3 }} />
                )}
              </div>
            )}
            <span className="era-timeline__label dim">{d.slice(2)}</span>
          </div>
        );
      })}
    </div>
  );
}

const POP_PHRASE: Record<string, string> = {
  'deep cut': 'deep cuts',
  niche: 'niche picks',
  known: 'known tracks',
  popular: 'popular songs',
  hit: 'big hits',
};

function SubmissionsCard({ view: a, title }: { view: ScopeView; title: string }) {
  return (
    <Card title={title} subtitle={`${a.songs.length} songs${a.finishes && a.finishes.length > 1 ? ', across all leagues' : ''}`} wide>
      {a.songs.length === 0 ? (
        <Empty>No submissions.</Empty>
      ) : (
        <>
          <CoverStrip songs={a.songs} />
          <div className="song-list">
            {a.songs.map((s) => (
              <SongRow key={`${s.roundId}-${s.trackId}`} song={s} />
            ))}
          </div>
        </>
      )}
      {(a.voteGenres.length > 0 || a.voteDecades.length > 0 || a.submitPop.length > 0) && (
        <>
          <h4 className="player-sub">What they submit</h4>
          <div className="vote-breakdowns">
            {a.submitGenres.length > 0 && (
              <VoteBreakdown title="Submissions by genre" rows={a.submitGenres} suffix="" />
            )}
            {a.decades.length > 0 && <VoteBreakdown title="Submissions by era" rows={a.decades} suffix="" />}
            {a.submitPop.length > 0 && (
              <VoteBreakdown title="Submissions by popularity" rows={a.submitPop} suffix="" />
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function RelationshipsCard({ view: a, onNavigate }: { view: ScopeView; onNavigate: (slug: string) => void }) {
  return (
    <Card title={`Relationships${a.finishes && a.finishes.length > 1 ? ' — all leagues' : ''}`} wide>
      {(a.voteGenres.length > 0 || a.voteDecades.length > 0 || a.votePop.length > 0) && (
        <div className="vote-breakdowns">
          {a.voteGenres.length > 0 && <VoteBreakdown title="Upvotes by genre" rows={a.voteGenres} />}
          {a.voteDecades.length > 0 && <VoteBreakdown title="Upvotes by era" rows={a.voteDecades} />}
          {a.votePop.length > 0 && <VoteBreakdown title="Upvotes by popularity" rows={a.votePop} />}
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
    <article className="song-row" id={`song-${s.roundId}-${s.trackId}`}>
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

/** The single best song, shown large with a score badge on the cover. */
function SongHero({ song: s }: { song: SongStats }) {
  return (
    <article className="song-hero">
      <div className="song-hero__art">
        <SongArt title={s.title} spotifyId={s.spotifyId} size="xl" px={128} />
        <span className={`song-hero__badge ${s.effectiveNet < 0 ? 'neg' : 'pos'}`}>
          {s.effectiveNet > 0 ? '+' : ''}
          {s.effectiveNet}
        </span>
      </div>
      <div className="song-hero__body">
        <strong className="song-hero__title">{s.title || 'Untitled'}</strong>
        {s.artist && <div className="dim">{s.artist}</div>}
        <div className="dim small">{s.roundName}</div>
        <SongTags year={s.year} obscurity={s.obscurity} artist={s.artist} durationMs={s.durationMs} cover={s.cover} />
        <div className="song-hero__links">
          <SongLinks title={s.title} artist={s.artist} spotifyId={s.spotifyId} />
          {s.spotifyId && <SongPlayer title={s.title} spotifyId={s.spotifyId} compact />}
        </div>
      </div>
    </article>
  );
}

/** A compact cover tile for runner-up songs. */
function SongTile({ song: s }: { song: SongStats }) {
  return (
    <article className="song-tile" title={`${s.title} — ${s.artist} (${s.effectiveNet > 0 ? '+' : ''}${s.effectiveNet})`}>
      <div className="song-tile__art">
        <SongArt title={s.title} spotifyId={s.spotifyId} size="sm" px={56} />
        <span className={`song-tile__badge ${s.effectiveNet < 0 ? 'neg' : 'pos'}`}>
          {s.effectiveNet > 0 ? '+' : ''}
          {s.effectiveNet}
        </span>
      </div>
      <div className="song-tile__title small">{s.title || 'Untitled'}</div>
    </article>
  );
}

/** A row of every submitted cover, tinted by score, as a one-glance run. */
function CoverStrip({ songs }: { songs: SongStats[] }) {
  if (songs.length < 3) return null;
  // Chronological (songs come in best-first); show them in round order.
  const ordered = [...songs].sort((a, b) => (a.roundName ?? '').localeCompare(b.roundName ?? ''));
  return (
    <div className="cover-strip" aria-hidden="true">
      {ordered.map((s) => {
        const tone = s.effectiveNet > 3 ? 'pos' : s.effectiveNet < 0 ? 'neg' : 'mid';
        return (
          <a
            key={`${s.roundId}-${s.trackId}`}
            className={`cover-strip__cell cover-strip__cell--${tone}`}
            href={`#song-${s.roundId}-${s.trackId}`}
            title={`${s.title} (${s.effectiveNet > 0 ? '+' : ''}${s.effectiveNet})`}
          >
            <SongArt title={s.title} spotifyId={s.spotifyId} size="sm" px={40} />
          </a>
        );
      })}
    </div>
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
    <div className="table-scroll">
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
    </div>
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

/**
 * People, split by direction so "who dislikes them" and "who they dislike"
 * can no longer be confused: the room on them, then them on the room. Each
 * person shows a single net figure; the up/down split sits in a tooltip.
 */
function PlayerFacts({
  view: a,
  onNavigate,
}: {
  view: ScopeView;
  onNavigate: (slug: string) => void;
}) {
  const vs = a.votingStyle;
  const person = (label: string, icon: IconName, r: RankedOpponent | undefined, figure: 'net' | 'down') => (
    <div className="person">
      <div className="person__label">
        <Icon name={icon} size={14} /> {label}
      </div>
      {r ? (
        <>
          <button className="linklike person__name" onClick={() => onNavigate(playerSlug(r.name))}>
            {r.name}
          </button>
          <span
            className={`person__fig ${figure === 'down' || r.net < 0 ? 'neg' : 'pos'}`}
            title={`${r.up} up, ${r.down} down — net ${r.net > 0 ? '+' : ''}${r.net}`}
          >
            {figure === 'down' ? `−${r.down}` : `${r.net > 0 ? '+' : ''}${r.net}`}
          </span>
        </>
      ) : (
        <span className="dim">—</span>
      )}
    </div>
  );
  return (
    <div className="people">
      <div className="people__group">
        <div className="people__dir">How the room votes on them</div>
        {person('Biggest fan', 'heart', a.biggestFan, 'net')}
        {person('Harshest critic', 'snowflake', a.leastImpressed, 'net')}
      </div>
      <div className="people__group">
        <div className="people__dir">How they vote on the room</div>
        {person('Favourite', 'star', a.ownFavourite, 'net')}
        {person('Nemesis', 'swords', a.nemesis, 'down')}
      </div>
      {vs && (
        <p className="people__style dim small">
          {vs.roundsVoted ? (
            <>
              Votes for {n1(vs.avgSongsVotedPer)} songs a round, {n1(vs.avgPointsPerVote)} pts each
              {vs.tasteAlignment !== undefined &&
                ` · ${vs.tasteAlignment >= 0.5 ? 'mainstream' : 'contrarian'} taste`}
              {vs.roundsMissedVoting > 0 && <span className="neg"> · skipped {vs.roundsMissedVoting}</span>}
            </>
          ) : (
            <span className="neg">Has never voted</span>
          )}
        </p>
      )}
      <MethodDrawer>
        <p>
          Warmth is ranked by <em>net affinity</em> — points given as a share of an even ballot, with
          downvotes counting against it — not by raw points, so a single big vote does not crown a fan.
        </p>
        <p>
          Harshest critic needs at least two of this player's songs to judge, so one stray downvote is
          not mistaken for a grudge. Nemesis is simply whoever they spend the most downvotes on.
        </p>
      </MethodDrawer>
    </div>
  );
}
