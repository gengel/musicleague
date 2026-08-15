import type { Stats } from '../lib/stats';
import { SuperlativeStrip } from './SuperlativeStrip';
import { Participation } from './Participation';
import { RoundsPanel } from './SongsPanel';
import { Card } from './ui';

export function PlayByPlayTab({ stats }: { stats: Stats }) {
  const playedRounds = stats.rounds.filter((r) => r.hasVotes);

  return (
    <>
      <SuperlativeStrip
        stats={stats}
        labels={[
          'Highest-scoring round',
          'Lowest-scoring round',
          'Best turnout',
          'Most points lost in a round',
        ]}
      />

      {playedRounds.map((r) => {
        const songs = stats.songs
          .filter((s) => s.roundId === r.round.id)
          .sort((a, b) => b.effectiveNet - a.effectiveNet);
        const winner = songs[0];
        const forfeited = songs.filter((s) => s.forfeited && s.upvotes > 0);
        const nameOf = new Map(stats.players.map((p) => [p.playerId, p.name]));

        return (
          <Card key={r.round.id} wide>
            <div className="chapter">
              <header className="chapter__head">
                <div>
                  <span className="dim small">Round {r.round.sequence} · {r.round.name}</span>
                  <div className="chapter__winner">
                    {winner ? (
                      <>
                        🏆 <strong>{winner.title}</strong>
                        {winner.artist && <span className="dim"> — {winner.artist}</span>}
                        <span className="dim small"> ({nameOf.get(winner.submitterId ?? '') ?? 'unknown'}, {winner.effectiveNet} pts)</span>
                      </>
                    ) : (
                      <span className="dim">No winner recorded</span>
                    )}
                  </div>
                </div>
                <div className="dim small" style={{ textAlign: 'right' }}>
                  {songs.length} songs · {r.voters.length} voters
                </div>
              </header>

              {forfeited.length > 0 && (
                <p className="chapter__twist dim small">
                  ⚠ Forfeited:{' '}
                  {forfeited
                    .map((s) => `${s.title} (${s.upvotes} pts, ${nameOf.get(s.submitterId ?? '') ?? 'unknown'})`)
                    .join('; ')}
                </p>
              )}

              <div className="chapter__songs">
                {songs.slice(0, 5).map((s) => (
                  <div key={s.trackId} className={`chapter__song${s.forfeited ? ' chapter__song--forfeited' : ''}`}>
                    <span className="chapter__song-title">{s.title || 'Untitled'}</span>
                    <span className={`chapter__song-score ${s.effectiveNet < 0 ? 'neg' : s.effectiveNet > 0 ? 'pos' : 'dim'}`}>
                      {s.forfeited ? <s>{s.upvotes}</s> : (s.effectiveNet > 0 ? `+${s.effectiveNet}` : s.effectiveNet)}
                    </span>
                  </div>
                ))}
                {songs.length > 5 && (
                  <div className="dim small">… {songs.length - 5} more</div>
                )}
              </div>
            </div>
          </Card>
        );
      })}

      <RoundsPanel stats={stats} />
      <Participation stats={stats} />
    </>
  );
}
