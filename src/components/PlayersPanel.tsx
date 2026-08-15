import { useMemo } from 'react';
import { embeddedGenres } from 'virtual:league-data';
import type { PairStats, PlayerStats, Stats } from '../lib/stats';
import { computePlayerTasteProfiles, type PlayerTasteProfile } from '../lib/taste';
import { Card, Empty, n1, n2, pct0, ScoreParts, SortableTable, type Column } from './ui';

const POP_LABEL: Record<string, string> = {
  'deep cut': '< 20k',
  'niche':    '20–100k',
  'known':    '100–500k',
  'popular':  '500k–1M',
  'hit':      '> 1M',
};

/** Full player table: performance as a submitter and habits as a voter. */
export function PlayersPanel({ stats }: { stats: Stats }) {
  const rows = useMemo(
    () => stats.players.filter((p) => p.songs > 0 || p.roundsVoted > 0),
    [stats.players],
  );

  const tasteMap = useMemo(() => {
    const profiles = computePlayerTasteProfiles(stats, embeddedGenres);
    return new Map<string, PlayerTasteProfile>(profiles.map((p) => [p.playerId, p]));
  }, [stats]);

  const hasGenre = [...tasteMap.values()].some((p) => p.submitGenre ?? p.voteGenre);
  const hasPop   = [...tasteMap.values()].some((p) => p.submitPopBand ?? p.votePopBand);

  const columns: Column<PlayerStats>[] = [
    {
      key: 'name',
      label: 'Player',
      value: (p) => p.name,
      render: (p) => <strong className="nowrap">{p.name}</strong>,
    },
    {
      key: 'points',
      label: 'Total score',
      title: 'What the league has counted, after downvotes and any forfeit',
      value: (p) => p.pointsCounted,
      render: (p) => (
        <strong className={p.pointsCounted < 0 ? 'neg' : undefined}>{n1(p.pointsCounted)}</strong>
      ),
      align: 'right',
    },
    {
      key: 'up',
      label: 'Upvotes',
      title: 'Upvote points their songs received',
      value: (p) => p.breakdown.upvotes,
      render: (p) => <span className="pos">+{n1(p.breakdown.upvotes)}</span>,
      align: 'right',
    },
    {
      key: 'down',
      label: 'Downvotes',
      title: 'Downvote points their songs received',
      value: (p) => p.breakdown.downvotes,
      render: (p) =>
        p.breakdown.downvotes ? (
          <span className="neg">−{n1(p.breakdown.downvotes)}</span>
        ) : (
          <span className="dim">—</span>
        ),
      align: 'right',
    },
    {
      key: 'forfeit',
      label: 'Forfeited',
      title: 'Upvotes withheld because they did not vote that round',
      value: (p) => p.breakdown.forfeited,
      render: (p) =>
        p.breakdown.forfeited ? (
          <span className="neg">−{n1(p.breakdown.forfeited)}</span>
        ) : (
          <span className="dim">—</span>
        ),
      align: 'right',
    },
    {
      key: 'avg',
      label: 'Per song',
      value: (p) => p.avgPerSong,
      render: (p) => n1(p.avgPerSong),
      align: 'right',
    },
    { key: 'wins', label: 'Round wins', value: (p) => p.wins, align: 'right' },
    {
      key: 'rank',
      label: 'Avg place',
      title: 'Mean finishing position of their songs within a round',
      value: (p) => -p.avgRoundRank,
      render: (p) => (p.songs ? `#${n1(p.avgRoundRank)}` : '—'),
      align: 'right',
    },
    {
      key: 'breadth',
      label: 'Reach',
      title: 'Average share of eligible voters who gave their songs points',
      value: (p) => p.avgBreadth,
      render: (p) => pct0(p.avgBreadth),
      align: 'right',
    },
    {
      key: 'supporters',
      label: 'Supporters',
      title: 'Distinct players who ever gave them a point',
      value: (p) => p.distinctSupporters,
      align: 'right',
    },
    {
      key: 'given',
      label: 'Points given',
      value: (p) => p.upvotesGiven,
      render: (p) => n1(p.upvotesGiven),
      align: 'right',
    },
    {
      key: 'spreadStyle',
      label: 'Songs backed/round',
      title: 'How thinly they spread their ballot',
      value: (p) => p.avgSongsVotedPer,
      render: (p) => (p.roundsVoted ? n1(p.avgSongsVotedPer) : '—'),
      align: 'right',
    },
    {
      key: 'stack',
      label: 'Maxed out',
      title: 'Share of their points placed at the round per-song cap',
      value: (p) => p.maxStackRate,
      render: (p) => (p.roundsVoted ? pct0(p.maxStackRate) : '—'),
      align: 'right',
    },
    {
      key: 'taste',
      label: 'Taste alignment',
      title: 'How closely their picks matched the rest of the league. High = mainstream, low = contrarian.',
      value: (p) => p.tasteAlignment ?? -1,
      render: (p) => (p.tasteAlignment === undefined ? '—' : pct0(p.tasteAlignment)),
      align: 'right',
    },
    {
      key: 'downGiven',
      label: 'Downvotes cast',
      value: (p) => p.downvotesGiven,
      render: (p) => (p.downvotesGiven ? n1(p.downvotesGiven) : '—'),
      align: 'right',
    },
    ...(hasGenre ? [{
      key: 'genreSub',
      label: 'Genre (sub)',
      title: 'Most common genre across their submitted songs',
      value: (p: PlayerStats) => tasteMap.get(p.playerId)?.submitGenre ?? '',
      render: (p: PlayerStats) => tasteMap.get(p.playerId)?.submitGenre ?? <span className="dim">—</span>,
    } satisfies Column<PlayerStats>] : []),
    ...(hasGenre ? [{
      key: 'genreVote',
      label: 'Genre (vote)',
      title: 'Most common genre of songs they upvoted (points-weighted)',
      value: (p: PlayerStats) => tasteMap.get(p.playerId)?.voteGenre ?? '',
      render: (p: PlayerStats) => tasteMap.get(p.playerId)?.voteGenre ?? <span className="dim">—</span>,
    } satisfies Column<PlayerStats>] : []),
    ...(hasPop ? [{
      key: 'popSub',
      label: 'Pop (sub)',
      title: 'Most common popularity band of their submitted songs',
      value: (p: PlayerStats) => tasteMap.get(p.playerId)?.submitPopBand ?? '',
      render: (p: PlayerStats) => {
        const band = tasteMap.get(p.playerId)?.submitPopBand;
        return band ? POP_LABEL[band] : <span className="dim">—</span>;
      },
    } satisfies Column<PlayerStats>] : []),
    ...(hasPop ? [{
      key: 'popVote',
      label: 'Pop (vote)',
      title: 'Most common popularity band of songs they upvoted (points-weighted)',
      value: (p: PlayerStats) => tasteMap.get(p.playerId)?.votePopBand ?? '',
      render: (p: PlayerStats) => {
        const band = tasteMap.get(p.playerId)?.votePopBand;
        return band ? POP_LABEL[band] : <span className="dim">—</span>;
      },
    } satisfies Column<PlayerStats>] : []),
  ];

  if (!rows.length) {
    return (
      <Card title="Players">
        <Empty>No identifiable players in this export.</Empty>
      </Card>
    );
  }

  return (
    <Card title="Players, end to end" subtitle="Every metric side by side. Click a header to sort." wide>
      <SortableTable columns={columns} rows={rows} initialSort="points" rowKey={(p) => p.playerId} />
    </Card>
  );
}

