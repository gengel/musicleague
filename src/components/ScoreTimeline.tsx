import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Stats } from '../lib/stats';
import { projectStandings } from '../lib/projection';
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
  // Filter out projection cone keys (__lo, __diff, __median, __anchor)
  const visible = payload.filter((e) => !String(e.name).includes('__'));
  if (!visible.length) return null;
  const entries = sortByRankOrder(visible, (e) => String(e.name), rankOrder);
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

  // Projection cone: only in cumulative mode when the season is in progress
  const coneData = useMemo(() => {
    if (mode !== 'cumulative' || !stats.inProgress) return null;
    const roundsLeft =
      stats.totalRounds != null ? stats.totalRounds - stats.roundsPlayed : 0;
    if (roundsLeft <= 0) return null;
    const projection = projectStandings(stats, { roundsLeft, runs: 300 });
    if (projection.insufficientData) return null;

    const lastRound = stats.roundsPlayed;

    // Bridge row at lastRound: zero-width cone, median = current score.
    // This pins the dashed line and shading to the exact endpoint of each
    // player's solid line so there is no gap at the round boundary.
    const bridgeRow: Record<string, number | string> = { round: lastRound };
    for (const f of projection.forecasts) {
      const tl = stats.timelines.get(f.playerId) ?? [];
      const current = tl[tl.length - 1]?.cumulative ?? f.currentPoints;
      bridgeRow[`${f.name}__lo`] = current;
      bridgeRow[`${f.name}__diff`] = 0;
      bridgeRow[`${f.name}__median`] = current;
    }

    const rows: Record<string, number | string>[] = [bridgeRow];
    for (let i = 0; i < roundsLeft; i += 1) {
      const roundNum = lastRound + i + 1;
      const row: Record<string, number | string> = { round: roundNum };
      for (const f of projection.forecasts) {
        const traj = f.trajectory[i];
        if (!traj) continue;
        row[`${f.name}__lo`] = traj.p10;
        row[`${f.name}__diff`] = traj.p90 - traj.p10;
        row[`${f.name}__median`] = traj.median;
      }
      rows.push(row);
    }

    return { rows, forecasts: projection.forecasts, lastRound };
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
          <ComposedChart
            data={coneData ? [
              // Merge bridge row into the last actual data row so R6 appears once
              // with both the solid-line value and the cone starting point.
              ...data.slice(0, -1),
              { ...data[data.length - 1], ...coneData.rows[0] },
              ...coneData.rows.slice(1),
            ] : data}
            margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
          >
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
            {coneData && (
              <ReferenceLine
                x={coneData.lastRound}
                stroke="#444"
                strokeDasharray="4 3"
              />
            )}
            {/* Projection cone: stacked areas per player, rendered behind the lines */}
            {coneData &&
              series.map((entry) => [
                <Area
                  key={`${entry.name}__lo`}
                  type="monotone"
                  dataKey={`${entry.name}__lo`}
                  stackId={`cone_${entry.name}`}
                  stroke="none"
                  fill="transparent"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  legendType="none"
                  hide={hidden.has(entry.name)}
                />,
                <Area
                  key={`${entry.name}__diff`}
                  type="monotone"
                  dataKey={`${entry.name}__diff`}
                  stackId={`cone_${entry.name}`}
                  stroke="none"
                  fill={entry.color}
                  fillOpacity={0.15}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  legendType="none"
                  hide={hidden.has(entry.name)}
                />,
                <Line
                  key={`${entry.name}__median`}
                  type="monotone"
                  dataKey={`${entry.name}__median`}
                  stroke={entry.color}
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  legendType="none"
                  hide={hidden.has(entry.name)}
                />,
              ])}
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
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="note">
        Listed in {stats.inProgress ? 'current standing' : 'finishing order'}. Click a name to
        mute or unmute that player.
      </p>
    </Card>
  );
}
