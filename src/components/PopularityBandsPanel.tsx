import { useMemo } from 'react';
import type { Stats } from '../lib/stats';
import { computePopularityBands } from '../lib/taste';
import { Card } from './ui';

const BAND_LABEL: Record<string, string> = {
  'deep cut': 'Deep cuts',
  'niche':    'Niche',
  'known':    'Known',
  'popular':  'Popular',
  'hit':      'Hits',
};

const BAND_RANGE: Record<string, string> = {
  'deep cut': '< 20k',
  'niche':    '20k – 100k',
  'known':    '100k – 500k',
  'popular':  '500k – 1M',
  'hit':      '> 1M',
};

export function PopularityBandsPanel({ stats }: { stats: Stats }): JSX.Element | null {
  const rows = useMemo(() => computePopularityBands(stats), [stats]);
  if (!rows.length) return null;

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.avgNet)), 0.1);

  return (
    <Card title="What wins here, by popularity" subtitle="Mean net score per listener-count band (Last.fm)." wide>
      <table className="t">
        <tbody>
          {rows.map((r) => {
            const pos = r.avgNet >= 0;
            const barWidth = `${Math.round((Math.abs(r.avgNet) / maxAbs) * 100)}%`;
            return (
              <tr key={r.band}>
                <td>
                  <strong>{BAND_LABEL[r.band]}</strong>
                  <span className="dim small"> {BAND_RANGE[r.band]}</span>
                </td>
                <td className="num dim">n={r.count}</td>
                <td className={`num ${pos ? 'pos' : 'neg'}`}>
                  {pos ? '+' : ''}{r.avgNet.toFixed(1)}
                </td>
                <td style={{ width: '40%' }}>
                  <div
                    className={`bar-fill ${pos ? 'bar-fill--pos' : 'bar-fill--neg'}`}
                    style={{ width: barWidth }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
