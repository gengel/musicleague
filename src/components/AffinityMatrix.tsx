import { useMemo, useState } from 'react';
import type { PairStats, Stats } from '../lib/stats';
import { affinityColor, Card, Empty, n1, n2, pct0, SortableTable, type Column } from './ui';

type Metric = 'affinity' | 'devotion' | 'upvotes' | 'downvotes' | 'perRound';

const METRICS: { key: Metric; label: string; hint: string }[] = [
  {
    key: 'affinity',
    label: 'Affinity',
    hint: 'Points given divided by what an even spread of their ballot would predict. 1.00 is neutral, 2.00 is double their fair share, 0.00 means never once.',
  },
  {
    key: 'devotion',
    label: 'Devotion',
    hint: 'Points given as a share of the most the rules allowed. 100% means they maxed out on that player every time they could.',
  },
  {
    key: 'upvotes',
    label: 'Total points',
    hint: 'Raw upvote points given. Favours pairs who shared the most rounds.',
  },
  {
    key: 'perRound',
    label: 'Points per shared round',
    hint: 'Upvote points given, divided by rounds where both took part.',
  },
  {
    key: 'downvotes',
    label: 'Downvotes',
    hint: 'Downvote points spent on the other player. Empty if your league has downvotes off.',
  },
];

const valueOf = (pair: PairStats | undefined, metric: Metric): number => {
  if (!pair) return 0;
  switch (metric) {
    case 'affinity':
      return pair.affinity;
    case 'devotion':
      return pair.devotion;
    case 'upvotes':
      return pair.upvotes;
    case 'downvotes':
      return pair.downvotes;
    case 'perRound':
      return pair.opportunities ? pair.upvotes / pair.opportunities : 0;
  }
};

/**
 * Voter (row) against submitter (column). The affinity view is the
 * defensible one — raw totals mostly measure who overlapped the most.
 */
