import { useMemo } from 'react';
import type { PlayerStats, Stats } from '../lib/stats';
import { SuperlativeStrip } from './SuperlativeStrip';
import { ScoreTimeline } from './ScoreTimeline';
import { RacePredictionPanel } from './RacePredictionPanel';
import { ThemeChip } from './ThemeChip';
import { InfoTip } from './InfoTip';
import {
  Card,
  divergingScale,
  n1,
  ScoreBar,
  scoreBarSegments,
  SortableTable,
  type Column,
} from './ui';
import { playerSlug } from '../lib/playerProfile';

/**
 * The standings, as one table.
 *
 * This was two panels — a "Where it stands" ranking and a separate "How the
 * scores add up" breakdown — which ranked the same players by the same number
 * and invited the reader to reconcile them by eye. They are now one table whose
 * columns are the terms of a single identity, ending in the score:
 *
 *   upvotes − downvotes − forfeited + floored + theme = score
 *
 * Every term column is dropped when it is zero for everyone, so a plain
 * friendly league without downvotes still shows just upvotes and a score.
 */
export function TheRaceTab({
  stats,
  onOpenPlayer,
}: {
  stats: Stats;
  onOpenPlayer?: (slug: string) => void;
}) {
  const rows = useMemo(
    () => stats.players.filter((p) => p.songs > 0 || p.roundsVoted > 0),
    [stats.players],
  );

  /** Standings position, so the rank survives sorting by another column. */
  const rankOf = useMemo(() => {
    const byScore = [...rows].sort((a, b) => b.pointsCounted - a.pointsCounted);
    return new Map(byScore.map((p, i) => [p.playerId, i + 1]));
  }, [rows]);

  const barScale = useMemo(() => divergingScale(rows.map((p) => p.breakdown)), [rows]);

  const anyDownvotes = rows.some((p) => p.breakdown.downvotes > 0);
  const anyForfeits = rows.some((p) => p.breakdown.forfeited > 0);
  const anyAbsorbed = rows.some((p) => p.breakdown.absorbed > 0);
  const anyTheme = rows.some((p) => p.breakdown.theme !== 0);
  const anyBelowZero = rows.some((p) => p.breakdown.total < 0);
  const hasMultipleRounds = stats.roundsPlayed > 1;

  const themeReason = new Map(stats.themeOutcomes.map((o) => [o.playerId, o.reason]));

  const columns: Column<PlayerStats>[] = [
    {
      key: 'rank',
      label: '#',
      value: (p) => rankOf.get(p.playerId) ?? 0,
      render: (p) => <span className="dim">{rankOf.get(p.playerId)}</span>,
    },
    {
      key: 'name',
      label: 'Player',
      value: (p) => p.name,
      render: (p) => (
        <span className="nowrap">
          {onOpenPlayer ? (
            <button className="linklike" onClick={() => onOpenPlayer(playerSlug(p.name))}>
              <strong>{p.name}</strong>
            </button>
          ) : (
            <strong>{p.name}</strong>
          )}
          {/* Beside the name rather than in a column, so it survives both the
              one-round column hiding and the phone column hiding. */}
          {stats.roundsPlayed > 0 && p.roundsVoted === 0 && (
            <span className="tag tag--neg race-flag">didn't vote</span>
          )}
        </span>
      ),
    },
    {
      key: 'bar',
      label: anyBelowZero ? 'Above / below zero' : 'Earned vs counted',
      title:
        'Solid bar is the score the league counted. The dashed outline is what they earned in upvotes before downvotes and forfeits were taken off.',
      value: (p) => p.breakdown.total,
      className: 'col-secondary',
      render: (p) => {
        const parts = scoreBarSegments(p.breakdown);
        return (
          <ScoreBar
            breakdown={p.breakdown}
            scale={barScale}
            label={[
              `earned ${n1(p.breakdown.upvotes)}`,
              parts.forfeited > 0 ? `forfeited ${n1(parts.forfeited)}` : '',
              parts.cancelled > 0 ? `${n1(parts.cancelled)} cancelled by downvotes` : '',
              parts.belowZero > 0 ? `${n1(parts.belowZero)} below zero` : '',
              parts.theme !== 0 ? `${parts.theme > 0 ? '+' : ''}${n1(parts.theme)} theme bonus` : '',
              `total ${n1(p.breakdown.total)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        );
      },
    },
    {
      key: 'songs',
      label: 'Songs',
      value: (p) => p.songs,
      align: 'right',
      className: 'col-secondary',
    },
    ...(hasMultipleRounds
      ? [
          {
            key: 'persong',
            label: 'Per song',
            value: (p: PlayerStats) => p.avgPerSong,
            render: (p: PlayerStats) => (
              <span className="dim">{p.songs > 0 ? p.avgPerSong.toFixed(1) : '—'}</span>
            ),
            align: 'right' as const,
            className: 'col-secondary',
          },
          {
            key: 'bestround',
            label: 'Best round',
            value: (p: PlayerStats) => p.bestSong?.effectiveNet ?? 0,
            render: (p: PlayerStats) => {
              const best = p.bestSong?.effectiveNet ?? 0;
              return <span className="dim">{best > 0 ? `+${best}` : best || '—'}</span>;
            },
            align: 'right' as const,
            className: 'col-secondary',
          },
          {
            key: 'roundsvoted',
            label: 'Rounds voted',
            value: (p: PlayerStats) => p.roundsVoted,
            render: (p: PlayerStats) => (
              <span className="dim">
                {p.roundsVoted ? `${p.roundsVoted} of ${stats.roundsPlayed}` : '—'}
              </span>
            ),
            align: 'right' as const,
            className: 'col-secondary',
          },
        ]
      : []),
    {
      key: 'up',
      label: (
        <span className="th-tip">
          Upvotes
          <InfoTip label="What the upvotes column counts">
            Upvote points their own songs received from the room, before any of the league's
            adjustments to the right.
          </InfoTip>
        </span>
      ),
      value: (p) => p.breakdown.upvotes,
      render: (p) => <span className="pos">+{n1(p.breakdown.upvotes)}</span>,
      align: 'right',
    },
    ...(anyDownvotes
      ? [
          {
            key: 'down',
            label: 'Downvotes',
            title: 'Downvote points their songs received',
            value: (p: PlayerStats) => p.breakdown.downvotes,
            render: (p: PlayerStats) =>
              p.breakdown.downvotes ? (
                <span className="neg">−{n1(p.breakdown.downvotes)}</span>
              ) : (
                <span className="dim">—</span>
              ),
            align: 'right' as const,
          },
        ]
      : []),
    ...(anyForfeits
      ? [
          {
            key: 'forfeit',
            label: (
              <span className="th-tip">
                Forfeited
                <InfoTip label="How points are forfeited">
                  This league is in Competitive Mode: a player who skips voting in a round receives
                  none of the upvotes their own song earned that round, while still taking any
                  downvotes. Music League applies no separate penalty — this is the real cost of
                  not voting.
                </InfoTip>
              </span>
            ),
            value: (p: PlayerStats) => p.breakdown.forfeited,
            render: (p: PlayerStats) =>
              p.breakdown.forfeited ? (
                <span className="neg">−{n1(p.breakdown.forfeited)}</span>
              ) : (
                <span className="dim">—</span>
              ),
            align: 'right' as const,
          },
        ]
      : []),
    ...(anyAbsorbed
      ? [
          {
            key: 'absorbed',
            label: (
              <span className="th-tip">
                Floored
                <InfoTip label="Downvotes the floor absorbed">
                  The part of their downvotes that never landed, because a song cannot score below
                  zero. Always zero in a league without flooring.
                </InfoTip>
              </span>
            ),
            value: (p: PlayerStats) => p.breakdown.absorbed,
            render: (p: PlayerStats) =>
              p.breakdown.absorbed ? (
                <span className="dim">+{n1(p.breakdown.absorbed)}</span>
              ) : (
                <span className="dim">—</span>
              ),
            align: 'right' as const,
          },
        ]
      : []),
    ...(anyTheme
      ? [
          {
            key: 'theme',
            label: 'Theme',
            title:
              'Themed-round bonus: +3 for winning your own round, −3 otherwise. Applied by this page, not by Music League.',
            value: (p: PlayerStats) => p.breakdown.theme,
            render: (p: PlayerStats) => (
              <ThemeChip points={p.breakdown.theme} reason={themeReason.get(p.playerId)} compact />
            ),
            align: 'right' as const,
          },
        ]
      : []),
    {
      key: 'total',
      label: 'Score',
      title: 'What the league has counted: the columns to the left, added up',
      value: (p) => p.breakdown.total,
      render: (p) => (
        <strong className={p.breakdown.total < 0 ? 'neg' : 'pos'}>
          {p.breakdown.total > 0 ? '+' : ''}
          {n1(p.breakdown.total)}
        </strong>
      ),
      align: 'right',
      className: 'standings-score',
    },
  ];

  const league = rows.reduce(
    (acc, p) => ({
      upvotes: acc.upvotes + p.breakdown.upvotes,
      downvotes: acc.downvotes + p.breakdown.downvotes,
      forfeited: acc.forfeited + p.breakdown.forfeited,
      absorbed: acc.absorbed + p.breakdown.absorbed,
    }),
    { upvotes: 0, downvotes: 0, forfeited: 0, absorbed: 0 },
  );

  return (
    <>
      {anyTheme && (
        <p className="theme-banner">
          <strong>This league adds a theme bonus.</strong> Each round is themed around one player;
          that player gets <span className="pos">+3</span> for winning their own round and{' '}
          <span className="neg">−3</span> for anything else, including not submitting. Music League
          doesn't apply this — this page does — so it is shown separately wherever a total appears.
        </p>
      )}
      {/* The forfeit/skip superlatives moved into "What can still happen"
          above; this strip keeps the two that are about the room's taste. */}
      <SuperlativeStrip stats={stats} labels={['Broadest support base', 'Most polarizing act']} />

      <Card
        title="Where it stands"
        subtitle="Every column left of the score is a term in it, so the total is checkable. Click a header to sort."
        wide
      >
        <SortableTable
          columns={columns}
          rows={rows}
          initialSort="total"
          rowKey={(p) => p.playerId}
        />

        <div className="legend-key">
          <span className="k">
            <i style={{ background: 'var(--pos)' }} /> counted, above zero
          </span>
          {anyBelowZero && (
            <span className="k">
              <i style={{ background: 'var(--neg)' }} /> below zero
            </span>
          )}
          <span className="k">
            <i style={{ border: '1px dashed #4d4d59', background: 'transparent' }} /> earned in
            upvotes, before downvotes{anyForfeits ? ' and forfeits' : ''}
          </span>
          {anyTheme && (
            <span className="k">
              <i style={{ background: 'var(--theme)' }} /> ±3 themed-round bonus
            </span>
          )}
        </div>

        <p className="note">
          Across the league: {n1(league.upvotes)} upvote points cast
          {league.downvotes > 0 && <>, {n1(league.downvotes)} downvote points</>}
          {league.forfeited > 0 && <>, {n1(league.forfeited)} forfeited</>}
          {league.absorbed > 0 && <>, {n1(league.absorbed)} discarded by the zero floor</>}.
        </p>
      </Card>

      <RacePredictionPanel stats={stats} />
      <ScoreTimeline stats={stats} />
    </>
  );
}
