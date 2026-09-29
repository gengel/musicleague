import type { Stats } from '../lib/stats';
import { SuperlativeStrip } from './SuperlativeStrip';
import { ScoreTimeline } from './ScoreTimeline';
import { ScoreBreakdownPanel } from './ScoreBreakdownPanel';
import { RacePredictionPanel } from './RacePredictionPanel';
import { ThemeChip } from './ThemeChip';
import { Card } from './ui';

export function TheRaceTab({ stats }: { stats: Stats }) {
  const ranked = [...stats.players]
    .filter((p) => p.songs > 0 || p.roundsVoted > 0)
    .sort((a, b) => b.pointsCounted - a.pointsCounted);
  const anyTheme = stats.players.some((p) => p.themeBonus !== 0);
  const themeReason = new Map(stats.themeOutcomes.map((o) => [o.playerId, o.reason]));

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
        <table className="t">
          <thead>
            <tr>
              <th></th>
              <th>Player</th>
              <th className="num">Score</th>
              {anyTheme && <th className="num">Theme</th>}
              <th className="num">Per song</th>
              <th className="num">Best round</th>
              <th className="num">↓ taken</th>
              <th className="num">Rounds voted</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((p, i) => {
              const best = p.bestSong?.effectiveNet ?? 0;
              return (
                <tr key={p.playerId} className={p.pointsCounted < 0 ? 'row--neg' : undefined}>
                  <td className="dim">{i + 1}</td>
                  <td>
                    <strong>{p.name}</strong>
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
                  <td className="num dim">{p.songs > 0 ? p.avgPerSong.toFixed(1) : '—'}</td>
                  <td className="num dim">{best > 0 ? `+${best}` : best || '—'}</td>
                  <td className="num dim">{p.downvotesReceived || '—'}</td>
                  <td className="num dim">
                    {p.roundsVoted
                      ? `${p.roundsVoted} of ${stats.roundsPlayed}`
                      : <span className="neg">never voted</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <RacePredictionPanel stats={stats} />
      <ScoreTimeline stats={stats} />
      <ScoreBreakdownPanel stats={stats} />
    </>
  );
}
