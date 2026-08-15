import { useMemo, useState } from 'react';
import { embeddedGenres } from 'virtual:league-data';
import type { Stats } from '../lib/stats';
import {
  computeEraProfiles,
  findDoubleAgents,
  eraBand,
  describeArchetype,
  computePlayerTasteProfiles,
} from '../lib/taste';
import { obscurityBand } from '../lib/obscurity';
import { SuperlativeStrip } from './SuperlativeStrip';
import { PlayersPanel } from './PlayersPanel';
import { SongArt, SongLinks, SongPlayer, SongTags } from './SongMedia';
import { Card, Empty, n1, n2, pct0, ScoreParts } from './ui';

const POP_LABEL: Record<string, string> = {
  'deep cut': '< 20k', 'niche': '20–100k', 'known': '100–500k', 'popular': '500k–1M', 'hit': '> 1M',
};

function eraBucketLabel(year: number): string {
  if (year < 1990) return 'pre-1990';
  if (year < 2000) return '1990s';
  if (year < 2010) return '2000s';
  if (year < 2020) return '2010s';
  return '2020s';
}

function genresFor(artist: string): string[] {
  const full = embeddedGenres[artist.toLowerCase()];
  if (full?.length) return full;
  for (const part of artist.split(/,|feat\.|ft\.|&/i).map((s) => s.trim().toLowerCase())) {
    const hit = embeddedGenres[part];
    if (hit?.length) return hit;
  }
  return [];
}