export function AffinityMatrix({ stats }: { stats: Stats }) {
  const [metric, setMetric] = useState<Metric>('affinity');

  const players = useMemo(
    () => [...stats.players].filter((p) => p.roundsVoted > 0 || p.songs > 0),
    [stats.players],
  );

  const index = useMemo(() => {
    const map = new Map<string, PairStats>();
    for (const p of stats.pairs) map.set(`${p.voterId}\u0000${p.targetId}`, p);
    return map;
  }, [stats.pairs]);

  const active = METRICS.find((m) => m.key === metric)!;

  const maxima = useMemo(() => {
    const values = stats.pairs.map((p) => valueOf(p, metric));
    return Math.max(1, ...values);
  }, [stats.pairs, metric]);

  if (!stats.hasVotes) {
    return (
      <Card title="Who votes for whom">
        <Empty>
          This export contains no vote rows, so per-voter analysis is not possible. Either the
          league hides its vote breakdown or no round has finished voting.
        </Empty>
      </Card>
    );
  }

  const cellStyle = (pair: PairStats | undefined) => {
    const v = valueOf(pair, metric);
    if (!pair || pair.opportunities === 0) return { background: 'transparent' };
    if (metric === 'affinity') return { background: affinityColor(v, true) };
    const t = Math.min(1, v / maxima);
    const hue = metric === 'downvotes' ? 8 : 320;
    return {
      background: t === 0 ? '#1b1b22' : `hsl(${hue} ${Math.round(35 + t * 55)}% ${Math.round(56 - t * 26)}%)`,
    };
  };

  const cellText = (pair: PairStats | undefined) => {
    if (!pair || pair.opportunities === 0) return '·';
    const v = valueOf(pair, metric);
    if (metric === 'affinity') return v === 0 ? '0' : n2(v);
    if (metric === 'devotion') return pct0(v);
    if (metric === 'downvotes') return v === 0 ? '' : `−${n1(v)}`;
    return v === 0 ? '' : n1(v);
  };

  return (
    <Card title="Who votes for whom" subtitle={active.hint} wide>
      <div className="seg">
        {METRICS.map((m) => (
          <button
            key={m.key}
            className={metric === m.key ? 'seg__btn seg__btn--on' : 'seg__btn'}
            onClick={() => setMetric(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th className="matrix__corner">
                voter <span>↓</span> / got votes <span>→</span>
              </th>
              {players.map((p) => (
                <th key={p.playerId} className="matrix__colhead">
                  <span>{p.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((voter) => (
              <tr key={voter.playerId}>
                <th className="matrix__rowhead">{voter.name}</th>
                {players.map((target) => {
                  if (voter.playerId === target.playerId) {
                    return <td key={target.playerId} className="matrix__self" title="Nobody can vote for their own song" />;
                  }
                  const pair = index.get(`${voter.playerId}\u0000${target.playerId}`);
                  return (
                    <td
                      key={target.playerId}
                      className="matrix__cell"
                      style={cellStyle(pair)}
                      title={
                        pair && pair.opportunities > 0
                          ? `${voter.name} → ${target.name}\n` +
                            `${n1(pair.upvotes)} of a possible ${n1(pair.maxPossible)} upvote pts (${pct0(pair.devotion)})${pair.downvotes ? `, ${n1(pair.downvotes)} downvote pts` : ''}\n` +
                            `an even spread would have given ${n1(pair.expected)} → affinity ${n2(pair.affinity)}\n` +
                            `backed ${pair.songsBacked} of ${pair.songsAvailable} songs across ${pair.opportunities} shared rounds`
                          : `${voter.name} never had a chance to vote on ${target.name}'s songs`
                      }
                    >
                      {cellText(pair)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legend-row">
        {metric === 'affinity' ? (
          <>
            <span className="swatch" style={{ background: affinityColor(0, true) }} /> never
            <span className="swatch" style={{ background: affinityColor(0.6, true) }} /> under
            <span className="swatch" style={{ background: affinityColor(1, true) }} /> even
            <span className="swatch" style={{ background: affinityColor(1.6, true) }} /> favoured
            <span className="swatch" style={{ background: affinityColor(2.4, true) }} /> devoted
          </>
        ) : (
          <span className="note">Darker means fewer points, brighter means more.</span>
        )}
      </div>
    </Card>
  );
}

/** Ranked pair lists — the direct answer to "who votes for whom the most". */
export function PairLeaders({ stats }: { stats: Stats }) {
  const meaningful = useMemo(
    () => stats.pairs.filter((p) => p.opportunities >= 2 && p.songsAvailable >= 2),
    [stats.pairs],
  );

  const columns: Column<PairStats>[] = [
    {
      key: 'pair',
      label: 'Voter → Submitter',
      value: (p) => `${p.voterName} → ${p.targetName}`,
      render: (p) => (
        <span className="nowrap">
          <strong>{p.voterName}</strong> <span className="dim">→</span> {p.targetName}
        </span>
      ),
    },
    { key: 'up', label: 'Points', value: (p) => p.upvotes, render: (p) => n1(p.upvotes), align: 'right' },
    {
      key: 'devotion',
      label: 'Devotion',
      title:
        'Points given as a share of the most the rules allowed them to give. 100% means they maxed out on this player every single time.',
      value: (p) => p.devotion,
      render: (p) => (
        <span className={p.devotion >= 0.6 ? 'pos' : p.devotion <= 0.1 ? 'neg' : undefined}>
          {pct0(p.devotion)}
        </span>
      ),
      align: 'right',
    },
    {
      key: 'affinity',
      label: 'Affinity',
      title: 'Points given ÷ points an even spread of their ballot would predict. 1.00 is a fair share.',
      value: (p) => p.affinity,
      render: (p) => (
        <span className={p.affinity >= 1.35 ? 'pos' : p.affinity <= 0.65 ? 'neg' : undefined}>
          {n2(p.affinity)}×
        </span>
      ),
      align: 'right',
    },
    {
      key: 'backed',
      label: 'Songs backed',
      title: 'Songs of theirs the voter gave any points to, out of songs available',
      value: (p) => (p.songsAvailable ? p.songsBacked / p.songsAvailable : 0),
      render: (p) => `${p.songsBacked}/${p.songsAvailable}`,
      align: 'right',
    },
    { key: 'rounds', label: 'Shared rounds', value: (p) => p.opportunities, align: 'right' },
    {
      key: 'down',
      label: 'Downvotes',
      value: (p) => p.downvotes,
      render: (p) => (p.downvotes ? <span className="neg">−{n1(p.downvotes)}</span> : '—'),
      align: 'right',
    },
  ];

  if (!stats.hasVotes) return null;

  // Ranked on devotion rather than affinity: affinity's ceiling depends on
  // ballot size, so it would rank a two-round maximiser above a season-long
  // one. Ties go to whoever gave more points.
  const fans = [...meaningful]
    .sort((a, b) => b.devotion - a.devotion || b.upvotes - a.upvotes)
    .slice(0, 10);
  const frost = [...meaningful]
    .sort((a, b) => a.devotion - b.devotion || b.songsAvailable - a.songsAvailable)
    .slice(0, 10);

  return (
    <>
      <Card
        title="Biggest superfans"
        subtitle="Ranked by devotion — the share of the maximum they were allowed to give. That keeps someone who played two rounds from outranking a season-long loyalist."
      >
        <SortableTable columns={columns} rows={fans} initialSort="devotion" rowKey={(p) => `${p.voterId}-${p.targetId}`} />
      </Card>

      <Card
        title="Coldest shoulders"
        subtitle="Voters who had plenty of chances and passed anyway."
      >
        <SortableTable
          columns={columns}
          rows={frost}
          initialSort="devotion"
          initialAsc
          rowKey={(p) => `${p.voterId}-${p.targetId}`}
          highlight={(p) => p.upvotes === 0}
        />
        <p className="note">Highlighted rows never gave the other player a single point.</p>
      </Card>
    </>
  );
}
