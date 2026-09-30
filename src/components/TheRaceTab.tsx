import type { Stats } from '../lib/stats';
import { SuperlativeStrip } from './SuperlativeStrip';
import { ScoreTimeline } from './ScoreTimeline';
import { ScoreBreakdownPanel } from './ScoreBreakdownPanel';
import { RacePredictionPanel } from './RacePredictionPanel';
import { ThemeChip } from './ThemeChip';
import { Card } from './ui';
import { playerSlug } from '../lib/playerProfile';

export function TheRaceTab({
  stats,
  onOpenPlayer,
}: {
  stats: Stats;
  onOpenPlayer?: (slug: string) => void;
}) {
  const ranked = [...stats.players]
    .filter((p) => p.songs > 0 || p.roundsVoted > 0)
    .sort((a, b) => b.pointsCounted - a.pointsCounted);
  const anyTheme = stats.players.some((p) => p.themeBonus !== 0);
  const themeReason = new Map(stats.themeOutcomes.map((o) => [o.playerId, o.reason]));
  const hasMultipleRounds = stats.roundsPlayed > 1;

  return (
    <>
      {anyTheme && (
        <p className="theme-banner">
          <strong>This league adds a theme bonus.</strong> Each round is themed around one player;
          that player gets <span className="pos">+3</span> for winning their own round and{' '}
          <span className="neg">−3</span> for anything else, including not submitting. Music League
          doesn't apply this — this page does — so it is shown separately wherever a total appears.
        </p>
      )}
      <SuperlativeStrip
        stats={stats}
        labels={[
          'Most forfeited by not voting',
          'Most rounds skipped voting',
          'Broadest support base',
          'Most polarizing act',
        ]}
      />

      <Card title="Where it stands" wide>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th></th>
                <th>Player</th>
                <th className="num">Score</th>
                {anyTheme && <th className="num">Theme</th>}
                {hasMultipleRounds && <th className="num col-secondary">Per song</th>}
                {hasMultipleRounds && <th className="num col-secondary">Best round</th>}
                <th className="num col-secondary">↓ taken</th>
                {hasMultipleRounds && <th className="num col-secondary">Rounds voted</th>}
              </tr>
            </thead>
            <tbody>
              {ranked.map((p, i) => {
                const best = p.bestSong?.effectiveNet ?? 0;
                return (
                  <tr key={p.playerId} className={p.pointsCounted < 0 ? 'row--neg' : undefined}>
                    <td className="dim">{i + 1}</td>
                    <td className="nowrap">
                      {onOpenPlayer ? (
                        <button className="linklike" onClick={() => onOpenPlayer(playerSlug(p.name))}>
                          <strong>{p.name}</strong>
                        </button>
                      ) : (
                        <strong>{p.name}</strong>
                      )}
                      {/* Beside the name, not in a column: under competitive scoring
                          this is why their total is low, and the Rounds voted column
                          is hidden both in a one-round season and on phones. */}
                      {stats.roundsPlayed > 0 && p.roundsVoted === 0 && (
                        <span className="tag tag--neg race-flag">didn't vote</span>
                      )}
                    </td>
                    <td className={`num ${p.pointsCounted < 0 ? 'neg' : 'pos'}`}>
                      {p.pointsCounted > 0 ? '+' : ''}
                      {p.pointsCounted}
                    </td>
                    {anyTheme && (
                      <td className="num">
                        <ThemeChip points={p.themeBonus} reason={themeReason.get(p.playerId)} compact />
                      </td>
                    )}
                    {hasMultipleRounds && (
                      <td className="num dim col-secondary">{p.songs > 0 ? p.avgPerSong.toFixed(1) : '—'}</td>
                    )}
                    {hasMultipleRounds && (
                      <td className="num dim col-secondary">{best > 0 ? `+${best}` : best || '—'}</td>
                    )}
                    <td className="num dim col-secondary">{p.downvotesReceived || '—'}</td>
                    {hasMultipleRounds && (
                      <td className="num dim col-secondary">
                        {p.roundsVoted ? `${p.roundsVoted} of ${stats.roundsPlayed}` : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <RacePredictionPanel stats={stats} />
      <ScoreTimeline stats={stats} />
      <ScoreBreakdownPanel stats={stats} />
    </>
  );
}
