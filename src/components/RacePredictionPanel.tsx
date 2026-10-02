import { useMemo } from 'react';
import type { Stats } from '../lib/stats';
import { projectStandings } from '../lib/projection';
import { Card, playerColor } from './ui';
import { InfoTip, MethodDrawer } from './InfoTip';

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

  const competitive = stats.scoring === 'competitive';
  const subtitle = `${roundsLeft} round${roundsLeft !== 1 ? 's' : ''} left · ${
    projection.runs
  } simulated seasons, built from how the league has actually voted.`;

  return (
    <Card title="Race prediction" subtitle={subtitle} wide>
      <div className="race-forecast">
        <div className="race-forecast__head dim small">
          Chance of winning
          <InfoTip label="How the win chance is worked out">
            Each of the {projection.runs} simulated seasons plays out the {roundsLeft} remaining
            round{roundsLeft !== 1 ? 's' : ''} and crowns whoever ends on top. A player's percentage
            is the share of those seasons they won. It is a count of outcomes, not a rating, so the
            figures across all players add up to 100%.
          </InfoTip>
        </div>
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

      <div className="table-wrap">
        <table className="t" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Player</th>
              <th className="num col-secondary">Now</th>
              <th className="num">
                <span className="th-tip">
                  Projected range
                  <InfoTip label="What the projected range means">
                    The band from the 10th to the 90th percentile of their final score across the
                    {' '}{projection.runs} seasons: a lucky run lands near the top, an unlucky one
                    near the bottom, and four in five seasons fall in between. A wide band means
                    their finish is still volatile; a narrow one means it is close to settled.
                  </InfoTip>
                </span>
              </th>
              <th className="num">
                <span className="th-tip">
                  Median
                  <InfoTip label="What the median is">
                    Their middle outcome: half the simulated seasons finished above this score,
                    half below. A steadier middle guess than the average, which a single runaway
                    season could drag.
                  </InfoTip>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {forecasts.slice(0, 6).map((f) => (
              <tr key={f.playerId}>
                <td className="nowrap">{f.name}</td>
                <td className="num dim col-secondary">{fmtScore(f.currentPoints)}</td>
                <td className="num dim nowrap">
                  {fmtScore(f.finalScore.p10)} … {fmtScore(f.finalScore.p90)}
                </td>
                <td className={`num ${f.finalScore.median >= 0 ? 'pos' : 'neg'}`}>
                  {fmtScore(f.finalScore.median)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MethodDrawer summary="How the simulation works">
        <p>
          The remaining rounds are played out {projection.runs} times, and this panel counts how
          those seasons ended. Each simulated round is built only from how the league has already
          voted — no assumptions about who is "better".
        </p>
        <p>
          Every real ballot cast so far is kept as a shape: how many points that voter gave out and
          in what sizes. A simulated round reuses the league's real size — its typical song count
          and voter count — and for each voter draws one of those real ballots at random and scatters
          its points across the songs. So the amount of praise and spite in a round, and how
          concentrated it is, matches the league's own habits rather than a flat average.
        </p>
        {competitive && (
          <p>
            Forfeits carry forward too: a player who has skipped voting in some rounds skips future
            ones at the same rate, and in this league's competitive scoring a skipped round costs
            them the upvotes their song earned while still taking any downvotes.
          </p>
        )}
        <p>
          The run uses a fixed random seed, so the same standings always produce the same
          projection. It cannot know what songs people will actually pick, so read it as "if the
          league keeps voting the way it has", not a tip.
        </p>
      </MethodDrawer>
    </Card>
  );
}
