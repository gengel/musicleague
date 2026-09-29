/**
 * The per-round theme bonus.
 *
 * Each round of league 2 is themed around one player, named in the round
 * title ("Now That's What I Call Bob"). That player gains points for winning
 * their own round and loses them otherwise. Music League does not compute
 * this — the dashboard does — so it is applied here, on top of the ordinary
 * scoring, and always shown with the reason next to it.
 *
 * This module is pure and independent of stats.ts: it takes the minimum it
 * needs (rounds, submissions, and each song's counted score and rank) so it
 * can be unit-tested against small fixtures and reused by the CLI.
 */
import type { Player, Round } from './types';
import { identityKey } from './types';

export interface ThemeRules {
  source: 'title';
  win: number;
  lose: number;
  skip: number;
  overrides: Record<string, string>;
}

export type ThemeVerdict = 'won' | 'lost' | 'skipped';

export interface ThemeOutcome {
  roundId: string;
  roundSequence: number;
  roundName: string;
  playerId: string;
  playerName: string;
  outcome: ThemeVerdict;
  /** The signed adjustment: rules.win / rules.lose / rules.skip. */
  points: number;
  /** Human-readable reason, always shown, never only in a tooltip. */
  reason: string;
  /** The theme player's counted score in their round, when they submitted. */
  score?: number;
  /** Their finishing rank (1 = first), when the round has results. */
  rank?: number;
  /** Other players tied with them for first, if any. */
  tiedWith?: string[];
}

/** The minimum a song contributes to a theme decision. */
export interface ThemeSong {
  roundId: string;
  submitterId?: string;
  /** The score the league counted — the same figure round rank uses. */
  effectiveNet: number;
  /** 1-based rank within the round, or 0 for an unranked round. */
  roundRank: number;
}

/**
 * Resolves the theme player for a round.
 *
 * An override wins. Otherwise each player's full name and first name are
 * matched as whole words against the title, case-insensitively, preferring
 * the longest match. Exactly one player must match; none or several is
 * reported as unresolved rather than guessed, because a title like
 * "Caroline's Choice" in a league with two Carolines cannot be attributed.
 */
export function resolveThemePlayer(
  round: Round,
  players: Player[],
  rules: ThemeRules,
): { playerId?: string; candidates: string[] } {
  const override = rules.overrides[round.name];
  if (override) {
    const key = identityKey(override);
    const match = players.find(
      (p) => identityKey(p.name) === key || identityKey(p.name.split(/\s+/)[0]) === key,
    );
    if (match) return { playerId: match.id, candidates: [match.name] };
    return { playerId: undefined, candidates: [] };
  }

  const title = round.name;
  const hits: { player: Player; length: number }[] = [];
  for (const player of players) {
    if (player.placeholder) continue;
    const full = player.name.trim();
    const first = full.split(/\s+/)[0];
    // Longest candidate token first, so "Caroline Cone" beats "Caroline".
    for (const candidate of [full, first]) {
      if (matchesWholeWord(title, candidate)) {
        hits.push({ player, length: candidate.length });
        break;
      }
    }
  }

  if (hits.length === 0) return { playerId: undefined, candidates: [] };

  // Prefer the single longest match; only ambiguous if two of equal length.
  hits.sort((a, b) => b.length - a.length);
  const top = hits.filter((h) => h.length === hits[0].length);
  if (top.length === 1) return { playerId: top[0].player.id, candidates: [top[0].player.name] };
  return { playerId: undefined, candidates: top.map((h) => h.player.name) };
}

function matchesWholeWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Unicode-aware word boundaries: a name can contain digits (t33nwitch) or
  // an underscore (Go_BirdzDH), so bound on characters that are not part of a
  // handle rather than \b, which would split on the digits.
  return new RegExp(`(^|[^\\w])${escaped}([^\\w]|$)`, 'i').test(haystack);
}

/**
 * Computes the theme outcome for one round, given its resolved player and the
 * round's songs. Returns undefined for a round with no results, so a pending
 * round is not scored.
 */
export function computeThemeOutcome(
  round: Round,
  playerId: string,
  playerName: string,
  songs: ThemeSong[],
  rules: ThemeRules,
  hasVotes: boolean,
  nameOf: (id: string) => string,
): ThemeOutcome | undefined {
  if (!hasVotes) return undefined;
  const roundSongs = songs.filter((s) => s.roundId === round.id);
  const mine = roundSongs.filter((s) => s.submitterId === playerId);

  const outcomeBase = {
    roundId: round.id,
    roundSequence: round.sequence,
    roundName: round.name,
    playerId,
    playerName,
  };

  if (mine.length === 0) {
    return {
      ...outcomeBase,
      outcome: 'skipped',
      points: rules.skip,
      reason: `Submitted nothing to their own round, ${round.name}`,
    };
  }

  // Judge on the score the league counted, which is what round rank uses.
  const topScore = Math.max(...roundSongs.map((s) => s.effectiveNet));
  const myBest = mine.reduce((a, b) => (b.effectiveNet > a.effectiveNet ? b : a));
  const won = myBest.effectiveNet === topScore;

  const winners = roundSongs.filter((s) => s.effectiveNet === topScore);
  const tiedWith =
    won && winners.length > 1
      ? winners
          .map((s) => s.submitterId)
          .filter((id): id is string => Boolean(id) && id !== playerId)
          .map(nameOf)
      : undefined;

  const place = ordinal(myBest.roundRank);
  const of = roundSongs.length;
  const tieNote = tiedWith && tiedWith.length ? ` (tied with ${tiedWith.join(', ')})` : '';

  return {
    ...outcomeBase,
    outcome: won ? 'won' : 'lost',
    points: won ? rules.win : rules.lose,
    reason: won
      ? `Won their own round, ${round.name} (${myBest.effectiveNet} pts, ${place} of ${of})${tieNote}`
      : `Did not win their own round, ${round.name} (${myBest.effectiveNet} pts, ${place} of ${of})`,
    score: myBest.effectiveNet,
    rank: myBest.roundRank,
    tiedWith,
  };
}

function ordinal(n: number): string {
  if (n <= 0) return `${n}`;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