function EraSpectrum({ stats }: { stats: Stats }) {
  const profiles = useMemo(() => computeEraProfiles(stats), [stats]);
  if (!profiles.length) return null;

  // Sort left-to-right (oldest → newest) so alternating row assignment
  // naturally distributes visually adjacent pins across rows.
  const dated = profiles
    .filter((p): p is typeof p & { blendYear: number } => p.blendYear !== undefined)
    .sort((a, b) => a.blendYear - b.blendYear);
  if (!dated.length) return null;

  const years = dated.map((p) => p.blendYear);
  const minY = Math.min(...years) - 2;
  const maxY = Math.max(...years) + 2;
  const range = maxY - minY || 1;
  const pct = (y: number) => `${Math.round(((y - minY) / range) * 96)}%`;

  return (
    <Card title="The era spectrum" subtitle="Blended from submissions (×2) and upvotes (×1)." wide>
      <div className="era-spectrum">
        {dated.map((p, i) => {
          // Ambiguous first names (e.g. two Carolines) get a surname initial;
          // otherwise use the first name alone to keep pins compact.
          const first = p.name.split(' ')[0];
          const collides = dated.some(
            (q) => q.playerId !== p.playerId && q.name.split(' ')[0] === first,
          );
          const parts = p.name.split(' ');
          const label = collides && parts.length > 1 ? `${first} ${parts[1][0]}.` : first;
          return (
            <span
              key={p.playerId}
              className={`era-pin era-pin--row${i % 3}`}
              style={{ left: pct(p.blendYear) }}
              title={`${p.name}: blend ${Math.round(p.blendYear)}`}
            >
              {label} {Math.round(p.blendYear)}
            </span>
          );
        })}
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
            <th className="num">Avg pop</th>
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
            const popLabel = era?.avgObscurity !== undefined
              ? obscurityBand(era.avgObscurity, 'lastfm-listeners')
              : undefined;
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
                <td className="num dim" title={era?.avgObscurity ? `${Math.round(era.avgObscurity).toLocaleString()} avg listeners` : undefined}>
                  {popLabel ?? '—'}
                </td>
                <td className="archetype-col">
                  <div className="archetype-cell">
                    {band && (
                      <span className="tag">{describeArchetype(era?.blendYear)}</span>
                    )}
                    {isDoubleAgent && (
                      <span className="tag tag--warn" title="Submits from one era, votes for another (13+ yr gap)">🎭 double agent</span>
                    )}
                    {p.roundsVoted === 0 && (
                      <span className="dim small">votes unknown</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

type Subtab = 'submissions' | 'votes-given' | 'votes-received' | 'profile';

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
        {([
          ['submissions', 'Submissions'],
          ['votes-given', 'Votes given'],
          ['votes-received', 'Votes received'],
          ['profile', 'Profile'],
        ] as [Subtab, string][]).map(([t, label]) => (
          <button
            key={t}
            className={`subtab${subtab === t ? ' subtab--on' : ''}`}
            onClick={() => setSubtab(t)}
          >
            {label}
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
                  <SongTags year={s.year} obscurity={s.obscurity} artist={s.artist} durationMs={s.durationMs} cover={s.cover} />
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
          <Empty>{player.name} never voted — all earned points were forfeited.</Empty>
        ) : (() => {
          // Genre and era breakdowns of upvotes cast
          const upvotes = stats.league.votes.filter(
            (v) => v.voterId === playerId && v.points > 0,
          );
          const genrePts = new Map<string, number>();
          const eraPts = new Map<string, number>();
          for (const v of upvotes) {
            const song = songByTrack.get(v.trackId);
            if (!song) continue;
            for (const g of genresFor(song.artist)) {
              genrePts.set(g, (genrePts.get(g) ?? 0) + v.points);
            }
            if (song.year !== undefined) {
              const era = eraBucketLabel(song.year);
              eraPts.set(era, (eraPts.get(era) ?? 0) + v.points);
            }
          }
          const genreRows = [...genrePts.entries()].sort((a, b) => b[1] - a[1]);
          const eraRows = [...eraPts.entries()].sort((a, b) => b[1] - a[1]);
          const maxG = genreRows[0]?.[1] ?? 1;
          const maxE = eraRows[0]?.[1] ?? 1;

          return (
            <>
              {(genreRows.length > 0 || eraRows.length > 0) && (
                <div className="vote-breakdowns">
                  {genreRows.length > 0 && (
                    <div className="vote-breakdown">
                      <div className="vote-breakdown__title dim small">Upvotes by genre</div>
                      {genreRows.map(([g, pts]) => (
                        <div key={g} className="vote-breakdown__row">
                          <span className="vote-breakdown__label">{g}</span>
                          <div className="vote-breakdown__bar-wrap">
                            <div className="vote-breakdown__bar" style={{ width: `${Math.round((pts / maxG) * 100)}%` }} />
                          </div>
                          <span className="vote-breakdown__pts dim">+{pts}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {eraRows.length > 0 && (
                    <div className="vote-breakdown">
                      <div className="vote-breakdown__title dim small">Upvotes by era</div>
                      {eraRows.map(([era, pts]) => (
                        <div key={era} className="vote-breakdown__row">
                          <span className="vote-breakdown__label">{era}</span>
                          <div className="vote-breakdown__bar-wrap">
                            <div className="vote-breakdown__bar" style={{ width: `${Math.round((pts / maxE) * 100)}%` }} />
                          </div>
                          <span className="vote-breakdown__pts dim">+{pts}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
            </>
          );
        })()
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

      {subtab === 'profile' && (() => {
        const taste = computePlayerTasteProfiles(stats, embeddedGenres)
          .find((t) => t.playerId === playerId);

        const topFan = [...stats.pairs]
          .filter((p) => p.targetId === playerId && p.opportunities >= 1 && p.upvotes > 0)
          .sort((a, b) => b.netAffinity - a.netAffinity || b.upvotes - a.upvotes)[0];
        const coldest = [...stats.pairs]
          .filter((p) => p.targetId === playerId && p.songsAvailable >= 2)
          .sort((a, b) => a.netAffinity - b.netAffinity || b.songsAvailable - a.songsAvailable)[0];
        const crush = [...stats.pairs]
          .filter((p) => p.voterId === playerId && p.upvotes > 0)
          .sort((a, b) => b.netAffinity - a.netAffinity || b.upvotes - a.upvotes)[0];

        const sentiment = (p: (typeof stats.pairs)[0]) => {
          const pts = (v: number) => `${n1(v)} pt${v === 1 ? '' : 's'}`;
          if (p.upvotes === 0 && p.downvotes === 0) return `never voted on their songs, ${p.songsAvailable} chances`;
          if (p.downvotes === 0) return `${pts(p.upvotes)}, ${n2(p.affinity)}× expected`;
          if (p.upvotes === 0) return `${pts(p.downvotes)} of downvotes, never a point given`;
          return `net ${p.net > 0 ? '+' : ''}${n1(p.net)} — ${n1(p.upvotes)} up, ${n1(p.downvotes)} down`;
        };

        return (
          <div>
            <div className="profile__parts" style={{ marginBottom: 12 }}>
              <ScoreParts breakdown={player.breakdown} showTotal={false} />
            </div>
            <dl>
              {player.bestSong && (
                <div><dt>Best song</dt><dd>{player.bestSong.title} <span className="dim">— {n1(player.bestSong.effectiveNet)} pts, {player.bestSong.roundName}</span></dd></div>
              )}
              {player.worstSong && (
                <div><dt>Worst song</dt><dd>{player.worstSong.title} <span className="dim">— {n1(player.worstSong.effectiveNet)} pts, {player.worstSong.roundName}</span></dd></div>
              )}
              <div>
                <dt>Biggest fan</dt>
                <dd>{topFan ? <>{nameOf.get(topFan.voterId)} <span className="dim">{sentiment(topFan)}</span></> : <span className="dim">nobody yet</span>}</dd>
              </div>
              <div>
                <dt>Least impressed</dt>
                <dd>{coldest ? <>{nameOf.get(coldest.voterId)} <span className="dim">{sentiment(coldest)}</span></> : <span className="dim">—</span>}</dd>
              </div>
              <div>
                <dt>Their own favourite</dt>
                <dd>{crush ? <>{nameOf.get(crush.targetId)} <span className="dim">{sentiment(crush)}</span></> : <span className="dim">—</span>}</dd>
              </div>
              <div>
                <dt>Voting style</dt>
                <dd>
                  {player.roundsVoted ? (
                    <span className="dim">
                      {n1(player.avgSongsVotedPer)} songs a round at {n1(player.avgPointsPerVote)} pts each
                      {player.tasteAlignment !== undefined && ` · ${pct0(player.tasteAlignment)} taste alignment`}
                      {player.roundsMissedVoting > 0 && <span className="neg"> · skipped {player.roundsMissedVoting}</span>}
                    </span>
                  ) : <span className="neg">never voted</span>}
                </dd>
              </div>
              {taste?.submitGenre && (
                <div>
                  <dt>Genre</dt>
                  <dd><span className="dim">
                    {taste.submitGenre} (sub){taste.voteGenre && taste.voteGenre !== taste.submitGenre && ` · ${taste.voteGenre} (vote)`}
                  </span></dd>
                </div>
              )}
              {taste?.submitPopBand && (
                <div>
                  <dt>Popularity</dt>
                  <dd><span className="dim">
                    {POP_LABEL[taste.submitPopBand]} (sub){taste.votePopBand && taste.votePopBand !== taste.submitPopBand && ` · ${POP_LABEL[taste.votePopBand]} (vote)`}
                  </span></dd>
                </div>
              )}
            </dl>
          </div>
        );
      })()}
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
    </>
  );
}
