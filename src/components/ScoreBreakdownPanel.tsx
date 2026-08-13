import { useMemo } from 'react';
import type { PlayerStats, Stats } from '../lib/stats';
import {
  Card,
  divergingScale,
  n1,
  ScoreBar,
  scoreBarSegments,
  SortableTable,
  type Column,
} from './ui';

/**
 * The score so far, shown as the sum of its parts.
 *
 * A bare "points" number invites the question of where it came from, and with
 * downvotes and Competitive Mode forfeits in play the answer is not obvious.
 * Every column here is a term in one identity:
 *
 *   upvotes − downvotes − forfeited + floored = total
 */
export function ScoreBreakdownPanel({ stats }: { stats: Stats }) {
  const rows = useMemo(
    () => stats.players.filter((p) => p.songs > 0),
    [stats.players],
  );

  const barScale = useMemo(() => divergingScale(rows.map((p) => p.breakdown)), [rows]);

  const anyDownvotes = rows.some((p) => p.breakdown.downvotes > 0);
  const anyForfeits = rows.some((p) => p.breakdown.forfeited > 0);
  const anyAbsorbed = rows.some((p) => p.breakdown.absorbed > 0);
  const anyBelowZero = rows.some((p) => p.breakdown.total < 0);

  const columns: Column<PlayerStats>[] = [
    {
      key: 'name',
      label: 'Player',
      value: (p) => p.name,
      render: (p) => <strong className="nowrap">{p.name}</strong>,
    },
    {
      key: 'bar',
      label: anyBelowZero ? 'Above / below zero' : 'Score',
      title:
        'Solid bar is the score the league counted. The dashed outline is what they earned in upvotes before downvotes and forfeits were taken off.',
      value: (p) => p.breakdown.total,
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
              `total ${n1(p.breakdown.total)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        );
      },
    },
    {
      key: 'up',
      label: 'Upvotes',
      title: 'Upvote points their songs received',
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
            label: 'Forfeited',
            title: 'Upvotes withheld because they did not vote that round',
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
            label: 'Floored',
            title:
              'Downvotes that never landed: a song cannot score below zero, so the surplus is discarded',
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
    {
      key: 'total',
      label: 'Total score',
      title: 'What the league has counted',
      value: (p) => p.breakdown.total,
      render: (p) => (
        <strong className={p.breakdown.total < 0 ? 'neg' : undefined}>
          {n1(p.breakdown.total)}
        </strong>
      ),
      align: 'right',
    },
    {
      key: 'songs',
      label: 'Songs',
      value: (p) => p.songs,
      align: 'right',
    },
  ];

  const league = rows.reduce(
    (acc, p) => ({
      upvotes: acc.upvotes + p.breakdown.upvotes,
      downvotes: acc.downvotes + p.breakdown.downvotes,
      forfeited: acc.forfeited + p.breakdown.forfeited,
      absorbed: acc.absorbed + p.breakdown.absorbed,
      total: acc.total + p.breakdown.total,
    }),
    { upvotes: 0, downvotes: 0, forfeited: 0, absorbed: 0, total: 0 },
  );
  // Signed totals cancel out, so the sum of the column can be smaller than a
  // single player's score. Report the positive side separately to say so.
  const positive = rows.reduce((a, p) => a + Math.max(0, p.breakdown.total), 0);
  const belowCount = rows.filter((p) => p.breakdown.total < 0).length;

  return (
    <Card
      title="How the scores add up"
      subtitle={
        anyForfeits
          ? 'Upvotes received, minus downvotes, minus the upvotes forfeited by not voting. The parts reconcile to the total exactly.'
          : 'Upvotes received, minus downvotes. The parts reconcile to the total exactly.'
      }
      wide
    >
      <SortableTable columns={columns} rows={rows} initialSort="total" rowKey={(p) => p.playerId} />

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
      </div>

      <p className="note">
        Across the league: {n1(league.upvotes)} upvote points cast
        {league.downvotes > 0 && <>, {n1(league.downvotes)} downvote points</>}
        {league.forfeited > 0 && <>, {n1(league.forfeited)} forfeited</>}
        {league.absorbed > 0 && <>, {n1(league.absorbed)} discarded by the zero floor</>}.
        {positive !== league.total ? (
          <>
            {' '}
            Positive scores add up to {n1(positive)}; the column above sums to {n1(league.total)}{' '}
            because {belowCount} {belowCount === 1 ? 'player is' : 'players are'} below zero.
          </>
        ) : (
          <> That leaves {n1(league.total)} on the board.</>
        )}
      </p>
    </Card>
  );
}
