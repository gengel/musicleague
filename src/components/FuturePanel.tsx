import { useMemo } from 'react';
import type { Stats } from '../lib/stats';
import { future } from '../lib/future';
import { Card, Empty, n1, StatTile } from './ui';
import { LabelIcon } from './Icons';
import { SuperlativeStrip } from './SuperlativeStrip';

/**
 * What can still change, and what it would take.
 *
 * Deliberately grounded in what this league has actually done — the biggest
 * round anyone has managed, the median winning score — rather than abstract
 * maxima, so "within reach" means something. The title-race bands and the
 * win-probability detail live in RacePredictionPanel ("The title race").
 */
export function FuturePanel({ stats }: { stats: Stats }) {
  const outlook = useMemo(() => future(stats), [stats]);

  if (!outlook.projections.length) {
    return (
      <Card title="What can still happen">
        <Empty>Not enough completed rounds to project anything yet.</Empty>
      </Card>
    );
  }

  const { swing, roundsLeft } = outlook;

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
    </>
  );
}
