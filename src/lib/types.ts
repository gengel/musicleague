/**
 * Canonical data model for a parsed Music League league.
 *
 * The upstream export is deliberately loose: column headers have changed
 * across export generations, votes may be withheld for privacy, and
 * submitters can be anonymised. Everything downstream of the parser works
 * against these types, so the messiness stays contained in parse.ts.
 */

export interface Round {
  id: string;
  /** Spotify playlist for the round, when the export carries one. */
  playlistUrl?: string;
  /** 1-based position in the league. Used for ordering everywhere. */
  sequence: number;
  name: string;
  description?: string;
  /** ISO-8601 UTC, when known. */
  votingClosed?: string;
  status?: string;
  /** True when the round was skipped / held and produced no results. */
  skipped: boolean;
}

export interface Submission {
  roundId: string;
  /** Bare Spotify track id, for linking and embedding. */
  spotifyId?: string;
  /** Stable key for the song within its round. */
  trackId: string;
  title: string;
  artist: string;
  /** Player id, or undefined when the export anonymised the submitter. */
  submitterId?: string;
  comment?: string;
}

export interface Vote {
  roundId: string;
  trackId: string;
  voterId: string;
  /**
   * Negative for downvotes. Zero-point rows are kept as they arrive: they
   * still evidence that the player took part in the round.
   */
  points: number;
  comment?: string;
}

export interface Player {
  id: string;
  name: string;
  /** True for [Anonymous] / [Removed user] style placeholder identities. */
  placeholder: boolean;
}

export interface Comment {
  roundId: string;
  trackId: string;
  authorId: string;
  text: string;
}

export interface StandingRow {
  playerId: string;
  position: number;
  points: number;
  roundsPlayed?: number;
}

export interface League {
  name: string;
  rounds: Round[];
  submissions: Submission[];
  votes: Vote[];
  players: Player[];
  comments: Comment[];
  /** Official standings from the export, when present. */
  standings: StandingRow[];
  /** Non-fatal notes surfaced to the user (e.g. "vote breakdown hidden"). */
  warnings: string[];
}

/**
 * Placeholder identities the export substitutes for a real name.
 *
 * Matched precisely: anything fully wrapped in brackets is a placeholder,
 * plus a few bare spellings. A loose prefix match would misread a genuine
 * player or round called something like "Hidden Gems".
 */
export const PLACEHOLDER_NAME_PATTERNS = [
  /^\[[^\]]*\]$/,
  /^anonymous$/i,
  /^unknown$/i,
  /^removed user$/i,
  /^hidden until voting closes$/i,
];

export function isPlaceholderName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  return PLACEHOLDER_NAME_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * Identity key for a person, round or song title.
 *
 * Only case and whitespace are normalised. Punctuation and emoji are
 * significant: leagues really do contain "Dave" and "Dave 🎸" as two
 * different people, and stripping non-alphanumerics would merge them.
 */
export function identityKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}
