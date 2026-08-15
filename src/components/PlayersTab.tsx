import { useMemo, useState } from 'react';
import type { Stats } from '../lib/stats';
import {
  computeEraProfiles,
  findDoubleAgents,
  eraBand,
  describeArchetype,
} from '../lib/taste';
import { SuperlativeStrip } from './SuperlativeStrip';
import { PlayersPanel, PlayerProfiles } from './PlayersPanel';
import { SongArt, SongLinks, SongPlayer } from './SongMedia';
import { Card, Empty, n1 } from './ui';

function EraSpectrum({ stats }: { stats: Stats }) {
  const profiles = useMemo(() => computeEraProfiles(stats), [stats]);
  if (!profiles.length) return null;

  const years = profiles.map((p) => p.blendYear).filter((y): y is number => y !== undefined);
  if (!years.length) return null;

  const minY = Math.min(...years) - 2;
  const maxY = Math.max(...years) + 2;
  const range = maxY - minY || 1;
  const pct = (y: number) => `${Math.round(((y - minY) / range) * 94)}%`;

  return (
    <Card title="The era spectrum" subtitle="Blended from submissions (×2) and upvotes (×1)." wide>
      <div className="era-spectrum">
        {profiles
          .filter((p) => p.blendYear !== undefined)
          .map((p, i) => (
            <span
              key={p.playerId}
              className={`era-pin${i % 2 === 1 ? ' era-pin--low' : ''}`}
              style={{ left: pct(p.blendYear!) }}
              title={`${p.name}: blend ${Math.round(p.blendYear!)}`}
            >
              {p.name} {Math.round(p.blendYear!)}
            </span>
          ))}
      </div>
      <div className="era-axis">
        <span>🏺 Crate digger (pre-2000)</span>
        <span>📼 Y2K kid (2000–2009)</span>
        <span>📱 Algorithm native (2010+)</span>
      </div>
    </Card>
  );
}

