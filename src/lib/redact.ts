import Papa from 'papaparse';
import { identityKey } from './types';

/**
 * Surname redaction for a league that is about to be published.
 *
 * This rewrites the export itself, before it is embedded in a build. Redacting
 * at display time would be theatre: the full names would still be sitting in
 * the bundle for anyone who opened the page source.
 */

/** identityKey(original) -> display name to publish. */
export type RedactionMap = Map<string, string>;

const DASHES = '---';

/** Tokens that are not a surname and should be left alone. */
const isWordLike = (token: string): boolean => /^\p{L}/u.test(token);

/**
 * Redacts every whitespace-separated token after the first.
 *
 * `keep` is how many leading characters of each surname survive; it is raised
 * only to break a collision between two real players.
 */
export function redactName(name: string, keep = 1): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return tokens.join(' ');
  return [
    tokens[0],
    ...tokens.slice(1).map((token) => {
      if (!isWordLike(token)) return token;
      // Never reveal more than the token holds, and never expose the
      // whole surname just to satisfy a collision.
      const prefix = [...token].slice(0, Math.min(keep, token.length - 1)).join('');
      return prefix ? `${prefix}${DASHES}` : token;
    }),
  ].join(' ');
}

/**
 * Builds a redaction map for a roster, guaranteeing distinct results.
 *
 * "Dave Smith" and "Dave Sanders" would both read "Dave S---", which would
 * merge two players in every table on the page, so colliding names keep one
 * more letter until they separate.
 */
export function buildRedactionMap(names: string[]): RedactionMap {
  const unique = [...new Map(names.map((n) => [identityKey(n), n.trim()])).values()];
  const chosen = new Map<string, string>(); // identityKey -> redacted

  let pending = unique;
  for (let keep = 1; keep <= 12 && pending.length; keep += 1) {
    const attempt = new Map<string, string[]>(); // redacted -> originals
    for (const name of pending) {
      const redacted = redactName(name, keep);
      const bucket = attempt.get(redacted);
      if (bucket) bucket.push(name);
      else attempt.set(redacted, [name]);
    }

    const stillColliding: string[] = [];
    for (const [redacted, originals] of attempt) {
      // A name already settled at a shorter length also occupies its slot.
      const taken = [...chosen.values()].includes(redacted);
      if (originals.length === 1 && !taken) {
        chosen.set(identityKey(originals[0]), redacted);
      } else if (originals.length === 1 && taken) {
        stillColliding.push(originals[0]);
      } else {
        stillColliding.push(...originals);
      }
    }
    // Nothing separated this round: more letters will not help either.
    if (stillColliding.length === pending.length && keep > 1) break;
    pending = stillColliding;
  }

  // Anything genuinely indistinguishable (identical names, or names that
  // differ only past 12 characters) gets a numeric suffix so the dashboard
  // never shows two different people under one label.
  let counter = 2;
  for (const name of pending) {
    const base = redactName(name, 1);
    let candidate = `${base} (${counter})`;
    while ([...chosen.values()].includes(candidate)) {
      counter += 1;
      candidate = `${base} (${counter})`;
    }
    chosen.set(identityKey(name), candidate);
    counter += 1;
  }

  return chosen;
}

/* ------------------------------------------------------------------ *
 * CSV rewriting
 * ------------------------------------------------------------------ */

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const SECTION_MARKER = /^\[\s*([a-z_ ]+)\s*\]$/i;

/** Columns that are about a song, round or number, never a person. */
const NOT_A_PERSON = [
  'song',
  'track',
  'artist',
  'album',
  'playlist',
  'round',
  'theme',
  'title',
  'description',
  'date',
  'time',
  'url',
  'link',
  'position',
  'place',
  'rank',
  'point',
  'score',
  'vote',
  'status',
  'reason',
];

const PERSON_COLUMNS = [
  'submitter',
  'voter',
  'author',
  'commenter',
  'postedby',
  'submittedby',
  'votedby',
  'competitor',
  'member',
  'player',
  'displayname',
  'user',
  'name',
];

const FREE_TEXT_COLUMNS = ['comment', 'note', 'text', 'body', 'description'];

/**
 * Which kind of records a file or section holds.
 *
 * Context matters because a bare "Name" column means a person in
 * competitors.csv and standings, but a round title in rounds.csv.
 */
export type RedactionContext =
  | 'competitors'
  | 'standings'
  | 'submissions'
  | 'votes'
  | 'comments'
  | 'rounds'
  | 'unknown';

/** Sections that never describe a person, whatever their columns are called. */
const IMPERSONAL_CONTEXTS: RedactionContext[] = ['rounds'];

export function contextFromName(name: string): RedactionContext {
  const key = norm(name);
  if (key.includes('competitor')) return 'competitors';
  if (key.includes('standing')) return 'standings';
  if (key.includes('submission')) return 'submissions';
  if (key.includes('vote')) return 'votes';
  if (key.includes('comment')) return 'comments';
  if (key.includes('round')) return 'rounds';
  return 'unknown';
}

