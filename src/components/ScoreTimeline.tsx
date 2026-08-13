import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Stats } from '../lib/stats';
import { Card, Empty, playerColor, sortByRankOrder } from './ui';

type Mode = 'cumulative' | 'rank' | 'perRound';

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: 'cumulative', label: 'Running score', hint: 'Points accumulated after each round.' },
  { key: 'rank', label: 'League position', hint: 'Standings place after each round. Lower is better.' },
  { key: 'perRound', label: 'Points per round', hint: 'Points earned in each individual round.' },
];

export interface SeriesEntry {
  name: string;
  color: string;
}

/**
 * Tooltip listing players in standings order.
 *
 * Recharts hands its payload over in series-key order, which comes out
 * alphabetical, so the entries are re-sorted against the leaderboard. Exported
 * so the ordering can be tested without driving a chart hover.
 */
export function TimelineTooltip({
  active,
  payload,
  label,
  mode,
  rankOrder,
  roundNameOf,
}: {
  active?: boolean;
  payload?: { name?: string | number; value?: number | string; color?: string }[];
  label?: string | number;
  mode: Mode;
  rankOrder: Map<string, number>;
  roundNameOf: (round: string | number | undefined) => string | undefined;
}) {
  if (!active || !payload?.length) return null;
  const entries = sortByRankOrder(payload, (e) => String(e.name), rankOrder);
  const roundName = roundNameOf(label);

  return (
    <div className="tip">
      <div className="tip__head">
        Round {label}
        {roundName ? ` — ${roundName}` : ''}
      </div>
      <ol className="tip__list">
        {entries.map((entry) => (
          <li key={String(entry.name)}>
            <span className="tip__swatch" style={{ background: entry.color }} />
            <span className="tip__name">{String(entry.name)}</span>
            <span className="tip__value">
              {mode === 'rank' ? `#${entry.value}` : `${entry.value} pts`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Legend in the same standings order, and the mute control. */
export function TimelineLegend({
  series,
  hidden,
  onToggle,
}: {
  series: SeriesEntry[];
  hidden: Set<string>;
  onToggle: (name: string) => void;
}) {
  return (
    <ul className="chart-legend">
      {series.map((entry) => (
        <li key={entry.name}>
          <button
            className={hidden.has(entry.name) ? 'chart-legend__btn is-off' : 'chart-legend__btn'}
            onClick={() => onToggle(entry.name)}
            aria-pressed={!hidden.has(entry.name)}
          >
            <span className="chart-legend__swatch" style={{ background: entry.color }} />
            {entry.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Score progression. Players can be muted from the legend, which matters once
 * a league has more than a handful of competitors.
 */
export function ScoreTimeline({ stats }: { stats: Stats }) {
  const [mode, setMode] = useState<Mode>('cumulative');
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Standings order, used for the series, the legend and the tooltip.
  const players = useMemo(
    () => [...stats.players].sort((a, b) => b.pointsCounted - a.pointsCounted),
    [stats.players],
  );

  const data = useMemo(() => {
    const rows = new Map<number, Record<string, number | string>>();
    for (const player of stats.players) {
      for (const point of stats.timelines.get(player.playerId) ?? []) {
        let row = rows.get(point.roundSequence);
        if (!row) {
          row = { round: point.roundSequence, label: point.roundName };
          rows.set(point.roundSequence, row);
        }
        row[player.name] =
          mode === 'cumulative'
            ? point.cumulative
            : mode === 'rank'
              ? point.rank
              : point.points;
      }
    }
    return [...rows.values()].sort((a, b) => Number(a.round) - Number(b.round));
  }, [stats, mode]);

  const series = useMemo<SeriesEntry[]>(
    () => players.map((p, i) => ({ name: p.name, color: playerColor(i, players.length) })),
    [players],
  );
  const rankOrder = useMemo(
    () => new Map(players.map((p, i) => [p.name, i])),
    [players],
  );

  if (!data.length) {
    return (
      <Card title="Score over time">
        <Empty>No completed rounds with results yet.</Empty>
      </Card>
    );
  }

  const active = MODES.find((m) => m.key === mode)!;
  const roundNameOf = (round: string | number | undefined) =>
    data.find((row) => row.round === round)?.label as string | undefined;

  const toggle = (name: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <Card title="Score over time" subtitle={active.hint} wide>
      <div className="seg">
        {MODES.map((m) => (
          <button
            key={m.key}
            className={mode === m.key ? 'seg__btn seg__btn--on' : 'seg__btn'}
            onClick={() => setMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="chart chart--tall">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="#26262e" vertical={false} />
            <XAxis
              dataKey="round"
              stroke="#8a8a98"
              tickFormatter={(v) => `R${v}`}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              stroke="#8a8a98"
              tick={{ fontSize: 12 }}
              reversed={mode === 'rank'}
              domain={mode === 'rank' ? [1, players.length] : undefined}
              allowDecimals={false}
            />
            <Tooltip
              content={
                <TimelineTooltip mode={mode} rankOrder={rankOrder} roundNameOf={roundNameOf} />
              }
            />
            <Legend
              content={
                <TimelineLegend series={series} hidden={hidden} onToggle={toggle} />
              }
            />
            {series.map((entry) => (
              <Line
                key={entry.name}
                type="monotone"
                dataKey={entry.name}
                stroke={entry.color}
                strokeWidth={2.5}
                dot={{ r: 2.5 }}
                activeDot={{ r: 5 }}
                hide={hidden.has(entry.name)}
                connectNulls
                // Draw immediately: the entry animation leaves the curve at
                // zero length on first paint, and a dashboard has no use for it.
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="note">
        Listed in {stats.inProgress ? 'current standing' : 'finishing order'}. Click a name to
        mute or unmute that player.
      </p>
    </Card>
  );
}
