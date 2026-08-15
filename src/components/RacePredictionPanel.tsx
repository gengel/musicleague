import { useMemo } from 'react';
import type { Stats } from '../lib/stats';
import { projectStandings } from '../lib/projection';
import { Card, playerColor } from './ui';

export function RacePredictionPanel({ stats }: { stats: Stats }): JSX.Element | null {
  const roundsLeft = stats.totalRounds != null ? stats.totalRounds - stats.roundsPlayed : 0;

  const projection = useMemo(() => {
    if (roundsLeft <= 0) return null;
    return projectStandings(stats, { roundsLeft, runs: 500 });
  }, [stats, roundsLeft]);

  if (roundsLeft <= 0) {
    return (
      <Card title="Race prediction" wide>
        <p className="dim small">Season complete. Final standings above.</p>
      </Card>
    );
  }

  if (!projection || projection.insufficientData) return null;

  const { forecasts } = projection;
  const MIN_PCT = 0.02;
  const shown = forecasts.filter((f) => f.winShare >= MIN_PCT);
  const othersShare = forecasts
    .filter((f) => f.winShare < MIN_PCT)
    .reduce((acc, f) => acc + f.winShare, 0);

  // Use the same standings-sorted player order for consistent colors
  const allPlayers = [...stats.players]
    .filter((p) => p.songs > 0)
    .sort((a, b) => b.pointsCounted - a.pointsCounted);
  const colorOf = (name: string) => {
    const idx = allPlayers.findIndex((p) => p.name === name);
    return idx >= 0 ? playerColor(idx, allPlayers.length) : '#888';
  };

  const fmtPct = (n: number) => `${Math.round(n * 100)}%`;
  const fmtScore = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n)}`;

  const subtitle = `Resampled from ${stats.roundsPlayed} played round${stats.roundsPlayed !== 1 ? 's' : ''} × 500 simulations.`;

  return (
    <Card title="Race prediction" subtitle={subtitle} wide>
      <div className="race-forecast">
        {shown.map((f) => (
          <div key={f.playerId} className="race-forecast__row">
            <span>{f.name}</span>
            <div className="race-forecast__bar">
              <div
                className="race-forecast__fill"
                style={{ width: fmtPct(f.winShare), background: colorOf(f.name) }}
              />
            </div>
            <span className="race-forecast__pct">{fmtPct(f.winShare)}</span>
          </div>
        ))}
        {othersShare >= 0.005 && (
          <div className="race-forecast__row">
            <span className="dim">Others</span>
            <div className="race-forecast__bar">
              <div
                className="race-forecast__fill"
                style={{ width: fmtPct(othersShare), background: '#555' }}
              />
            </div>
            <span className="race-forecast__pct">{fmtPct(othersShare)}</span>
          </div>
        )}
      </div>

      <table className="t" style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>Player</th>
            <th className="num">Now</th>
            <th className="num">Projected range</th>
            <th className="num">Median finish</th>
          </tr>
        </thead>
        <tbody>
          {forecasts.slice(0, 6).map((f) => (
            <tr key={f.playerId}>
              <td>{f.name}</td>
              <td className="num dim">{fmtScore(f.currentPoints)}</td>
              <td className="num dim">
                {fmtScore(f.finalScore.p10)} … {fmtScore(f.finalScore.p90)}
              </td>
              <td className={`num ${f.finalScore.median >= 0 ? 'pos' : 'neg'}`}>
                {fmtScore(f.finalScore.median)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        Assumes voters keep their observed appetite for spreading vs. concentrating points.
      </p>
    </Card>
  );
}
