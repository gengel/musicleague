import { useMemo, useState } from 'react';
import { playerSlug as playerSlugOf } from '../lib/playerProfile';
import type { Stats } from '../lib/stats';
import {
  computeEraProfiles,
  findDoubleAgents,
  eraBand,
  describeArchetype,
  
} from '../lib/taste';
import { obscurityBand } from '../lib/obscurity';
import { SuperlativeStrip } from './SuperlativeStrip';
import { NameAvatar } from './PlayerAvatar';
import { Card, n1, } from './ui';




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



export function PlayersTab({
  stats,
  onOpenPlayer,
}: {
  stats: Stats;
  onOpenPlayer?: (slug: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ranked = useMemo(
    () =>
      [...stats.players]
        .filter((p) => p.songs > 0 || p.roundsVoted > 0)
        .sort((a, b) => b.pointsCounted - a.pointsCounted),
    [stats.players],
  );
  // Each player's best few covers, for their avatar mosaic.
  const topSongIds = useMemo(() => {
    const by = new Map<string, (string | undefined)[]>();
    const bySubmitter = new Map<string, typeof stats.songs>();
    for (const s of stats.songs) {
      if (!s.submitterId) continue;
      const list = bySubmitter.get(s.submitterId) ?? [];
      list.push(s);
      bySubmitter.set(s.submitterId, list);
    }
    for (const [id, songs] of bySubmitter) {
      by.set(
        id,
        [...songs].sort((a, b) => b.effectiveNet - a.effectiveNet).slice(0, 4).map((s) => s.spotifyId),
      );
    }
    return by;
  }, [stats.songs]);

  return (
    <>
      <Card
        title="Players"
        subtitle={onOpenPlayer ? 'Tap a player for their full profile — submissions, votes, taste, and league history.' : undefined}
        wide
      >
        <div className="player-picker">
          {ranked.map((p) => (
            <button
              key={p.playerId}
              className={`player-btn${selectedId === p.playerId ? ' player-btn--on' : ''}`}
              onClick={() =>
                onOpenPlayer
                  ? onOpenPlayer(playerSlugOf(p.name))
                  : setSelectedId(selectedId === p.playerId ? null : p.playerId)
              }
            >
              <NameAvatar id={p.playerId} name={p.name} spotifyIds={topSongIds.get(p.playerId) ?? []} size={26} />
              <span className="player-btn__name">{p.name}</span>
              <span className={`player-btn__pts ${p.pointsCounted < 0 ? 'neg' : 'pos'}`}>
                {p.pointsCounted > 0 ? '+' : ''}{n1(p.pointsCounted)}
              </span>
            </button>
          ))}
        </div>
      </Card>


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
    </>
  );
}
