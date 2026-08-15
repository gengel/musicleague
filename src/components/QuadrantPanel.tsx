import { useMemo } from 'react';
import type { Stats } from '../lib/stats';
import { computeEraPopMatrix, ERA_BUCKETS, POP_BUCKETS } from '../lib/taste';
import { Card } from './ui';

const MIN_HIGHLIGHT = 3; // cells with fewer songs than this don't win/lose

export function QuadrantPanel({ stats }: { stats: Stats }): JSX.Element | null {
  const cells = useMemo(() => computeEraPopMatrix(stats), [stats]);
  if (!cells.length) return null;

  const byKey = new Map(cells.map((c) => [`${c.era}|${c.pop}`, c]));

  // Find winner and loser among cells with enough songs to be meaningful.
  const eligible = cells.filter((c) => c.count >= MIN_HIGHLIGHT);
  const winner = eligible.length ? eligible.reduce((a, b) => b.avgNet > a.avgNet ? b : a) : null;
  const loser  = eligible.length ? eligible.reduce((a, b) => b.avgNet < a.avgNet ? b : a) : null;

  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;

  return (
    <Card
      title="What wins here, by era and popularity"
      subtitle="Mean net score per cell. Green = highest average, red = lowest (3+ songs)."
      wide
    >
      <div className="era-pop-matrix">
        <table className="epm-table">
          <thead>
            <tr>
              <th className="epm-corner" />
              {POP_BUCKETS.map((p) => (
                <th key={p} className="epm-colhead">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ERA_BUCKETS.map((era) => {
              const hasAny = POP_BUCKETS.some((pop) => byKey.has(`${era}|${pop}`));
              if (!hasAny) return null;
              return (
                <tr key={era}>
                  <th className="epm-rowhead">{era}</th>
                  {POP_BUCKETS.map((pop) => {
                    const cell = byKey.get(`${era}|${pop}`);
                    const isWinner = winner && cell && cell.era === winner.era && cell.pop === winner.pop;
                    const isLoser  = loser  && cell && cell.era === loser.era  && cell.pop === loser.pop;
                    return (
                      <td
                        key={pop}
                        className={`epm-cell${isWinner ? ' epm-cell--win' : ''}${isLoser ? ' epm-cell--lose' : ''}${!cell ? ' epm-cell--empty' : ''}`}
                      >
                        {cell ? (
                          <>
                            <span className="epm-score">{fmt(cell.avgNet)}</span>
                            <span className="epm-count">{cell.count}</span>
                          </>
                        ) : (
                          <span className="epm-empty">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
