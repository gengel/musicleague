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
        title="Everyone's path"
        subtitle="What each player needs to gain on the player above them."
        wide
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th className="num">Score</th>
                <th className="num">Behind the player above</th>
                <th className="num">Behind the leader</th>
                <th>Still possible?</th>
              </tr>
            </thead>
            <tbody>
              {[...stats.players]
                .filter((p) => p.songs > 0)
                .sort((a, b) => b.pointsCounted - a.pointsCounted)
                .map((player, index, list) => {
                  const above = index === 0 ? undefined : list[index - 1];
                  const leader = list[0];
                  const toAbove = above ? above.pointsCounted - player.pointsCounted : 0;
                  const toLeader = leader.pointsCounted - player.pointsCounted;
                  const budget =
                    roundsLeft === undefined ? undefined : roundsLeft * swing.perRound;
                  const canWin = budget === undefined ? true : toLeader <= budget;
                  return (
                    <tr key={player.playerId}>
                      <td>
                        <strong className="nowrap">{player.name}</strong>
                      </td>
                      <td className="num">
                        <strong className={player.pointsCounted < 0 ? 'neg' : undefined}>
                          {n1(player.pointsCounted)}
                        </strong>
                      </td>
                      <td className="num">{above ? n1(toAbove) : <span className="dim">—</span>}</td>
                      <td className="num">
                        {index === 0 ? <span className="dim">leads</span> : n1(toLeader)}
                      </td>
                      <td>
                        {index === 0 ? (
                          <span className="dim">defending</span>
                        ) : canWin ? (
                          <span className="pos">can still win</span>
                        ) : (
                          <span className="dim">out of the title race</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <p className="note">
          "Still possible" is generous on purpose: it assumes the theoretical maximum swing of{' '}
          {n1(swing.perRound)} a round, every remaining round, so nobody is written off early. The
          biggest swing anyone has actually managed is {n1(swing.realistic)}.
        </p>
      </Card>
    </>
  );
}
