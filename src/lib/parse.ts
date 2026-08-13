import Papa from 'papaparse';
import {
  identityKey,
  isPlaceholderName,
  type Comment,
  type League,
  type Player,
  type Round,
  type StandingRow,
  type Submission,
  type Vote,
} from './types';

/* ------------------------------------------------------------------ *
 * Header matching
 *
 * Music League has shipped several export layouts. Rather than pin to
 * one set of header strings we normalise headers and match against
 * alias lists, longest-specific alias first.
 *
 * `norm` is deliberately aggressive and is only ever applied to column
 * headers. Identities and titles use identityKey, which preserves
 * punctuation and emoji.
 * ------------------------------------------------------------------ */

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

type Row = Record<string, string>;

function pick(row: Row, aliases: readonly string[]): string | undefined {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const target = norm(alias);
    const hit = keys.find((k) => norm(k) === target);
    if (hit !== undefined) {
      const value = row[hit]?.trim();
      if (value) return value;
    }
  }
  // Fall back to a contains-match so unforeseen prefixes still resolve.
  for (const alias of aliases) {
    const target = norm(alias);
    const hit = keys.find((k) => norm(k).includes(target));
    if (hit !== undefined) {
      const value = row[hit]?.trim();
      if (value) return value;
    }
  }
  return undefined;
}

const COL = {
  roundId: ['round id', 'roundid', 'round'],
  /**
   * The classic rounds.csv keys rounds by a bare "ID", which must be used as
   * the round's identity: submissions and votes reference it through their
   * own "Round ID". Falling back to the round's name instead would create a
   * second, empty round for every real one.
   */
  roundKey: ['round id', 'roundid', 'id', 'round'],
  roundName: ['round name', 'name', 'title', 'round title', 'theme'],
  roundSeq: ['position', 'sequence', 'round number', 'order', 'index'],
  description: ['description', 'round description'],
  playlist: ['playlist url', 'playlist', 'spotify playlist'],
  votingClose: [
    'voting closes',
    'votes close',
    'voting closed',
    'voting end',
    'closes',
    'created',
  ],
  status: ['status', 'state'],
  skipReason: ['skip reason', 'skipped reason', 'skipped'],
  trackId: ['spotify uri', 'spotify track id', 'track id', 'spotify id', 'uri'],
  songTitle: ['song title', 'track name', 'song', 'title', 'track'],
  artist: ['artist', 'artists', 'artist name'],
  submitter: ['submitter id', 'submitter', 'submitted by'],
  voter: ['voter id', 'voter', 'voted by'],
  points: ['points assigned', 'points', 'score', 'votes', 'point'],
  comment: ['comment', 'note', 'submission note', 'text', 'body'],
  author: ['author', 'commenter', 'posted by', 'user', 'player'],
  player: ['name', 'player', 'display name', 'competitor', 'member'],
  standingPos: ['position', 'place', 'rank'],
  roundsPlayed: ['rounds played', 'rounds participated', 'rounds'],
  competitorId: ['id', 'competitor id', 'player id', 'user id'],
} as const;

/* ------------------------------------------------------------------ *
 * Section splitting
 * ------------------------------------------------------------------ */

export interface Section {
  name: string;
  rows: Row[];
}

const SECTION_MARKER = /^\[\s*([a-z_ ]+)\s*\]$/i;

function isBlank(cells: string[]): boolean {
  return cells.every((c) => c.trim() === '');
}

/**
 * Splits the modern single-file export into its labelled sections.
 * A section is `[name]`, then a header row, then data rows, terminated
 * by a blank row or the next marker.
 */
export function splitSections(csvText: string): Section[] {
  const grid = Papa.parse<string[]>(csvText, {
    skipEmptyLines: false,
    delimiter: '',
  }).data.filter(Array.isArray);

  const sections: Section[] = [];
  let i = 0;

  while (i < grid.length) {
    const cells = grid[i] ?? [];
    const marker = (cells[0] ?? '').trim().match(SECTION_MARKER);
    if (!marker) {
      i += 1;
      continue;
    }
    const name = norm(marker[1]);
    i += 1;

    // Skip blank filler between marker and header.
    while (i < grid.length && isBlank(grid[i] ?? [])) i += 1;
    const headers = (grid[i] ?? []).map((h) => h.trim());
    i += 1;

    const rows: Row[] = [];
    while (i < grid.length) {
      const dataCells = grid[i] ?? [];
      if (isBlank(dataCells)) break;
      if ((dataCells[0] ?? '').trim().match(SECTION_MARKER)) break;
      const row: Row = {};
      headers.forEach((h, idx) => {
        if (h) row[h] = (dataCells[idx] ?? '').trim();
      });
      rows.push(row);
      i += 1;
    }
    sections.push({ name, rows });
  }

  return sections;
}

