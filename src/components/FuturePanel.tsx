import { useMemo } from 'react';
import type { Stats } from '../lib/stats';
import { future } from '../lib/future';
import { playerSlug } from '../lib/playerProfile';
import { Card, Empty, n1, StatTile } from './ui';
import { LabelIcon } from './Icons';
import { SuperlativeStrip } from './SuperlativeStrip';

/**
 * What can still change, and what it would take.
 *
 * Deliberately grounded in what this league has actually done — the biggest
 * round anyone has managed, the median winning score — rather than abstract
 * maxima, so "within reach" means something.
 */
export function FuturePanel({
  stats,
  onOpenPlayer,
}: {
  stats: Stats;
  onOpenPlayer?: (slug: string) => void;
}) {
  const outlook = useMemo(() => future(stats), [stats]);

  if (!outlook.projections.length) {
    return (
      <Card title="What can still happen">
        <Empty>Not enough completed rounds to project anything yet.</Empty>
      </Card>
    );
  }

  const { swing, roundsLeft } = outlook;
  const hasWinShares = outlook.bands.some((b) => b.players.some((p) => p.winShare !== undefined));
  // A win share of 0.5–99.5% rounds to a readable integer; show <1% and >99%
  // as such so a long shot never rounds to "0%" and a near-lock never to "100%".
  const fmtWin = (p: number): string => {
    if (p >= 0.995 && p < 1) return '>99%';
    if (p > 0 && p < 0.005) return '<1%';
    return `${Math.round(p * 100)}%`;
  };

  return (
    <>
      <Card
        title="What can still happen"
        subtitle={
          roundsLeft === undefined
            ? 'The export does not say how many rounds remain, so these are per-round figures. Bake with --rounds to pin them down.'
            : `${roundsLeft} rounds left. Every figure below comes from how this league has actually played, not from theory.`
        }
        wide
      >
        <div className="tiles">
          {roundsLeft !== undefined && (
            <StatTile label="Rounds left" value={roundsLeft} hint={`of ${stats.totalRounds}`} />
          )}
          <StatTile
            label="Best round so far"
            value={n1(swing.bestObserved)}
            hint="most any song has scored"
          />
          <StatTile
            label="Typical winning round"
            value={n1(swing.typicalWin)}
            hint="median round winner"
          />
          <StatTile
            label="Biggest swing seen"
            value={n1(swing.realistic)}
            hint="best round minus worst"
          />
          <StatTile
            label="Round ceiling"
            value={n1(swing.ceiling)}
            hint="if every voter maxed one song"
          />
        </div>

        {/* Who is bleeding points to not voting — the levers still in a
            player's own hands. Omitted automatically in friendly leagues,
            where nothing is forfeited. */}
        <SuperlativeStrip
          stats={stats}
          labels={['Most forfeited by not voting', 'Most rounds skipped voting']}
        />

        <div className="scenarios">
          {outlook.projections.map((projection) => (
            <article className={`scenario scenario--${projection.status}`} key={projection.label}>
              <span className="scenario__badge">
                <LabelIcon label={projection.label} size={22} />
              </span>
              <div>
                <span className="scenario__label">
                  {projection.label}
                  {projection.status === 'settled' && <em> · already decided</em>}
                </span>
                <p className="scenario__lead">{projection.headline}</p>
                <p className="scenario__detail">{projection.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </Card>

      <Card
        title="The title race"
        subtitle={
          roundsLeft === undefined
            ? 'Grouped by how close each player is, given the season so far.'
            : `Chance of winning the title, from ${500} simulated seasons over the ${roundsLeft} remaining round${roundsLeft === 1 ? '' : 's'}.`
        }
        wide
      >
        <div className="bands">
          {outlook.bands.map((band) => (
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
                      <button className="linklike band__name" onClick={() => onOpenPlayer(playerSlug(p.name))}>
                        {p.name}
                      </button>
                    ) : (
                      <span className="band__name">{p.name}</span>
                    )}
                    {p.winShare !== undefined && (
                      <span className="band__win dim small">{fmtWin(p.winShare)}</span>
                    )}
                    <span className={`band__pts ${p.points < 0 ? 'neg' : 'pos'}`}>
                      {p.points > 0 ? '+' : ''}
                      {p.points}
                    </span>
                    {p.behind > 0 && <span className="band__behind dim small">−{p.behind} back</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="note">
          {hasWinShares
            ? 'Win chance is the share of simulated seasons each player won, assuming the league keeps voting the way it has. The remaining rounds are resampled from real ballots 500 times; see "How the simulation works" under Race prediction.'
            : 'Bands, not percentages: without a known finish line there is too little to justify a real probability, so players are grouped by how close they are on the season so far.'}
        </p>
      </Card>
    </>
  );
}
