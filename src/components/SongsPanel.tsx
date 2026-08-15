import { useMemo, useState } from 'react';
import type { SongStats, Stats } from '../lib/stats';
import { embeddedGenres } from 'virtual:league-data';
import { obscurityBand } from '../lib/obscurity';
import { Card, Empty, n1, n2, pct0, ScoreParts, SortableTable, type Column } from './ui';
import { SongArt, SongLinks, SongTags } from './SongMedia';
import { Icon } from './Icons';


type ContentFilter = 'all' | 'covers' | 'forfeited' | `genre:${string}`;

/** Song-level leaderboard: hauls, breadth, concentration, divisiveness. */
export function SongsPanel({ stats }: { stats: Stats }) {
  const [roundFilter, setRoundFilter] = useState<string>('all');
  const [contentFilter, setContentFilter] = useState<ContentFilter>('all');
  const nameOf = useMemo(
    () => new Map(stats.players.map((p) => [p.playerId, p.name])),
    [stats.players],
  );

  // Top genres appearing on at least 3 songs, for filter chips.
  const topGenres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of stats.songs) {
      const genres = embeddedGenres[(s.artist?.split(',')[0] ?? '').trim().toLowerCase()] ?? [];
      for (const g of genres.slice(0, 1)) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([g]) => g);
  }, [stats.songs]);

  const rows = useMemo(() => {
    let songs = roundFilter === 'all' ? stats.songs : stats.songs.filter((s) => s.roundId === roundFilter);
    if (contentFilter === 'covers') songs = songs.filter((s) => s.cover !== undefined);
    else if (contentFilter === 'forfeited') songs = songs.filter((s) => s.forfeited);
    else if (contentFilter.startsWith('genre:')) {
      const g = contentFilter.slice(6);
      songs = songs.filter((s) => {
        const genres = embeddedGenres[(s.artist?.split(',')[0] ?? '').trim().toLowerCase()] ?? [];
        return genres.includes(g);
      });
    }
    return songs;
  }, [stats.songs, roundFilter, contentFilter]);

  const columns: Column<SongStats>[] = [
    {
      key: 'song',
      label: 'Song',
      value: (s) => s.title,
      render: (s) => (
        <span className="songcell">
          <SongArt title={s.title} spotifyId={s.spotifyId} size="lg" px={96} />
          <span className="songcell__text">
            <strong>{s.title || 'Untitled'}</strong>
            {s.artist && <span className="dim"> — {s.artist}</span>}{' '}
            <SongLinks title={s.title} artist={s.artist} spotifyId={s.spotifyId} />
            <SongTags year={s.year} obscurity={s.obscurity} artist={s.artist} durationMs={s.durationMs} cover={s.cover} />
          </span>
        </span>
      ),
    },
    {
      key: 'by',
      label: 'Submitted by',
      value: (s) => (s.submitterId ? nameOf.get(s.submitterId) ?? '' : 'anonymous'),
    },
    { key: 'round', label: 'Round', value: (s) => s.roundSequence, render: (s) => s.roundName },
    {
      key: 'year',
      label: 'Year',
      value: (s) => s.year ?? 0,
      render: (s) => s.year ? <span className="dim small">{s.year}</span> : <span className="dim">—</span>,
      align: 'right' as const,
    },
    {
      key: 'popularity',
      label: 'Popularity',
      title: 'Last.fm listener count band',
      value: (s) => s.obscurity?.value ?? -1,
      render: (s) => {
        if (!s.obscurity) return <span className="dim">—</span>;
        const band = obscurityBand(s.obscurity.value, s.obscurity.source);
        const cls = band === 'deep cut' ? 'song-tag song-tag--obscurity' : 'dim small';
        return <span className={cls}>{band}</span>;
      },
    },
    {
      key: 'genre',
      label: 'Genre',
      value: (s) => (embeddedGenres[(s.artist?.split(',')[0] ?? '').trim().toLowerCase()]?.[0] ?? ''),
      render: (s) => {
        const g = embeddedGenres[(s.artist?.split(',')[0] ?? '').trim().toLowerCase()]?.[0];
        return g ? <span className="dim small">{g}</span> : <span className="dim">—</span>;
      },
    },
    {
      key: 'net',
      label: 'Score',
      title: 'What the round counted for this song, after downvotes and any forfeit',
      value: (s) => s.countedScore,
      render: (s) => (
        <span className="nowrap">
          <strong className={s.countedScore < 0 ? 'neg' : undefined}>{n1(s.countedScore)}</strong>
          {s.breakdown.forfeited > 0 && (
            <span
              className="dim small"
              title={`${n1(s.breakdown.forfeited)} upvote points forfeited: the submitter did not vote in this round`}
            >
              {' '}
              −{n1(s.breakdown.forfeited)} ff
            </span>
          )}
        </span>
      ),
      align: 'right',
    },
    {
      key: 'place',
      label: 'Place',
      value: (s) => -s.roundRank,
      render: (s) => `#${s.roundRank}`,
      align: 'right',
    },
    {
      key: 'breadth',
      label: 'Voters reached',
      title: 'Voters who gave it points, out of those who could',
      value: (s) => s.breadth,
      render: (s) => (
        <>
          {s.distinctUpvoters}/{s.eligibleVoters} <span className="dim">{pct0(s.breadth)}</span>
        </>
      ),
      align: 'right',
    },
    {
      key: 'spread',
      label: 'Spread',
      title: 'Standard deviation of points across eligible voters. High means the room disagreed.',
      value: (s) => s.spread,
      render: (s) => `±${n1(s.spread)}`,
      align: 'right',
    },
    {
      key: 'conc',
      label: 'Concentration',
      title: 'Herfindahl index of upvotes. 100% means a single voter supplied the whole score.',
      value: (s) => s.concentration,
      render: (s) => (s.upvotes > 0 ? pct0(s.concentration) : '—'),
      align: 'right',
    },
  ];

  if (!stats.songs.length) {
    return (
      <Card title="Every song">
        <Empty>No submissions found in this export.</Empty>
      </Card>
    );
  }

  return (
    <Card
      title="Every song"
      subtitle="Every song in the league. Sort by any column — spread and concentration are where the arguments live."
      wide
    >
      <div className="song-filters">
        <div className="seg seg--wrap">
          <span className="seg__label">Round</span>
          <button className={roundFilter === 'all' ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => setRoundFilter('all')}>All</button>
          {stats.league.rounds.map((r) => (
            <button key={r.id} className={roundFilter === r.id ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => setRoundFilter(r.id)}>{r.name}</button>
          ))}
        </div>
        <div className="seg seg--wrap">
          <span className="seg__label">Show</span>
          {([['all', 'All'], ['covers', 'Covers'], ['forfeited', 'Forfeited']] as [ContentFilter, string][]).map(([key, label]) => (
            <button key={key} className={contentFilter === key ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => setContentFilter(key)}>{label}</button>
          ))}
          {topGenres.map((g) => (
            <button key={g} className={contentFilter === `genre:${g}` ? 'seg__btn seg__btn--on' : 'seg__btn'} onClick={() => setContentFilter(`genre:${g}`)}>{g}</button>
          ))}
        </div>
      </div>
      <SortableTable columns={columns} rows={rows} initialSort="net" rowKey={(s) => s.trackId} />
    </Card>
  );
}