/** Parses a flat (single header row) CSV, as used by the classic export. */
export function parseFlat(csvText: string): Row[] {
  const out = Papa.parse<Row>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return out.data
    .filter((r) => r && typeof r === 'object')
    .map((r) => {
      const clean: Row = {};
      for (const [k, v] of Object.entries(r)) {
        clean[k] = typeof v === 'string' ? v.trim() : String(v ?? '');
      }
      return clean;
    })
    .filter((r) => Object.values(r).some((v) => v !== ''));
}

/* ------------------------------------------------------------------ *
 * Player registry
 *
 * The modern export identifies people by display name; the classic one
 * by opaque id plus a competitors lookup. Both collapse into a registry
 * keyed by a normalised identity.
 * ------------------------------------------------------------------ */

class PlayerRegistry {
  private byKey = new Map<string, Player>();
  private idAliases = new Map<string, string>();

  /** Registers an id -> display-name mapping (classic competitors.csv). */
  alias(id: string, name: string): void {
    this.idAliases.set(identityKey(id), name);
  }

  /**
   * Resolves a raw cell to a player. Returns undefined for anonymised or
   * empty identities so callers can treat them as "unknown" rather than
   * inventing a competitor named "[Anonymous]".
   */
  resolve(raw: string | undefined): Player | undefined {
    if (!raw) return undefined;
    const aliased = this.idAliases.get(identityKey(raw)) ?? raw;
    if (isPlaceholderName(aliased)) return undefined;
    const key = identityKey(aliased);
    if (!key) return undefined;
    let existing = this.byKey.get(key);
    if (!existing) {
      existing = { id: key, name: aliased.trim(), placeholder: false };
      this.byKey.set(key, existing);
    }
    return existing;
  }

  all(): Player[] {
    return [...this.byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

/* ------------------------------------------------------------------ *
 * Track identity
 * ------------------------------------------------------------------ */

/**
 * Votes rows do not always carry a track id, so songs are keyed by
 * round + title with the id used only when both sides have it.
 */
function trackKey(roundId: string, title: string | undefined, id: string | undefined): string {
  if (id) return `${roundId}::id:${identityKey(id)}`;
  return `${roundId}::t:${identityKey(title ?? '')}`;
}

/**
 * Extracts a bare Spotify track id from whatever the export carries:
 * `spotify:track:ID`, a full open.spotify.com URL, or the id alone.
 */
export function spotifyTrackId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/(?:spotify:track:|open\.spotify\.com\/track\/)([A-Za-z0-9]+)/);
  if (match) return match[1];
  return /^[A-Za-z0-9]{22}$/.test(raw.trim()) ? raw.trim() : undefined;
}

/* ------------------------------------------------------------------ *
 * Round identity
 * ------------------------------------------------------------------ */

class RoundRegistry {
  private byKey = new Map<string, Round>();

  resolve(raw: string | undefined, seqHint?: number): Round {
    const label = raw?.trim() || 'Round';
    const key = identityKey(label);
    let existing = this.byKey.get(key);
    if (!existing) {
      existing = {
        id: key,
        sequence: seqHint ?? this.byKey.size + 1,
        name: label,
        skipped: false,
      };
      this.byKey.set(key, existing);
    }
    return existing;
  }

  get(key: string): Round | undefined {
    return this.byKey.get(key);
  }

