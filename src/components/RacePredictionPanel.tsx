import { useMemo } from 'react';
import type { Stats } from '../lib/stats';
import { projectStandings } from '../lib/projection';
import { future } from '../lib/future';
import { playerSlug } from '../lib/playerProfile';
import { Card } from './ui';
import { InfoTip, MethodDrawer } from './InfoTip';

/**
 * The race for the title, as one card.
 *
 * The named win-probability bands tell the story — who is clinched, who is a
 * flip of a coin, who is mathematically out — and the table underneath gives
 * each live contender's projected final-score range. Both come from the same
 * 500-season resample, so they are shown together rather than as two panels
 * that restate the same percentage.
 */
export function RacePredictionPanel({
  stats,
  onOpenPlayer,
}: {
  stats: Stats;
  onOpenPlayer?: (slug: string) => void;
}): JSX.Element | null {
  const roundsLeft = stats.totalRounds != null ? stats.totalRounds - stats.roundsPlayed : 0;

  const projection = useMemo(() => {
    if (roundsLeft <= 0) return null;
    return projectStandings(stats, { roundsLeft, runs: 500 });
  }, [stats, roundsLeft]);

  const bands = useMemo(() => future(stats).bands, [stats]);

  if (roundsLeft <= 0) {
    return (
      <Card title="The title race" wide>
        <p className="dim small">Season complete. Final standings above.</p>
      </Card>
    );
  }

  if (!projection || projection.insufficientData) return null;

  const { forecasts } = projection;
  const hasWinShares = bands.some((b) => b.players.some((p) => p.winShare !== undefined));

  // A win share of 0.5–99.5% rounds to a readable integer; show <1% and >99%
  // so a long shot never reads "0%" nor a near-lock "100%" (those labels are
  // reserved for the mathematically certain bands).
  const fmtWin = (p: number): string => {
    if (p >= 0.995 && p < 1) return '>99%';
    if (p > 0 && p < 0.005) return '<1%';
    return `${Math.round(p * 100)}%`;
  };
  const fmtScore = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n)}`;

  const competitive = stats.scoring === 'competitive';
  const subtitle = `Chance of winning the title over the ${roundsLeft} remaining round${
    roundsLeft !== 1 ? 's' : ''
  }, from ${projection.runs} seasons simulated from how the league has actually voted.`;

  // Only the contenders still alive are worth a projected-range row; the
  // mathematically-out players are in the bands above with their gap.
  const liveIds = new Set(
    bands.filter((b) => b.key !== 'gameover').flatMap((b) => b.players.map((p) => p.playerId)),
  );
  const rangeRows = forecasts.filter((f) => liveIds.has(f.playerId)).slice(0, 8);

  return (
    <Card title="The title race" subtitle={subtitle} wideSubtitle wide>
      {hasWinShares && (
        <p className="race-bands__head dim small">
          % is each player's chance of winning
          <InfoTip label="How the win chance is worked out">
            Each of the {projection.runs} simulated seasons plays out the {roundsLeft} remaining
            round{roundsLeft !== 1 ? 's' : ''} and crowns whoever ends on top. A player's percentage
            is the share of those seasons they won, so the figures across all players add up to
            100%.
          </InfoTip>
        </p>
      )}
      <div className="bands">
        {bands.map((band) => (
          <div className={`band band--${band.key}`} key={band.key}>
            <div className="band__head">
              <span className="band__label">{band.label}</span>
              <span className="band__note dim small">{band.note}</span>
            </div>
            <ul className="band__players">
              {band.players.map((p) => (
                <li key={p.playerId} className="band__player">
                  <span className="band__rank dim">{p.rank}</span>
                  {onOpenPlayer ? (
                    <button
                      className="linklike band__name"
                      onClick={() => onOpenPlayer(playerSlug(p.name))}
                    >
                      {p.name}
                    </button>
                  ) : (
                    <span className="band__name">{p.name}</span>
                  )}
                  {p.winShare !== undefined ? (
                    <span className="band__win">{fmtWin(p.winShare)}</span>
                  ) : (
                    <span className={`band__win ${p.points < 0 ? 'neg' : 'pos'}`}>
                      {p.points > 0 ? '+' : ''}
                      {p.points}
                    </span>
                  )}
                  {p.behind > 0 && <span className="band__behind dim small">−{p.behind} back</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {hasWinShares && (
        <>
          <div className="race-range__head dim small">
            Where they could finish
            <InfoTip label="What the projected range means">
              Across the {projection.runs} simulated seasons, this is the band from each player's
              10th- to 90th-percentile final score — four in five of their seasons land inside it.
              A wide band means their finish is still volatile; a narrow one means it is nearly
              settled. The median is their middle outcome.
            </InfoTip>
          </div>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Player</th>
                  <th className="num col-secondary">Now</th>
                  <th className="num">Projected range</th>
                  <th className="num">Median</th>
                </tr>
              </thead>
              <tbody>
                {rangeRows.map((f) => (
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
        </>
      )}

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
          "Clinched" and "Game over" are not from the simulation but from the maths: a player is
          clinched only when no rival can catch them even with a perfect run in every remaining
          round, and out only when they cannot reach the current leader by the same measure. The
          run uses a fixed random seed, so the same standings always produce the same projection,
          and it cannot know what songs people will actually pick — read it as "if the league keeps
          voting the way it has", not a tip.
        </p>
      </MethodDrawer>
    </Card>
  );
}
