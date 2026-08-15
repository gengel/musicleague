import { useMemo } from 'react';
import { embeddedGenres } from 'virtual:league-data';
import type { Stats } from '../lib/stats';
import { computeEraGenreMatrix, ERA_BUCKETS } from '../lib/taste';
import { Card } from './ui';

const MIN_HIGHLIGHT = 3;

export function EraGenrePanel({ stats }: { stats: Stats }): JSX.Element | null {
  const { cells, genres } = useMemo(
    () => computeEraGenreMatrix(stats, embeddedGenres),
    [stats],
  );
  if (!cells.length) return null;

  const byKey = new Map(cells.map((c) => [`${c.era}|${c.genre}`, c]));

  const eligible = cells.filter((c) => c.count >= MIN_HIGHLIGHT);
  const winner = eligible.length ? eligible.reduce((a, b) => b.avgNet > a.avgNet ? b : a) : null;
  const loser  = eligible.length ? eligible.reduce((a, b) => b.avgNet < a.avgNet ? b : a) : null;

  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;

  return (
    <Card
      title="What wins here, by era and genre"
      subtitle="Mean net score per cell. Green = highest average, red = lowest (3+ songs)."
      wide
    >
      <div className="era-pop-matrix">
        <table className="epm-table">
          <thead>
            <tr>
              <th className="epm-corner" />
              {genres.map((g) => (
                <th key={g} className="epm-colhead">{g}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ERA_BUCKETS.map((era) => {
              const hasAny = genres.some((g) => byKey.has(`${era}|${g}`));
              if (!hasAny) return null;
              return (
                <tr key={era}>
                  <th className="epm-rowhead">{era}</th>
                  {genres.map((genre) => {
                    const cell = byKey.get(`${era}|${genre}`);
                    const isWinner = winner && cell && cell.era === winner.era && cell.genre === winner.genre;
                    const isLoser  = loser  && cell && cell.era === loser.era  && cell.genre === loser.genre;
                    return (
                      <td
                        key={genre}
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
