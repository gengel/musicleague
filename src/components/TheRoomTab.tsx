import { useMemo } from 'react';
import type { Stats } from '../lib/stats';
import {
  computeVoterFlows,
  comparePraiseAndBlame,
  computePointsReceived,
  findLopsidedPairs,
} from '../lib/targeting';
import { SuperlativeStrip } from './SuperlativeStrip';
import { AffinityMatrix, PairLeaders } from './AffinityMatrix';
import { SocialGraphPanel } from './SocialGraphPanel';
import { Card } from './ui';

function UpvoteTargetingPanel({ stats }: { stats: Stats }) {
  const flows = useMemo(() => computeVoterFlows(stats), [stats]);
  if (!flows.length) return null;

  return (
    <Card
      title="Where the upvotes go"
      subtitle="Every voter has the same budget per round, and spends all of it. This is where they aimed."
      wide
    >
      <table className="t">
        <thead>
          <tr>
            <th>Voter</th>
            <th className="num">Spent</th>
            <th className="num">Targets</th>
            <th>Top recipient</th>
            <th className="num">Their share</th>
          </tr>
        </thead>
        <tbody>
          {flows.map((f) => {
            const top = f.topUpvoteTargets[0];
            const share = f.upvotesSpent > 0 ? top?.points / f.upvotesSpent : 0;
            return (
              <tr key={f.voterId}>
                <td>
                  <strong>{f.voterName}</strong>
                </td>
                <td className="num">{f.upvotesSpent}</td>
                <td className="num">{f.upvoteTargets}</td>
                <td className="dim">
                  {top ? `${top.targetName} (${top.points})` : '—'}
                </td>
                <td className="num dim">
                  {top ? `${Math.round(share * 100)}%` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function DownvoteTargetingPanel({ stats }: { stats: Stats }) {
  const flows = useMemo(() => computeVoterFlows(stats), [stats]);
  const withDown = flows.filter((f) => f.downvotesSpent > 0);
  if (!withDown.length) return null;

  return (
    <Card
      title="Where the downvotes go"
      subtitle="Downvoting is mandatory — every voter must spend all their downvote points. The question is where they aim."
      wide
    >
      <table className="t">
        <thead>
          <tr>
            <th>Voter</th>
            <th className="num">Spent</th>
            <th className="num">Targets</th>
            <th>Top target</th>
            <th className="num">Their share</th>
          </tr>
        </thead>
        <tbody>
          {withDown.map((f) => {
            const top = f.topDownvoteTargets[0];
            const share = f.downvotesSpent > 0 ? top?.points / f.downvotesSpent : 0;
            return (
              <tr key={f.voterId}>
                <td>
                  <strong>{f.voterName}</strong>
                </td>
                <td className="num">{f.downvotesSpent}</td>
                <td className="num">{f.downvoteTargets}</td>
                <td className="dim">
                  {top ? `${top.targetName} (${top.points})` : '—'}
                </td>
                <td className="num dim">
                  {top ? `${Math.round(share * 100)}%` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function PointsReceivedPanel({ stats }: { stats: Stats }) {
  const received = useMemo(() => computePointsReceived(stats), [stats]);
  if (!received.length) return null;

  return (
    <Card title="Points received" subtitle="Upvotes and downvotes each player's songs attracted." wide>
      <table className="t">
        <thead>
          <tr>
            <th>Player</th>
            <th className="num">↑ Up</th>
            <th className="num">↓ Down</th>
            <th className="num">Net</th>
            <th className="num">Distinct backers</th>
          </tr>
        </thead>
        <tbody>
          {received.map((r) => (
            <tr key={r.playerId}>
              <td>
                <strong>{r.name}</strong>
              </td>
              <td className="num pos">+{r.upvotes}</td>
              <td className="num neg">{r.downvotes > 0 ? `−${r.downvotes}` : '—'}</td>
              <td className={`num ${r.net >= 0 ? 'pos' : 'neg'}`}>
                {r.net > 0 ? '+' : ''}
                {r.net}
              </td>
              <td className="num dim">{r.distinctBackers} of {stats.players.length - 1}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function PraiseBlamePanel({ stats }: { stats: Stats }) {
  const flows = useMemo(() => computeVoterFlows(stats), [stats]);
  const pvb = useMemo(() => comparePraiseAndBlame(flows), [flows]);
  if (!pvb.length) return null;

  return (
    <Card
      title="Praise vs blame"
      subtitle="Does anyone aim their upvotes more narrowly than their downvotes?"
      wide
    >
      <table className="t">
        <thead>
          <tr>
            <th>Voter</th>
            <th className="num">Praise focus</th>
            <th className="num">Blame focus</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {pvb.map((p) => (
            <tr key={p.voterId}>
              <td>
                <strong>{p.voterName}</strong>
              </td>
              <td className="num">{Math.round(p.upvoteConcentration * 100)}%</td>
              <td className="num">{Math.round(p.downvoteConcentration * 100)}%</td>
              <td>
                {p.concentratesBlameMore ? (
                  <span className="tag tag--neg">focuses blame</span>
                ) : p.upvoteConcentration > p.downvoteConcentration * 1.2 ? (
                  <span className="tag tag--pos">focuses praise</span>
                ) : (
                  <span className="dim small">even-handed</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function LopsidedPairPanel({ stats }: { stats: Stats }) {
  const pairs = useMemo(() => findLopsidedPairs(stats, 5), [stats]);
  const top = pairs[0];
  if (!top) return null;

  const forward = stats.pairs.find(
    (p) => p.voterId === top.aId && p.targetId === top.bId,
  );
  const reverse = stats.pairs.find(
    (p) => p.voterId === top.bId && p.targetId === top.aId,
  );

  return (
    <Card title="Most lopsided relationship" wide>
      <div className="lopsided">
        <div>
          <strong>
            {top.aName} → {top.bName}:
          </strong>{' '}
          {top.aToB} upvote pt{top.aToB === 1 ? '' : 's'}
          {forward?.downvotes ? `, ${forward.downvotes} downvote pts` : ''}
        </div>
        <div>
          <strong>
            {top.bName} → {top.aName}:
          </strong>{' '}
          {top.bToA > 0 ? `${top.bToA} pt${top.bToA === 1 ? '' : 's'}` : 'nothing'}
          {reverse?.downvotes ? `, ${reverse.downvotes} downvote pts` : ''}
        </div>
        <p className="dim small" style={{ marginTop: 8 }}>
          Imbalance: {top.imbalance} pts. Same edge on the graph, read from both ends.
        </p>
      </div>
    </Card>
  );
}

export function TheRoomTab({ stats }: { stats: Stats }) {
  const hasDownvotes = stats.rounds.some((r) => r.totalDownvotes > 0);

  return (
    <>
      <SuperlativeStrip
        stats={stats}
        labels={[
          'Biggest superfan',
          'Mutual admiration society',
          'Most unrequited',
          'Arch-nemesis',
        ]}
      />
      <SuperlativeStrip
        stats={stats}
        labels={[
          'Most points given (raw)',
          'Coldest shoulder',
        ]}
      />

      <SocialGraphPanel stats={stats} />
      <UpvoteTargetingPanel stats={stats} />
      <PointsReceivedPanel stats={stats} />
      {hasDownvotes && <PraiseBlamePanel stats={stats} />}
      <LopsidedPairPanel stats={stats} />
      {hasDownvotes && <DownvoteTargetingPanel stats={stats} />}
      <PairLeaders stats={stats} />
      <AffinityMatrix stats={stats} />
    </>
  );
}
