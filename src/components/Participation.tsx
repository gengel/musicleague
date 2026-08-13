import type { PlayerStats, Stats } from '../lib/stats';
import { Card, Empty, n1, pct0, SortableTable, StatTile, type Column } from './ui';

/**
 * Participation and the real cost of not voting.
 *
 * Music League levies no point penalty for skipping a vote. In Competitive
 * Mode a non-voter instead forfeits every upvote their own song earned that
 * round (downvotes still land), so the honest measure of "penalised" is the
 * points they earned and never received.
 */
export function Participation({ stats }: { stats: Stats }) {
  const players = stats.players.filter((p) => p.roundsSubmitted > 0 || p.roundsVoted > 0);

  const totalForfeited = players.reduce((a, p) => a + p.forfeitedUpvotes, 0);
  const totalMissed = players.reduce((a, p) => a + p.roundsMissedVoting, 0);
  const perfect = players.filter((p) => p.roundsSubmitted > 0 && p.roundsMissedVoting === 0);

  const columns: Column<PlayerStats>[] = [
    {
      key: 'name',
      label: 'Player',
      value: (p) => p.name,
      render: (p) => <strong className="nowrap">{p.name}</strong>,
    },
    {
      key: 'forfeited',
      label: 'Points forfeited',
      title: 'Upvotes their songs earned in rounds where they never voted',
      value: (p) => p.forfeitedUpvotes,
      render: (p) =>
        p.forfeitedUpvotes > 0 ? <span className="neg">−{n1(p.forfeitedUpvotes)}</span> : '—',
      align: 'right',
    },
    {
      key: 'missed',
      label: 'Rounds not voted',
      title: 'Rounds where they submitted a song but cast no votes',
      value: (p) => p.roundsMissedVoting,
      align: 'right',
    },
    { key: 'submitted', label: 'Rounds submitted', value: (p) => p.roundsSubmitted, align: 'right' },
    { key: 'voted', label: 'Rounds voted', value: (p) => p.roundsVoted, align: 'right' },
    {
      key: 'rate',
      label: 'Vote rate',
      value: (p) => (p.roundsSubmitted ? p.roundsVoted / p.roundsSubmitted : 1),
      render: (p) => pct0(p.roundsSubmitted ? Math.min(1, p.roundsVoted / p.roundsSubmitted) : 1),
      align: 'right',
    },
    {
      key: 'wouldHave',
      label: 'Score without forfeit',
      title: 'Their total if the forfeited upvotes had counted',
      value: (p) => p.pointsCounted + p.forfeitedUpvotes,
      render: (p) =>
        p.forfeitedUpvotes > 0 ? (
          <span className="nowrap">
            <strong>{n1(p.pointsCounted)}</strong>{' '}
            <span className="dim">→ {n1(p.pointsCounted + p.forfeitedUpvotes)}</span>
          </span>
        ) : (
          <strong>{n1(p.pointsCounted)}</strong>
        ),
      align: 'right',
    },
  ];

  return (
    <>
      <Card
        title="The cost of not voting"
        subtitle="Music League has no point penalty for skipping a vote. In Competitive Mode a non-voter forfeits every upvote their song earned that round instead — that is the number below."
        wide
      >
        <div className="tiles">
          <StatTile label="Points forfeited league-wide" value={n1(totalForfeited)} hint="upvotes earned but never credited" />
          <StatTile label="Rounds skipped" value={totalMissed} hint="submitted but never voted" />
          <StatTile
            label="Perfect attendance"
            value={`${perfect.length}/${players.filter((p) => p.roundsSubmitted > 0).length}`}
            hint="voted in every round they entered"
          />
        </div>
        {totalMissed === 0 ? (
          <Empty>Everybody voted in every round they entered. Well-behaved league.</Empty>
        ) : (
          <SortableTable
            columns={columns}
            rows={players}
            initialSort="forfeited"
            rowKey={(p) => p.playerId}
            highlight={(p) => p.forfeitedUpvotes > 0}
          />
        )}
        <p className="note">
          If your league is not in Competitive Mode, nothing was actually deducted — read the
          forfeit column as what non-voting would have cost.
        </p>
      </Card>
    </>
  );
}