/** Round-by-round summary: winner, turnout, how contested it was. */
export function RoundsPanel({ stats }: { stats: Stats }) {
  const nameOf = useMemo(
    () => new Map(stats.players.map((p) => [p.playerId, p.name])),
    [stats.players],
  );
  const songByTrack = useMemo(
    () => new Map(stats.songs.map((s) => [s.trackId, s])),
    [stats.songs],
  );

  if (!stats.rounds.length) {
    return (
      <Card title="Round by round">
        <Empty>No rounds found.</Empty>
      </Card>
    );
  }

  return (
    <Card title="Round by round" subtitle="Turnout, the winner, and how evenly the points landed." wide>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Round</th>
              <th>Winner</th>
              <th className="num">Songs</th>
              <th className="num">Voted</th>
              <th className="num">Skipped voting</th>
              <th className="num" title="Total upvote points cast">
                Points cast
              </th>
              <th className="num" title="Highest points any single voter placed on one song">
                Observed cap
              </th>
              <th className="num" title="Winning song's share of all upvotes in the round">
                Winner share
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.rounds.map((r) => {
              const winner = r.winnerTrackId ? songByTrack.get(r.winnerTrackId) : undefined;
              return (
                <tr key={r.round.id}>
                  <td className="dim">{r.round.sequence}</td>
                  <td>
                    <strong>{r.round.name}</strong>
                    {r.round.playlistUrl && (
                      <>
                        {' '}
                        <a
                          className="links__btn"
                          href={r.round.playlistUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          title={`Open the ${r.round.name} playlist on Spotify`}
                        >
                          <Icon name="spotify" size={14} />
                        </a>
                      </>
                    )}
                    {r.round.description && <div className="dim small">{r.round.description}</div>}
                  </td>
                  <td>
                    {winner ? (
                      <span className="songcell">
                        <SongArt title={winner.title} spotifyId={winner.spotifyId} size="lg" px={104} />
                        <span className="songcell__text">
                          {winner.submitterId ? nameOf.get(winner.submitterId) : 'anonymous'}
                          <div className="dim small">{winner.title}</div>
                          <ScoreParts breakdown={winner.breakdown} />
                        </span>
                      </span>
                    ) : (
                      <span className="dim">no result</span>
                    )}
                  </td>
                  <td className="num">{r.songCount}</td>
                  <td className="num">{r.voters.length}</td>
                  <td className="num">
                    {r.nonVoters.length ? (
                      <span className="neg" title={r.nonVoters.map((id) => nameOf.get(id) ?? id).join(', ')}>
                        {r.nonVoters.length}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="num">{n1(r.totalUpvotes)}</td>
                  <td className="num dim">{n1(r.observedPerSongCap)}</td>
                  <td className="num">{winner ? pct0(winner.shareOfRound) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">
        Observed cap is inferred from the largest single vote actually cast, so it reflects any
        automatic per-song limit raise Music League applied. Hover a skipped-voting count to see who.
      </p>
    </Card>
  );
}

/** Most-submitted artists. */
export function ArtistsPanel({ stats }: { stats: Stats }) {
  const repeated = stats.artistCounts.filter((a) => a.count > 1).slice(0, 15);
  if (!repeated.length) return null;

  return (
    <Card title="Artists the league keeps returning to" subtitle="Submitted more than once across the season.">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Artist</th>
              <th className="num">Submissions</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {repeated.map((a) => (
              <tr key={a.artist}>
                <td>
                  <strong>{a.artist}</strong>
                </td>
                <td className="num">{a.count}</td>
                <td className="dim">{a.submitters.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Divisive versus universally liked songs. */
export function ConsensusPanel({ stats }: { stats: Stats }) {
  const candidates = stats.songs.filter((s) => s.eligibleVoters >= 3 && s.upvotes > 0);
  if (!candidates.length) return null;

  const nameOf = new Map(stats.players.map((p) => [p.playerId, p.name]));
  const byBreadth = [...candidates]
    .sort((a, b) => b.breadth - a.breadth || b.effectiveNet - a.effectiveNet)
    .slice(0, 8);
  const bySpread = [...candidates].sort((a, b) => b.spread - a.spread).slice(0, 8);

  const list = (songs: SongStats[], metric: (s: SongStats) => string) => (
    <ol className="ranklist">
      {songs.map((s) => (
        <li key={s.trackId}>
          <span className="ranklist__val">{metric(s)}</span>
          <span className="ranklist__main">
            <strong>{s.title || 'Untitled'}</strong>
            {s.artist && <span className="dim"> — {s.artist}</span>}{' '}
            <SongLinks title={s.title} artist={s.artist} spotifyId={s.spotifyId} />
            <span className="dim small">
              {' · '}
              {s.submitterId ? nameOf.get(s.submitterId) : 'anonymous'} · {s.roundName} ·{' '}
              {n1(s.effectiveNet)} pts
            </span>
          </span>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <Card
        title="Room-uniting songs"
        subtitle="Points arrived from the widest share of voters rather than a devoted few."
      >
        {list(byBreadth, (s) => `${s.distinctUpvoters}/${s.eligibleVoters}`)}
      </Card>
      <Card
        title="Most divisive songs"
        subtitle="Largest variance in points across the voters who could vote on them."
      >
        {list(bySpread, (s) => `±${n2(s.spread)}`)}
      </Card>
    </>
  );
}
