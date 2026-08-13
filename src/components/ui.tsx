import { useMemo, useState, type ReactNode } from 'react';
import type { ScoreBreakdown } from '../lib/stats';

/* ------------------------------------------------------------------ *
 * Small presentational primitives shared by every panel.
 * ------------------------------------------------------------------ */

export function Card({
  title,
  subtitle,
  children,
  wide,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={`card${wide ? ' card--wide' : ''}`}>
      {title && (
        <header className="card__head">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </header>
      )}
      <div className="card__body">{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  name,
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** True when the value is a name rather than a number, so it is set smaller
   *  and kept on one line instead of breaking mid-word. */
  name?: boolean;
}) {
  return (
    <div className="tile">
      <span className="tile__label">{label}</span>
      <strong className={name ? 'tile__value tile__value--name' : 'tile__value'} title={String(value)}>
        {value}
      </strong>
      {hint && <span className="tile__hint">{hint}</span>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/* ------------------------------------------------------------------ *
 * Sortable table
 * ------------------------------------------------------------------ */

export interface Column<T> {
  key: string;
  label: string;
  /** Sort value. Strings sort alphabetically, numbers descending-first. */
  value: (row: T) => number | string;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right';
  title?: string;
}

export function SortableTable<T>({
  columns,
  rows,
  initialSort,
  initialAsc = false,
  limit,
  rowKey,
  highlight,
}: {
  columns: Column<T>[];
  rows: T[];
  initialSort?: string;
  initialAsc?: boolean;
  limit?: number;
  rowKey: (row: T) => string;
  highlight?: (row: T) => boolean;
}) {
  const [sortKey, setSortKey] = useState(initialSort ?? columns[0].key);
  const [asc, setAsc] = useState(initialAsc);
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey) ?? columns[0];
    // Negate the comparator rather than reversing the result: Array#sort is
    // stable, so ties keep the order they arrived in and any deliberate
    // tie-break applied by the caller survives.
    const direction = asc ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb)) * direction;
      }
      return (va - vb) * direction;
    });
  }, [rows, columns, sortKey, asc]);

  const visible = showAll || !limit ? sorted : sorted.slice(0, limit);

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  title={col.title}
                  className={`${col.align === 'right' ? 'num' : ''}${sortKey === col.key ? ' sorted' : ''}`}
                  onClick={() => {
                    if (sortKey === col.key) setAsc((v) => !v);
                    else {
                      setSortKey(col.key);
                      setAsc(false);
                    }
                  }}
                >
                  {col.label}
                  {sortKey === col.key && <span className="arrow">{asc ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={rowKey(row)} className={highlight?.(row) ? 'row--flag' : undefined}>
                {columns.map((col) => (
                  <td key={col.key} className={col.align === 'right' ? 'num' : ''}>
                    {col.render ? col.render(row) : String(col.value(row))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {limit && sorted.length > limit && (
        <button className="link-btn" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show less' : `Show all ${sorted.length}`}
        </button>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Formatting and colour
 * ------------------------------------------------------------------ */

export const n1 = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));
export const n2 = (v: number): string => v.toFixed(2);
export const pct0 = (v: number): string => `${Math.round(v * 100)}%`;

/* ------------------------------------------------------------------ *
 * Score breakdown
 * ------------------------------------------------------------------ */

/**
 * A score shown as its parts rather than a bare number.
 *
 * The identity is total = upvotes − downvotes − forfeited + absorbed, where
 * `absorbed` is downvotes the zero floor threw away. Zero-valued parts are
 * hidden so a league without downvotes reads simply as "43 − 43 = 0".
 */
export function ScoreParts({
  breakdown,
  showTotal = true,
}: {
  breakdown: ScoreBreakdown;
  showTotal?: boolean;
}) {
  const { upvotes, downvotes, forfeited, absorbed, total } = breakdown;
  return (
    <span className="parts">
      <span className="parts__up" title="Upvote points received">
        +{n1(upvotes)}
      </span>
      {downvotes > 0 && (
        <span className="parts__down" title="Downvote points received">
          −{n1(downvotes)}
        </span>
      )}
      {forfeited > 0 && (
        <span className="parts__forfeit" title="Upvotes withheld for not voting">
          −{n1(forfeited)} forfeit
        </span>
      )}
      {absorbed > 0 && (
        <span
          className="parts__absorbed"
          title="Downvotes that never landed, because a song's score cannot go below zero"
        >
          +{n1(absorbed)} floored
        </span>
      )}
      {showTotal && (
        <>
          <span className="parts__eq">=</span>
          <strong className={total < 0 ? 'parts__total neg' : 'parts__total'}>{n1(total)}</strong>
        </>
      )}
    </span>
  );
}

/**
 * Splits a score into the fate of every point, for a stacked bar.
 *
 * `kept + cancelled + forfeited` always equals the upvotes earned, so the bar
 * shows what a player actually earned and then what happened to it. When
 * downvotes exceed the upvotes available, the excess is reported separately as
 * `belowZero` — otherwise a heavily downvoted player would appear to have
 * earned nothing at all.
 */
export function scoreBarSegments(breakdown: ScoreBreakdown): {
  kept: number;
  cancelled: number;
  forfeited: number;
  belowZero: number;
} {
  const { upvotes, forfeited, total } = breakdown;
  const kept = Math.max(0, total);
  // Upvotes that survived the forfeit but were wiped out by downvotes.
  const cancelled = Math.max(0, upvotes - forfeited - kept);
  return { kept, cancelled, forfeited, belowZero: Math.max(0, -total) };
}

/**
 * The scale a set of diverging bars shares.
 *
 * The axis sits where the two extremes balance, so a point is the same width
 * on either side of zero and no space is wasted on an unused half.
 */
export interface DivergingScale {
  /** Largest distance above zero any row needs, counting what was earned. */
  above: number;
  /** Largest distance below zero any row reaches. */
  below: number;
  /** Where the zero axis sits, as a percentage from the left. */
  axis: number;
}

export function divergingScale(breakdowns: ScoreBreakdown[]): DivergingScale {
  const above = Math.max(1, ...breakdowns.map((b) => Math.max(b.upvotes, b.total)));
  const below = Math.max(0, ...breakdowns.map((b) => Math.max(0, -b.total)));
  return { above, below, axis: (below / (below + above)) * 100 };
}

/**
 * One row's geometry, in percentages of each side of the axis.
 * Kept pure so the arithmetic can be tested without a DOM.
 */
export function divergingBar(
  breakdown: ScoreBreakdown,
  scale: DivergingScale,
): { negative: number; positive: number; ghost: number } {
  const { total, upvotes } = breakdown;
  return {
    negative: scale.below > 0 ? (Math.max(0, -total) / scale.below) * 100 : 0,
    positive: (Math.max(0, total) / scale.above) * 100,
    // What they earned before downvotes and forfeits took their cut.
    ghost: (Math.max(0, upvotes) / scale.above) * 100,
  };
}

/**
 * A score as a bar that reads above or below zero at a glance.
 *
 * The solid bar is what the league counted; the faint outline behind it is what
 * the player earned in upvotes before downvotes and forfeits were taken off.
 * A player can therefore be seen to have earned plenty and still finished
 * underwater, which a single stacked bar could not show.
 */
export function ScoreBar({
  breakdown,
  scale,
  label,
}: {
  breakdown: ScoreBreakdown;
  scale: DivergingScale;
  label?: string;
}) {
  const { negative, positive, ghost } = divergingBar(breakdown, scale);
  const negWidth = scale.axis;

  return (
    <span className="dbar" title={label}>
      <span className="dbar__side dbar__side--neg" style={{ width: `${negWidth}%` }}>
        {negative > 0 && (
          <span className="dbar__fill dbar__fill--neg" style={{ width: `${negative}%` }} />
        )}
      </span>
      <span className="dbar__axis" />
      <span className="dbar__side dbar__side--pos" style={{ width: `${100 - negWidth}%` }}>
        {ghost > 0 && <span className="dbar__ghost" style={{ width: `${ghost}%` }} />}
        {positive > 0 && (
          <span className="dbar__fill dbar__fill--pos" style={{ width: `${positive}%` }} />
        )}
      </span>
    </span>
  );
}

/**
 * Orders items by a supplied ranking rather than however they arrived.
 * Recharts hands tooltip entries over in series-key order, which reads
 * alphabetical; the leaderboard order is what a reader expects.
 */
export function sortByRankOrder<T>(
  items: T[],
  nameOf: (item: T) => string,
  order: Map<string, number>,
): T[] {
  return [...items].sort(
    (a, b) =>
      (order.get(nameOf(a)) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(nameOf(b)) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Stable, evenly spaced hues so a player keeps their colour everywhere. */
export function playerColor(index: number, total: number): string {
  const hue = Math.round((index * 360) / Math.max(1, total));
  const light = index % 2 === 0 ? 62 : 72;
  return `hsl(${hue} 72% ${light}%)`;
}

/**
 * Diverging colour for an affinity value where 1.0 is neutral.
 * Cold blue below, warm magenta above.
 */
export function affinityColor(affinity: number, hasOpportunity: boolean): string {
  if (!hasOpportunity) return 'transparent';
  const clamped = Math.max(0, Math.min(2.5, affinity));
  if (clamped >= 1) {
    const t = Math.min(1, (clamped - 1) / 1.2);
    return `hsl(320 ${Math.round(40 + t * 50)}% ${Math.round(58 - t * 26)}%)`;
  }
  const t = 1 - clamped;
  return `hsl(205 ${Math.round(30 + t * 45)}% ${Math.round(58 - t * 30)}%)`;
}
