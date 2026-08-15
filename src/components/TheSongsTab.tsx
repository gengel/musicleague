import { useMemo } from 'react';
import type { Stats } from '../lib/stats';
import { computeDecadeTable } from '../lib/taste';
import { SuperlativeStrip } from './SuperlativeStrip';
import { SongsPanel, ConsensusPanel, ArtistsPanel } from './SongsPanel';
import { GenrePanel } from './GenrePanel';
import { QuadrantPanel } from './QuadrantPanel';
import { PopularityBandsPanel } from './PopularityBandsPanel';
import { EraGenrePanel } from './EraGenrePanel';
import { Card } from './ui';

function DecadePanel({ stats }: { stats: Stats }) {
  const rows = useMemo(() => computeDecadeTable(stats), [stats]);
  if (!rows.length) return null;

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.avgNet)), 0.1);

  return (
    <Card title="What wins here, by era" subtitle="Average score by release era." wide>
      <table className="t decade-table">
        <tbody>
          {rows.map((r) => {
            const pos = r.avgNet >= 0;
            const barWidth = `${Math.round((Math.abs(r.avgNet) / maxAbs) * 100)}%`;
            const label = r.decade === 0 ? '< 1990' : `${r.decade}s`;
            return (
              <tr key={r.decade}>
                <td className="dim">{label}</td>
                <td className="num dim">n={r.count}</td>
                <td className={`num ${pos ? 'pos' : 'neg'}`}>
                  {pos ? '+' : ''}
                  {r.avgNet.toFixed(1)}
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
      {rows.some((r) => r.count === 1) && (
        <p className="dim small" style={{ marginTop: 8 }}>
          Rows with n=1 are single songs — treat them as data points, not trends.
        </p>
      )}
    </Card>
  );
}

export function TheSongsTab({ stats }: { stats: Stats }) {
  return (
    <>
      <SuperlativeStrip
        stats={stats}
        labels={[
          'Widest appeal',
          'Most divisive',
          'Most downvoted',
          'Deepest cut to score',
        ]}
      />
      <SuperlativeStrip
        stats={stats}
        labels={[
          'Narrowest win',
          'Most one-sided single vote',
          'Biggest hit to bomb',
          'The time capsule',
        ]}
      />

      <DecadePanel stats={stats} />
      <PopularityBandsPanel stats={stats} />
      <QuadrantPanel stats={stats} />
      <EraGenrePanel stats={stats} />
      <SongsPanel stats={stats} />
      <ConsensusPanel stats={stats} />
      <GenrePanel stats={stats} />
      <ArtistsPanel stats={stats} />
    </>
  );
}