/**
 * True for a column holding a person's display name.
 *
 * Allow and deny tokens are compared by specificity, because they overlap:
 * "Voter" contains "vote" and "Round Name" contains "name". The longer match
 * decides, so "Voter" is a person and "Round Name" is not.
 *
 * Columns ending in "id" are excluded deliberately: the classic export links
 * votes to people through opaque ids and resolves the name separately in
 * competitors.csv. Rewriting an id would break every join.
 */
export function isPersonColumn(header: string, context: RedactionContext = 'unknown'): boolean {
  const key = norm(header);
  if (!key || key.endsWith('id')) return false;
  if (IMPERSONAL_CONTEXTS.includes(context)) return false;

  const longest = (tokens: string[]): number =>
    tokens.filter((t) => key.includes(t)).reduce((best, t) => Math.max(best, t.length), 0);

  const allow = longest(PERSON_COLUMNS);
  if (!allow) return false;
  return allow >= longest(NOT_A_PERSON);
}

function isFreeTextColumn(header: string): boolean {
  const key = norm(header);
  if (!key || key.endsWith('id')) return false;
  return FREE_TEXT_COLUMNS.some((allow) => key.includes(allow));
}

const isBlank = (cells: string[]): boolean => cells.every((c) => (c ?? '').trim() === '');

/** Free-text edits are collected so a human can review them. */
export interface RedactionReport {
  proseChanges: { column: string; before: string; after: string }[];
}

/**
 * Rewrites the identity cells of an export in place.
 *
 * Handles the modern sectioned CSV and the classic single-header files, and
 * also sweeps names out of free-text columns, where players routinely refer
 * to each other. `fileName` supplies the context for a classic flat file;
 * sectioned files take their context from each `[marker]`.
 */
export function redactCsvText(
  text: string,
  map: RedactionMap,
  fileName = '',
  report?: RedactionReport,
): string {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const grid = parsed.data.filter(Array.isArray).map((row) => [...row]);

  const sectioned = grid.some((row) => SECTION_MARKER.test((row[0] ?? '').trim()));
  let headers: string[] = sectioned ? [] : (grid[0] ?? []);
  let context: RedactionContext = sectioned ? 'unknown' : contextFromName(fileName);
  let expectHeader = false;

  const proseReplacements = buildProseReplacements(map);

  for (let i = 0; i < grid.length; i += 1) {
    const row = grid[i];
    const marker = (row[0] ?? '').trim().match(SECTION_MARKER);
    if (sectioned && marker) {
      context = contextFromName(marker[1]);
      expectHeader = true;
      continue;
    }
    if (isBlank(row)) continue;
    if (expectHeader) {
      headers = row.map((h) => (h ?? '').trim());
      expectHeader = false;
      continue;
    }
    if (!sectioned && i === 0) continue;

    for (let col = 0; col < row.length; col += 1) {
      const header = headers[col];
      if (!header) continue;
      const value = row[col];
      if (!value) continue;

      if (isPersonColumn(header, context)) {
        const replacement = map.get(identityKey(value));
        if (replacement) row[col] = replacement;
      } else if (isFreeTextColumn(header)) {
        const rewritten = redactProse(value, proseReplacements);
        if (rewritten !== value) {
          row[col] = rewritten;
          report?.proseChanges.push({ column: header, before: value, after: rewritten });
        }
      }
    }
  }

  return Papa.unparse(grid, { newline: '\n' });
}

/** Shortest surname worth sweeping out of prose. */
const MIN_SURNAME = 3;

interface ProseReplacement {
  pattern: RegExp;
  replacement: string;
}

/**
 * Patterns for names written out in prose.
 *
 * Full names go first so "Tim Engel" becomes "Tim E---" rather than
 * "Tim E---" via two passes. Bare surnames are then swept as well, because a
 * comment reading "classic Engel pick" leaks exactly what redaction is for.
 * Very short surnames are left alone: they are more likely to be an ordinary
 * word than a reference to a person.
 */
function buildProseReplacements(map: RedactionMap): ProseReplacement[] {
  const out: ProseReplacement[] = [];

  const fullNames = [...map.entries()]
    .filter(([key]) => key.includes(' '))
    .sort((a, b) => b[0].length - a[0].length);

  for (const [key, redacted] of fullNames) {
    out.push({
      pattern: new RegExp(escapeRegExp(key).replace(/\\?\s+/g, '\\s+'), 'gi'),
      replacement: redacted,
    });
  }

  // Bare surnames, longest first, de-duplicated across the roster.
  const surnames = new Map<string, string>();
  for (const [key] of fullNames) {
    for (const token of key.split(' ').slice(1)) {
      if (token.length < MIN_SURNAME) continue;
      const initial = [...token][0];
      if (!/\p{L}/u.test(initial)) continue;
      surnames.set(token, `${initial.toUpperCase()}${DASHES}`);
    }
  }
  for (const [token, replacement] of [...surnames].sort((a, b) => b[0].length - a[0].length)) {
    out.push({
      pattern: new RegExp(`\\b${escapeRegExp(token)}\\b`, 'gi'),
      replacement,
    });
  }

  return out;
}

/** Replaces any known name written out inside free text. */
function redactProse(value: string, replacements: ProseReplacement[]): string {
  let out = value;
  for (const { pattern, replacement } of replacements) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, () => replacement);
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
