import { useMemo, useState } from 'react';
import type { Stats } from '../lib/stats';
import { buildPlayByPlay, type RoundChapter, type RoundTwist } from '../lib/recap';
import { SuperlativeStrip } from './SuperlativeStrip';
import { SongArt, SongLinks, SongPlayer, SongTags } from './SongMedia';
import { Card, Empty } from './ui';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Pick one comment left on the winning song — vote comments first, then
 *  standalone comments. Returns undefined when nothing was written. */
function winnerComment(
  winner: Stats['songs'][number],
  stats: Stats,
  nameOf: Map<string, string>,
): { text: string; author: string } | undefined {
  const voteComments = stats.league.votes
    .filter((v) => v.trackId === winner.trackId && v.roundId === winner.roundId && v.comment?.trim())
    .map((v) => ({ text: v.comment!.trim(), author: nameOf.get(v.voterId) ?? 'someone' }));

  const standAlone = stats.league.comments
    .filter((c) => c.trackId === winner.trackId && c.roundId === winner.roundId && c.text?.trim())
    .map((c) => ({ text: c.text.trim(), author: nameOf.get(c.authorId) ?? 'someone' }));

  const all = [...voteComments, ...standAlone];
  if (!all.length) return undefined;
  // Deterministic "random": pick based on track+round hash so it stays stable.
  const idx = (winner.trackId.charCodeAt(0) + winner.trackId.charCodeAt(1)) % all.length;
  return all[idx];
}

/* ------------------------------------------------------------------ *
 * Prose templates — turn chapter data into narrative sentences.
 * ------------------------------------------------------------------ */

function winnerSentence(chapter: RoundChapter, nameOf: Map<string, string>): string {
  const { winner } = chapter;
  if (!winner) return '';
  const submitter = nameOf.get(winner.submitterId ?? '') ?? 'Unknown';
  const pts = winner.effectiveNet;
  return `${submitter}'s "${winner.title}" won the round on ${pts > 0 ? '+' : ''}${pts} pts.`;
}

function twistSentence(twist: RoundTwist, nameOf: Map<string, string>): string {
  const submitter = nameOf.get(twist.song.submitterId ?? '') ?? 'Unknown';
  if (twist.wasForfeited) {
    return `"${twist.song.title}" (${submitter}) earned the highest raw score — ${twist.song.upvotes} pts upvoted — but ${submitter} didn't vote, so none of it counted.`;
  }
  return `"${twist.song.title}" (${submitter}) had the highest raw score but fell behind after scoring adjustments.`;
}

/* ------------------------------------------------------------------ *
 * Chapter card
 * ------------------------------------------------------------------ */