  all(): Round[] {
    return [...this.byKey.values()].sort((a, b) => a.sequence - b.sequence);
  }
}

/* ------------------------------------------------------------------ *
 * Main entry points
 * ------------------------------------------------------------------ */

export interface NamedFile {
  name: string;
  text: string;
}

/**
 * Parses one or more export files into a League.
 * Accepts the modern sectioned single CSV and the classic
 * rounds/submissions/votes/competitors bundle, including a mix.
 */
export function parseLeague(files: NamedFile[]): League {
  const players = new PlayerRegistry();
  const rounds = new RoundRegistry();
  const warnings: string[] = [];

  const submissions: Submission[] = [];
  const votes: Vote[] = [];
  const comments: Comment[] = [];
  const standings: StandingRow[] = [];

  // Deferred so competitor aliases from any file land before resolution.
  interface RawSection {
    kind: string;
    rows: Row[];
  }
  const collected: RawSection[] = [];

  for (const file of files) {
    const sections = splitSections(file.text);
    if (sections.length > 0) {
      for (const s of sections) collected.push({ kind: s.name, rows: s.rows });
      continue;
    }
    // No markers: classic single-purpose file, classified by filename.
    const fname = norm(file.name);
    const kind = fname.includes('competitor')
      ? 'competitors'
      : fname.includes('vote')
        ? 'votes'
        : fname.includes('submission')
          ? 'submissions'
          : fname.includes('round')
            ? 'rounds'
            : fname.includes('comment')
              ? 'comments'
              : fname.includes('standing')
                ? 'standings'
                : 'unknown';
    if (kind === 'unknown') {
      warnings.push(`Could not classify "${file.name}" — expected a Music League export.`);
      continue;
    }
    collected.push({ kind, rows: parseFlat(file.text) });
  }

  // Pass 1: identity aliases.
  for (const { kind, rows } of collected) {
    if (kind !== 'competitors') continue;
    for (const row of rows) {
      const id = pick(row, COL.competitorId);
      const name = pick(row, COL.player);
      if (id && name) players.alias(id, name);
    }
  }

  // Pass 2: rounds, so sequence/metadata exist before other sections
  // implicitly create rounds in vote order.
  interface PendingRound {
    round: Round;
    declaredSeq?: number;
    date?: string;
  }
  const pendingRounds: PendingRound[] = [];

  for (const { kind, rows } of collected) {
    if (kind !== 'rounds') continue;
    rows.forEach((row) => {
      const seqRaw = pick(row, COL.roundSeq);
      const declaredSeq = seqRaw && /^\d+$/.test(seqRaw) ? Number(seqRaw) : undefined;
      // The classic export identifies a round by "ID"; the modern sectioned
      // one has no id column at all and is referenced by title.
      const key = pick(row, COL.roundKey) ?? pick(row, COL.roundName);
      const round = rounds.resolve(key, declaredSeq);
      round.name = pick(row, COL.roundName) ?? round.name;
      round.description = pick(row, COL.description);
      round.playlistUrl = pick(row, COL.playlist);
      round.votingClosed = pick(row, COL.votingClose);
      round.status = pick(row, COL.status);
      const skip = pick(row, COL.skipReason);
      round.skipped = Boolean(skip) && !/^(no|false|0)$/i.test(skip ?? '');
      pendingRounds.push({ round, declaredSeq, date: round.votingClosed });
    });
  }

  // Order rounds by whatever the export actually gives: an explicit position,
  // else a date, else the order they were listed in.
  if (pendingRounds.length) {
    const allDeclared = pendingRounds.every((p) => p.declaredSeq !== undefined);
    const allDated = pendingRounds.every((p) => p.date);
    const ordered = [...pendingRounds];
    if (allDeclared) {
      ordered.sort((a, b) => a.declaredSeq! - b.declaredSeq!);
    } else if (allDated) {
      ordered.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    }
    ordered.forEach((p, i) => {
      p.round.sequence = i + 1;
    });
  }

  // Pass 3: submissions.
  // A round can hold two songs sharing a title, and the votes section
  // identifies songs by title, so collisions are kept as separate entries and
  // disambiguated by submitter rather than silently merged into one song.
  const trackTitleIndex = new Map<string, string[]>(); // round::titleKey -> trackKeys
  const trackMeta = new Map<string, Submission>();

  const indexTitle = (roundId: string, title: string, key: string): void => {
    if (!title) return;
    for (const variant of [identityKey(title), norm(title)]) {
      const k = `${roundId}::${variant}`;
      const list = trackTitleIndex.get(k);
      if (list) {
        if (!list.includes(key)) list.push(key);
      } else {
        trackTitleIndex.set(k, [key]);
      }
    }
  };

  for (const { kind, rows } of collected) {
    if (kind !== 'submissions') continue;
    for (const row of rows) {
      const round = rounds.resolve(pick(row, COL.roundId) ?? pick(row, COL.roundName));
      const title = pick(row, COL.songTitle) ?? '';
      const id = pick(row, COL.trackId);
      const submitter = players.resolve(pick(row, COL.submitter));
      // Two title-keyed submissions in one round would otherwise collapse and
      // double-count their votes, so suffix any repeat to keep it distinct.
      let key = trackKey(round.id, title, id);
      if (trackMeta.has(key)) {
        const seed = submitter?.id ?? 'anon';
        let suffixed = `${key}#${seed}`;
        let n = 2;
        while (trackMeta.has(suffixed)) suffixed = `${key}#${seed}-${n++}`;
        key = suffixed;
      }
      const sub: Submission = {
        roundId: round.id,
        trackId: key,
        spotifyId: spotifyTrackId(id),
        title,
        artist: pick(row, COL.artist) ?? '',
        submitterId: submitter?.id,
        comment: pick(row, COL.comment),
      };
      submissions.push(sub);
      trackMeta.set(key, sub);
      indexTitle(round.id, title, key);
    }
  }

  /**
   * Resolves a vote/comment row's song to an existing submission key.
   * `submitterHint` comes from the votes section's "whose song" column and
   * breaks ties when a round contains two songs with the same title.
   */
  const resolveTrack = (
    roundId: string,
    title: string | undefined,
    id: string | undefined,
    submitterHint?: string,
  ) => {
    const candidates = title
      ? (trackTitleIndex.get(`${roundId}::${identityKey(title)}`) ??
        trackTitleIndex.get(`${roundId}::${norm(title)}`) ??
        [])
      : [];

    // Ambiguous titles must be resolved by submitter before anything else: the
    // first of the duplicates owns the plain title key, so trusting that key
    // would quietly credit both votes to whichever song was parsed first.
    if (candidates.length > 1) {
      const matched = submitterHint
        ? candidates.find((k) => trackMeta.get(k)?.submitterId === submitterHint)
        : undefined;
      if (matched) return matched;
    }

    const direct = trackKey(roundId, title, id);
    if (trackMeta.has(direct)) return direct;
    if (candidates.length >= 1) return candidates[0];
    return direct;
  };

  // Pass 4: votes.
  let voteRowsSeen = 0;
  for (const { kind, rows } of collected) {
    if (kind !== 'votes') continue;
    voteRowsSeen += rows.length;
    for (const row of rows) {
      const round = rounds.resolve(pick(row, COL.roundId) ?? pick(row, COL.roundName));
      const voter = players.resolve(pick(row, COL.voter));
      if (!voter) continue;
      const title = pick(row, COL.songTitle);
      // The votes section names whose song was voted on; use it both to
      // disambiguate duplicate titles and to fill anonymised submitters.
      const viaVote = players.resolve(pick(row, COL.submitter));
      const key = resolveTrack(round.id, title, pick(row, COL.trackId), viaVote?.id);
      const pointsRaw = pick(row, COL.points);
      const points = Number(pointsRaw);
      if (!Number.isFinite(points)) continue;
      votes.push({
        roundId: round.id,
        trackId: key,
        voterId: voter.id,
        points,
        comment: pick(row, COL.comment),
      });

      const meta = trackMeta.get(key);
      if (viaVote && meta && !meta.submitterId) meta.submitterId = viaVote.id;
      if (viaVote && !meta) {
        // Song only appears in votes (submissions withheld) — synthesise.
        const sub: Submission = {
          roundId: round.id,
          trackId: key,
          title: title ?? '',
          artist: '',
          submitterId: viaVote.id,
        };
        submissions.push(sub);
        trackMeta.set(key, sub);
        indexTitle(round.id, title ?? '', key);
      }
    }
  }

  // Pass 5: comments.
  for (const { kind, rows } of collected) {
    if (kind !== 'comments') continue;
    for (const row of rows) {
      const round = rounds.resolve(pick(row, COL.roundId) ?? pick(row, COL.roundName));
      const author = players.resolve(pick(row, COL.author) ?? pick(row, COL.voter));
      const text = pick(row, COL.comment);
      if (!author || !text) continue;
      comments.push({
        roundId: round.id,
        trackId: resolveTrack(
          round.id,
          pick(row, COL.songTitle),
          pick(row, COL.trackId),
          players.resolve(pick(row, COL.submitter))?.id,
        ),
        authorId: author.id,
        text,
      });
    }
  }

  // Pass 6: official standings.
  for (const { kind, rows } of collected) {
    if (kind !== 'standings') continue;
    rows.forEach((row, idx) => {
      const player = players.resolve(pick(row, COL.player));
      if (!player) return;
      const posRaw = pick(row, COL.standingPos);
      const roundsRaw = pick(row, COL.roundsPlayed);
      standings.push({
        playerId: player.id,
        position: posRaw && /^\d+$/.test(posRaw) ? Number(posRaw) : idx + 1,
        points: Number(pick(row, COL.points) ?? 0) || 0,
        roundsPlayed: roundsRaw && /^\d+$/.test(roundsRaw) ? Number(roundsRaw) : undefined,
      });
    });
  }

  if (submissions.length > 0 && voteRowsSeen === 0) {
    warnings.push(
      'No vote rows found. Either the league hides its vote breakdown, or no round has finished voting — per-voter analysis will be empty.',
    );
  }
  const anonCount = submissions.filter((s) => !s.submitterId).length;
  if (anonCount > 0) {
    warnings.push(
      `${anonCount} submission${anonCount === 1 ? '' : 's'} had no identifiable submitter (anonymous round or removed user) and are excluded from per-submitter stats.`,
    );
  }

  const leagueName =
    files.length === 1
      ? files[0].name.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ')
      : 'Music League';

  return {
    name: leagueName,
    rounds: rounds.all(),
    submissions,
    votes,
    players: players.all(),
    comments,
    standings,
    warnings,
  };
}