/** Per-player narrative cards: best and worst moments, who backs them. */
export function PlayerProfiles({ stats }: { stats: Stats }) {
  const nameOf = useMemo(
    () => new Map(stats.players.map((p) => [p.playerId, p.name])),
    [stats.players],
  );

  const tasteMap = useMemo(() => {
    const profiles = computePlayerTasteProfiles(stats, embeddedGenres);
    return new Map<string, PlayerTasteProfile>(profiles.map((p) => [p.playerId, p]));
  }, [stats]);

  const ranked = useMemo(
    () => [...stats.players].filter((p) => p.songs > 0).sort((a, b) => b.pointsCounted - a.pointsCounted),
    [stats.players],
  );

  if (!ranked.length) return null;

  // All three of these describe how one player feels about another, so they
  // rank on net points. Ranking a fan or a sceptic on upvotes alone ignores
  // every downvote they cast, which is most of the sentiment in a league where
  // 348 points were spent taking points away.
  const topFanOf = (playerId: string) =>
    [...stats.pairs]
      .filter((p) => p.targetId === playerId && p.opportunities >= 1 && p.upvotes > 0)
      .sort((a, b) => b.netAffinity - a.netAffinity || b.upvotes - a.upvotes)[0];

  const coldestTo = (playerId: string) =>
    [...stats.pairs]
      .filter((p) => p.targetId === playerId && p.songsAvailable >= 2)
      // Ties on net go to whoever had more chances to warm up and did not.
      .sort((a, b) => a.netAffinity - b.netAffinity || b.songsAvailable - a.songsAvailable)[0];

  const favouriteTarget = (playerId: string) =>
    [...stats.pairs]
      .filter((p) => p.voterId === playerId && p.upvotes > 0)
      .sort((a, b) => b.netAffinity - a.netAffinity || b.upvotes - a.upvotes)[0];

  /**
   * Pair sentiment in words. The split is spelled out whenever downvotes exist,
   * because "1 pt" and "1 pt against 6 downvotes" are opposite feelings.
   */
  const sentiment = (p: PairStats): string => {
    const pts = (v: number) => `${n1(v)} pt${v === 1 ? '' : 's'}`;
    if (p.upvotes === 0 && p.downvotes === 0) {
      return `never voted on their songs, ${p.songsAvailable} chances`;
    }
    if (p.downvotes === 0) return `${pts(p.upvotes)}, ${n2(p.affinity)}× expected`;
    if (p.upvotes === 0) return `${pts(p.downvotes)} of downvotes, never a point given`;
    return `net ${p.net > 0 ? '+' : ''}${n1(p.net)} — ${n1(p.upvotes)} up, ${n1(p.downvotes)} down`;
  };

  return (
    <Card title="Player profiles" subtitle="Best and worst moments, plus who is in whose corner." wide>
      <div className="profiles">
        {ranked.map((p, i) => {
          const fan = topFanOf(p.playerId);
          const cold = coldestTo(p.playerId);
          const crush = favouriteTarget(p.playerId);
          return (
            <article className="profile" key={p.playerId}>
              <header>
                <span className="profile__rank">#{i + 1}</span>
                <h3>{p.name}</h3>
                <span className="profile__pts">{n1(p.pointsCounted)} pts</span>
              </header>
              <div className="profile__parts">
                <ScoreParts breakdown={p.breakdown} showTotal={false} />
              </div>
              <dl>
                <div>
                  <dt>Best song</dt>
                  <dd>
                    {p.bestSong ? (
                      <>
                        {p.bestSong.title}{' '}
                        <span className="dim">
                          — {n1(p.bestSong.effectiveNet)} pts, {p.bestSong.roundName}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Worst song</dt>
                  <dd>
                    {p.worstSong ? (
                      <>
                        {p.worstSong.title}{' '}
                        <span className="dim">
                          — {n1(p.worstSong.effectiveNet)} pts, {p.worstSong.roundName}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Biggest fan</dt>
                  <dd>
                    {fan ? (
                      <>
                        {nameOf.get(fan.voterId)}{' '}
                        <span className="dim">{sentiment(fan)}</span>
                      </>
                    ) : (
                      <span className="dim">nobody yet</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Least impressed</dt>
                  <dd>
                    {cold ? (
                      <>
                        {nameOf.get(cold.voterId)}{' '}
                        <span className="dim">{sentiment(cold)}</span>
                      </>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Their own favourite</dt>
                  <dd>
                    {crush ? (
                      <>
                        {nameOf.get(crush.targetId)}{' '}
                        <span className="dim">{sentiment(crush)}</span>
                      </>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Voting style</dt>
                  <dd>
                    {p.roundsVoted ? (
                      <span className="dim">
                        {n1(p.avgSongsVotedPer)} songs a round at {n1(p.avgPointsPerVote)} pts each
                        {p.tasteAlignment !== undefined && ` · ${pct0(p.tasteAlignment)} taste alignment`}
                        {p.roundsMissedVoting > 0 && (
                          <span className="neg"> · skipped {p.roundsMissedVoting}</span>
                        )}
                      </span>
                    ) : (
                      <span className="neg">never voted</span>
                    )}
                  </dd>
                </div>
                {(() => {
                  const t = tasteMap.get(p.playerId);
                  if (!t) return null;
                  const genreParts = [
                    t.submitGenre && `${t.submitGenre} (sub)`,
                    t.voteGenre && t.voteGenre !== t.submitGenre && `${t.voteGenre} (vote)`,
                  ].filter(Boolean).join(' · ');
                  const popParts = [
                    t.submitPopBand && `${POP_LABEL[t.submitPopBand]} (sub)`,
                    t.votePopBand && t.votePopBand !== t.submitPopBand && `${POP_LABEL[t.votePopBand]} (vote)`,
                  ].filter(Boolean).join(' · ');
                  return (
                    <>
                      {genreParts && (
                        <div>
                          <dt>Genre</dt>
                          <dd><span className="dim">{genreParts}</span></dd>
                        </div>
                      )}
                      {popParts && (
                        <div>
                          <dt>Popularity</dt>
                          <dd><span className="dim">{popParts}</span></dd>
                        </div>
                      )}
                    </>
                  );
                })()}
              </dl>
            </article>
          );
        })}
      </div>
    </Card>
  );
}