function ChapterCard({
  chapter,
  nameOf,
  comment,
}: {
  chapter: RoundChapter;
  nameOf: Map<string, string>;
  comment?: { text: string; author: string };
}) {
  const { round, winner, twist, moments } = chapter;
  const lead = winner ? winnerSentence(chapter, nameOf) : '';
  const twistProse = twist ? twistSentence(twist, nameOf) : '';

  return (
    <Card wide>
      <div className="chapter">
        <header className="chapter__head">
          <div>
            <span className="dim small">Round {round.round.sequence}</span>
            <h3 className="chapter__title">{round.round.name}</h3>
          </div>
          <div className="dim small chapter__meta">
            {round.songCount} songs · {round.voters.length} voter{round.voters.length !== 1 ? 's' : ''}
          </div>
        </header>

        {!round.hasVotes ? (
          <Empty>No votes recorded for this round.</Empty>
        ) : (
          <>
            {lead && <p className="chapter__lead">{lead}</p>}
            {twistProse && (
              <p className="chapter__twist">
                <span className="chapter__twist-icon">⚠</span> {twistProse}
              </p>
            )}
            {moments.length > 0 && (
              <ul className="chapter__moments">
                {moments.map((m, i) => (
                  <li key={i} className="chapter__moment">
                    {m.headline}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {winner && (
          <div className="chapter__winner-row">
            <div className="chapter__winner-art">
              <SongArt title={winner.title} spotifyId={winner.spotifyId} size="sm" />
            </div>
            <div className="chapter__winner-body">
              <span className="chapter__winner-badge">🏆 Winner</span>
              <strong>{winner.title || 'Untitled'}</strong>
              {winner.artist && <span className="dim"> — {winner.artist}</span>}
              <span className="dim small">
                {' '}
                · {nameOf.get(winner.submitterId ?? '') ?? 'unknown'}
                {' · '}
                {winner.effectiveNet > 0 ? '+' : ''}{winner.effectiveNet} pts
              </span>
              <SongTags year={winner.year} obscurity={winner.obscurity} artist={winner.artist} durationMs={winner.durationMs} cover={winner.cover} />
            </div>
            <div className="chapter__winner-links">
              <SongLinks title={winner.title} artist={winner.artist} spotifyId={winner.spotifyId} />
              {winner.spotifyId && (
                <SongPlayer title={winner.title} spotifyId={winner.spotifyId} compact />
              )}
            </div>
          </div>
        )}
        {comment && (
          <blockquote className="chapter__quote">
            <p>"{comment.text}"</p>
            <footer className="dim small">— {comment.author}</footer>
          </blockquote>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Song list inside a chapter (separate so ChapterCard stays lean)
 * ------------------------------------------------------------------ */

function ChapterSongs({
  chapter,
  nameOf,
  allSongs,
}: {
  chapter: RoundChapter;
  nameOf: Map<string, string>;
  allSongs: Stats['songs'];
}) {
  const songs = useMemo(
    () =>
      allSongs
        .filter((s) => s.roundId === chapter.round.round.id)
        .sort((a, b) => b.effectiveNet - a.effectiveNet),
    [allSongs, chapter.round.round.id],
  );

  if (!songs.length || !chapter.round.hasVotes) return null;

  return (
    <Card wide>
      <div className="chapter-songs">
        <div className="chapter-songs__list">
          {songs.map((s, i) => (
            <div
              key={s.trackId}
              className={`chapter-song${s.forfeited ? ' chapter-song--forfeited' : ''}`}
            >
              <span className="chapter-song__rank dim">{i + 1}</span>
              <div className="chapter-song__art">
                <SongArt title={s.title} spotifyId={s.spotifyId} size="sm" />
              </div>
              <div className="chapter-song__body">
                <strong>{s.title || 'Untitled'}</strong>
                {s.artist && <span className="dim"> — {s.artist}</span>}
                <div className="dim small">{nameOf.get(s.submitterId ?? '') ?? 'unknown'}</div>
                <SongTags year={s.year} obscurity={s.obscurity} artist={s.artist} durationMs={s.durationMs} cover={s.cover} />
              </div>
              <div className="chapter-song__score">
                {s.forfeited ? (
                  <span className="dim small" title="forfeited — submitter did not vote">
                    <s className="neg">{s.upvotes > 0 ? `+${s.upvotes}` : s.upvotes}</s>
                    <span className="neg"> ff</span>
                  </span>
                ) : (
                  <strong className={s.effectiveNet > 0 ? 'pos' : s.effectiveNet < 0 ? 'neg' : 'dim'}>
                    {s.effectiveNet > 0 ? '+' : ''}{s.effectiveNet}
                  </strong>
                )}
                <div className="dim small">+{s.upvotes}/−{s.downvotes}</div>
              </div>
              <div className="chapter-song__links">
                <SongLinks title={s.title} artist={s.artist} spotifyId={s.spotifyId} />
                {s.spotifyId && <SongPlayer title={s.title} spotifyId={s.spotifyId} compact />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Chapter group — owns the expand/collapse state for the song list
 * ------------------------------------------------------------------ */

function ChapterGroup({
  chapter,
  nameOf,
  stats,
}: {
  chapter: RoundChapter;
  nameOf: Map<string, string>;
  stats: Stats;
}) {
  const [expanded, setExpanded] = useState(false);
  const comment = chapter.winner
    ? winnerComment(chapter.winner, stats, nameOf)
    : undefined;
  const songCount = stats.songs.filter((s) => s.roundId === chapter.round.round.id).length;

  return (
    <div className="chapter-group">
      <ChapterCard chapter={chapter} nameOf={nameOf} comment={comment} />
      {chapter.round.hasVotes && songCount > 0 && (
        <>
          <div style={{ textAlign: 'center', margin: '-6px 0 8px' }}>
            <button
              className="seg__btn"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? `Hide all ${songCount} songs ↑` : `Show all ${songCount} songs ↓`}
            </button>
          </div>
          {expanded && (
            <ChapterSongs chapter={chapter} nameOf={nameOf} allSongs={stats.songs} />
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tab root
 * ------------------------------------------------------------------ */

export function PlayByPlayTab({ stats }: { stats: Stats }) {
  const chapters = useMemo(() => buildPlayByPlay(stats), [stats]);
  const nameOf = useMemo(
    () => new Map(stats.players.map((p) => [p.playerId, p.name])),
    [stats.players],
  );

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

      {chapters.map((chapter) => (
        <ChapterGroup
          key={chapter.round.round.id}
          chapter={chapter}
          nameOf={nameOf}
          stats={stats}
        />
      ))}
    </>
  );
}
