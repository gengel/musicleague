import { useMemo } from 'react';
import { embeddedGenres } from 'virtual:league-data';
import type { Stats } from '../lib/stats';
import { genreHighlights, genreReport, MIN_SAMPLE, type GenreStat } from '../lib/genres';
import { Card, Empty, n1, pct0, SortableTable, type Column } from './ui';

/**
 * Genre analysis.
 *
 * Presented with more hedging than the rest of the dashboard, for two honest
 * reasons: genre is resolved from artist names by a third party rather than
 * being in the export, and a league of this size leaves only a few songs per
 * genre. Rows below the minimum sample are shown but carry no verdict.
 */
export function GenrePanel({ stats }: { stats: Stats }) {
  const report = useMemo(() => genreReport(stats, embeddedGenres), [stats]);
  const highlights = useMemo(() => genreHighlights(report), [report]);

  if (!report.stats.length) {
    return (
      <Card title="Genres">
        <Empty>
          No genre data. The Music League export does not carry genres, so they have to be
          looked up: rebuild with <code>--genres</code> to resolve them from artist names.
        </Empty>
      </Card>
    );
  }

  const reliable = report.stats.filter((g) => g.reliable);
  // Below the sample threshold a genre is noise, so it is left out rather than
  // shown with a caveat. If nothing clears the bar the table would be empty,
  // which is worse than a hedged one, so everything is shown instead.
  const trimmed = reliable.length ? report.stats.length - reliable.length : 0;
  const rows = reliable.length ? reliable : report.stats;

  const columns: Column<GenreStat>[] = [
    {
      key: 'genre',
      label: 'Genre',
      value: (g) => g.genre,
      render: (g) => (
        <span className="nowrap">
          <strong>{g.genre}</strong>
          {!g.reliable && (
            <span className="dim small" title={`Fewer than ${MIN_SAMPLE} songs — too few to judge`}>
              {' '}
              thin
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'songs',
      label: 'Songs',
      value: (g) => g.songs,
      render: (g) => (
        <>
          {g.songs} <span className="dim">{pct0(g.share)}</span>
        </>
      ),
      align: 'right',
    },
    {
      key: 'avg',
      label: 'Points per song',
      title: 'Mean counted score for songs in this genre',
      value: (g) => g.avgScore,
      render: (g) => (
        <strong className={g.avgScore < 0 ? 'neg' : undefined}>{n1(g.avgScore)}</strong>
      ),
      align: 'right',
    },
    {
      key: 'delta',
      label: 'vs league',
      title: 'Points per song above or below the average across all tagged songs',
      value: (g) => g.delta,
      render: (g) =>
        g.reliable ? (
          <span className={g.delta > 0.2 ? 'pos' : g.delta < -0.2 ? 'neg' : undefined}>
            {g.delta > 0 ? '+' : ''}
            {n1(g.delta)}
          </span>
        ) : (
          <span className="dim">—</span>
        ),
      align: 'right',
    },
    {
      key: 'up',
      label: 'Upvotes/song',
      value: (g) => g.avgUpvotes,
      render: (g) => <span className="pos">+{n1(g.avgUpvotes)}</span>,
      align: 'right',
    },
    {
      key: 'down',
      label: 'Downvotes/song',
      value: (g) => g.avgDownvotes,
      render: (g) =>
        g.avgDownvotes > 0 ? <span className="neg">−{n1(g.avgDownvotes)}</span> : <span className="dim">—</span>,
      align: 'right',
    },
    { key: 'wins', label: 'Round wins', value: (g) => g.wins, align: 'right' },
    {
      key: 'submitters',
      label: 'Submitters',
      title: 'Distinct players who submitted a song in this genre',
      value: (g) => g.submitters,
      align: 'right',
    },
  ];

  return (
    <>
      <Card
        title="Genres"
        subtitle={`Resolved from artist names, not from the export. ${report.tagged} songs tagged${
          report.untagged ? `, ${report.untagged} without a genre` : ''
        }. League average is ${n1(report.baseline)} points a song.`}
        wide
      >
        {highlights.length > 0 ? (
          <ul className="highlights">
            {highlights.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="note">
            Too few songs per genre to say which does better — the table is below, but treat any
            ordering as noise.
          </p>
        )}

        <SortableTable columns={columns} rows={rows} initialSort="songs" rowKey={(g) => g.genre} />

        <p className="note">
          Shares are of all {report.total} songs. A song counts once for each genre its artists
          carry, so the column sums to more than the {report.tagged} that could be tagged.{' '}
          {trimmed > 0 && (
            <>
              {trimmed} {trimmed === 1 ? 'genre' : 'genres'} with fewer than {MIN_SAMPLE} songs{' '}
              {trimmed === 1 ? 'is' : 'are'} left out: one lucky round would decide the ranking.{' '}
            </>
          )}
          Tags come from MusicBrainz and are crowd-sourced, so they are indicative rather than
          authoritative.
        </p>
      </Card>

      {report.missingArtists.length > 0 && (
        <Card
          title="Artists with no genre"
          subtitle="Left out of the table above rather than guessed at."
        >
          <p className="dim small">{report.missingArtists.join(' · ')}</p>
        </Card>
      )}
    </>
  );
}
