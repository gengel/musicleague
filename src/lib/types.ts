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
 * Resolves the name each player should be called in generated prose.
 *
 * This exists because a league can contain two players with the same first
 * name — this one has both a "Caroline" and a "Caroline Cone" — and any
 * narrative feature that shortens a full name to its first token risks
 * silently attributing one player's result to the other. `displayName`
 * always returns each player's full name exactly as given, which is the one
 * choice guaranteed not to collide: it is what the export itself uses to
 * tell them apart. All generated prose (Play-by-Play chapters, superlative
 * captions, archetype labels) must call this rather than reading `name` or
 * any hand-shortened form directly.
 *
 * Built once per league and passed around, rather than recomputed per call,
 * so a name is judged against the same roster everywhere it appears.
 */
export function buildDisplayNameResolver(players: Player[]): (playerId: string) => string {
  const byId = new Map(players.map((p) => [p.id, p.name]));
  return (playerId: string) => byId.get(playerId) ?? playerId;
}

/**
 * True if any two players in the league would collide on their first name
 * alone. A guard rail for generated prose, which must never shorten to a
 * first name when this is true — see `buildDisplayNameResolver`.
 */
export function hasNameCollision(players: Player[]): boolean {
  const seen = new Set<string>();
  for (const p of players) {
    const first = p.name.trim().split(/\s+/)[0]?.toLowerCase();
    if (!first) continue;
    if (seen.has(first)) return true;
    seen.add(first);
  }
  return false;
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
