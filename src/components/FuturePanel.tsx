import { useMemo } from 'react';
import type { Stats } from '../lib/stats';
import { future } from '../lib/future';
import { Card, Empty, n1, StatTile } from './ui';
import { LabelIcon } from './Icons';

/**
 * What can still change, and what it would take.
 *
 * Deliberately grounded in what this league has actually done — the biggest
 * round anyone has managed, the median winning score — rather than abstract
 * maxima, so "within reach" means something.
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
            : `Grouped by reach — ${roundsLeft} rounds left at the biggest swing this league has actually produced (${n1(swing.realistic)} a round).`
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
                    <span className="band__name">{p.name}</span>
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
          Bands, not percentages: a dozen rounds of a friendly league is far too little to justify a
          real probability. "In contention" means the gap is within about half the biggest swing the
          league has produced; "outside shot" means it would take a run better than anything seen so
          far.
        </p>
      </Card>
    </>
  );
}