function EraTable({ stats }: { stats: Stats }) {
  const profiles = useMemo(() => computeEraProfiles(stats), [stats]);
  const doubleAgentIds = useMemo(
    () => new Set(findDoubleAgents(profiles).map((p) => p.playerId)),
    [profiles],
  );

  if (!profiles.length) return null;

  const profileMap = new Map(profiles.map((p) => [p.playerId, p]));
  const ranked = [...stats.players]
    .filter((p) => p.songs > 0)
    .sort((a, b) => b.pointsCounted - a.pointsCounted);

  return (
    <Card title="Players" subtitle="Archetype blends submissions (×2) + upvotes (×1). Double agent = 13+ year gap." wide>
      <table className="t">
        <thead>
          <tr>
            <th></th>
            <th>Player</th>
            <th className="num">Score</th>
            <th className="num">Submits</th>
            <th className="num">Upvotes</th>
            <th className="num">Gap</th>
            <th>Archetype</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((p, i) => {
            const era = profileMap.get(p.playerId);
            const isDoubleAgent = doubleAgentIds.has(p.playerId);
            const band = era?.blendYear !== undefined ? eraBand(era.blendYear) : undefined;
            const sub = era?.submittedYear !== undefined ? Math.round(era.submittedYear) : undefined;
            const up = era?.upvotedYear !== undefined ? Math.round(era.upvotedYear) : undefined;
            const gap = era?.eraGap !== undefined ? Math.round(era.eraGap) : undefined;
            return (
              <tr key={p.playerId}>
                <td className="dim">{i + 1}</td>
                <td>
                  <strong>{p.name}</strong>
                </td>
                <td className={`num ${p.pointsCounted < 0 ? 'neg' : 'pos'}`}>
                  {p.pointsCounted > 0 ? '+' : ''}
                  {p.pointsCounted}
                </td>
                <td className="num dim">{sub ?? '—'}</td>
                <td className="num dim">{up ?? <span className="dim">—</span>}</td>
                <td className={`num ${gap !== undefined && gap >= 13 ? 'warn' : 'dim'}`}>
                  {gap !== undefined ? gap : '—'}
                </td>
                <td>
                  {band && (
                    <span className="tag">{describeArchetype(era?.blendYear)}</span>
                  )}
                  {isDoubleAgent && (
                    <span className="tag tag--warn" style={{ marginLeft: 4 }}>
                      🎭 double agent
                    </span>
                  )}
                  {p.roundsVoted === 0 && (
                    <span className="dim small"> · votes unknown</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

type Subtab = 'submissions' | 'votes-given' | 'votes-received';

function PlayerDetail({ stats, playerId }: { stats: Stats; playerId: string }) {
  const [subtab, setSubtab] = useState<Subtab>('submissions');
  const player = stats.players.find((p) => p.playerId === playerId);
  if (!player) return null;

  const nameOf = new Map(stats.players.map((p) => [p.playerId, p.name]));
  const songByTrack = new Map(stats.songs.map((s) => [s.trackId, s]));

  const mySongs = stats.songs
    .filter((s) => s.submitterId === playerId)
    .sort((a, b) => b.effectiveNet - a.effectiveNet);


  const myTrackIds = new Set(mySongs.map((s) => s.trackId));
  const votesReceived = stats.league.votes
    .filter((v) => myTrackIds.has(v.trackId) && v.voterId !== playerId);

  // Group votes received by voter
  const byVoter = new Map<string, { up: number; down: number }>();
  for (const v of votesReceived) {
    const cur = byVoter.get(v.voterId) ?? { up: 0, down: 0 };
    if (v.points > 0) cur.up += v.points;
    else if (v.points < 0) cur.down += -v.points;
    byVoter.set(v.voterId, cur);
  }

  const rounds = stats.rounds.filter((r) => r.hasVotes);

  return (
    <Card wide>
      <header style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong style={{ fontSize: 17 }}>{player.name}</strong>
          <span className={player.pointsCounted < 0 ? 'neg' : 'pos'}>
            {player.pointsCounted > 0 ? '+' : ''}
            {player.pointsCounted} pts
          </span>
          {player.roundsVoted === 0 && (
            <span className="tag tag--neg">never voted</span>
          )}
        </div>
      </header>

      <div className="subtabs">
        {(['submissions', 'votes-given', 'votes-received'] as Subtab[]).map((t) => (
          <button
            key={t}
            className={`subtab${subtab === t ? ' subtab--on' : ''}`}
            onClick={() => setSubtab(t)}
          >
            {t === 'submissions' ? 'Submissions' : t === 'votes-given' ? 'Votes given' : 'Votes received'}
          </button>
        ))}
      </div>

      {subtab === 'submissions' && (
        mySongs.length === 0 ? (
          <Empty>No submissions on record.</Empty>
        ) : (
          <div className="song-list">
            {mySongs.map((s) => (
              <article className="song-row" key={s.trackId}>
                <div className="song-row__art">
                  <SongArt title={s.title} spotifyId={s.spotifyId} size="sm" />
                </div>
                <div className="song-row__body">
                  <strong>{s.title || 'Untitled'}</strong>
                  {s.artist && <span className="dim"> — {s.artist}</span>}
                  <div className="dim small">{s.roundName}</div>
                  {s.forfeited && <span className="tag tag--neg">forfeited</span>}
                </div>
                <div className="song-row__score">
                  <strong className={s.effectiveNet < 0 ? 'neg' : s.effectiveNet > 0 ? 'pos' : 'dim'}>
                    {s.effectiveNet > 0 ? '+' : ''}{s.effectiveNet}
                  </strong>
                  <div className="dim small">+{s.upvotes}/−{s.downvotes}</div>
                </div>
                <div className="song-row__links">
                  <SongLinks title={s.title} artist={s.artist} spotifyId={s.spotifyId} />
                  {s.spotifyId && <SongPlayer title={s.title} spotifyId={s.spotifyId} compact />}
                </div>
              </article>
            ))}
            {mySongs.length === 0 && (
              <Empty>No submissions in this league.</Empty>
            )}
          </div>
        )
      )}

      {subtab === 'votes-given' && (
        player.roundsVoted === 0 ? (
          <Empty>
            {player.name} never voted — all earned points were forfeited.
          </Empty>
        ) : (
          <div className="vote-rounds">
            {rounds.map((r) => {
              const roundVotes = stats.league.votes.filter(
                (v) => v.voterId === playerId && v.roundId === r.round.id,
              );
              return (
                <div className="vote-round" key={r.round.id}>
                  <div className="vote-round__name">{r.round.name}</div>
                  <div className="vote-round__chips">
                    {roundVotes.length === 0 ? (
                      <span className="chip chip--zero">did not vote</span>
                    ) : (
                      roundVotes
                        .filter((v) => v.points !== 0)
                        .sort((a, b) => b.points - a.points)
                        .map((v) => {
                          const song = songByTrack.get(v.trackId);
                          return (
                            <span
                              key={v.trackId}
                              className={v.points > 0 ? 'chip chip--up' : 'chip chip--down'}
                            >
                              {v.points > 0 ? '+' : ''}{v.points} {song?.title ?? v.trackId}
                            </span>
                          );
                        })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {subtab === 'votes-received' && (
        byVoter.size === 0 ? (
          <Empty>No vote data for {player.name}'s songs.</Empty>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>Voter</th>
                <th className="num">↑ Up</th>
                <th className="num">↓ Down</th>
                <th className="num">Net</th>
              </tr>
            </thead>
            <tbody>
              {[...byVoter.entries()]
                .map(([id, v]) => ({ id, name: nameOf.get(id) ?? id, ...v, net: v.up - v.down }))
                .sort((a, b) => b.net - a.net)
                .map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className="num pos">{r.up > 0 ? `+${r.up}` : '—'}</td>
                    <td className="num neg">{r.down > 0 ? `−${r.down}` : '—'}</td>
                    <td className={`num ${r.net >= 0 ? 'pos' : 'neg'}`}>
                      {r.net > 0 ? '+' : ''}{r.net}
                    </td>
                  </tr>
                ))}
              {stats.players
                .filter((p) => p.roundsVoted === 0 && p.playerId !== playerId)
                .map((p) => (
                  <tr key={p.playerId} className="dim">
                    <td>{p.name}</td>
                    <td className="num">—</td>
                    <td className="num">—</td>
                    <td className="num dim">never voted</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )
      )}
    </Card>
  );
}

export function PlayersTab({ stats }: { stats: Stats }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ranked = useMemo(
    () =>
      [...stats.players]
        .filter((p) => p.songs > 0 || p.roundsVoted > 0)
        .sort((a, b) => b.pointsCounted - a.pointsCounted),
    [stats.players],
  );

  return (
    <>
      <SuperlativeStrip
        stats={stats}
        labels={[
          'Most generous spread',
          'Biggest stacker',
          'Most mainstream taste',
          'Biggest contrarian',
        ]}
      />

      <EraSpectrum stats={stats} />
      <EraTable stats={stats} />

      <Card title="Select a player" wide>
        <div className="player-picker">
          {ranked.map((p) => (
            <button
              key={p.playerId}
              className={`player-btn${selectedId === p.playerId ? ' player-btn--on' : ''}`}
              onClick={() =>
                setSelectedId(selectedId === p.playerId ? null : p.playerId)
              }
            >
              <span className="player-btn__name">{p.name}</span>
              <span className={`player-btn__pts ${p.pointsCounted < 0 ? 'neg' : 'pos'}`}>
                {p.pointsCounted > 0 ? '+' : ''}{n1(p.pointsCounted)}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {selectedId && <PlayerDetail stats={stats} playerId={selectedId} />}

      <PlayersPanel stats={stats} />
      <PlayerProfiles stats={stats} />
    </>
  );
}
