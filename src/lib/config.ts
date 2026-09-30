/**
 * A league's rules and layout, kept in `leagues/<id>.json`.
 *
 * The export does not carry a league's settings — budgets, scoring, the
 * theme schedule — and until v2 those lived as bake-command flags. A config
 * file keeps them in one reviewable place, per league, and lets one league
 * embed another as history. It holds rules only: no names, votes or songs,
 * so it is safe to commit.
 */

/** How non-voters and negative scores are handled. Mirrors stats.ts. */
export type ScoringMode = 'competitive' | 'friendly';
export type FloorMode = 'song' | 'none';

/**
 * The per-round bonus this league applies on top of Music League's own
 * scoring. Each round is themed around one player; that player gains `win`
 * points for finishing first in their own round and `lose` otherwise, or
 * `skip` if they submitted nothing. Music League does not compute this — the
 * dashboard does — so it is a league rule, not export data.
 */
export interface ThemeRules {
  /** Where the theme player's name is found. Only the round title, for now. */
  source: 'title';
  win: number;
  lose: number;
  /** Applied when the theme player submitted nothing in their own round. */
  skip: number;
  /**
   * Round-name → player-name overrides, for a title the detector cannot
   * resolve on its own. Keyed by the exact round name.
   */
  overrides: Record<string, string>;
  /**
   * The theme player for each round, in order, by display name. Lets the
   * dashboard show intel for a round before its export exists — the export
   * only ever contains rounds that have started. Index 0 is round 1. Optional:
   * without it, only rounds already in the export are known.
   */
  schedule?: string[];
}

export interface VoteBudget {
  upvotes: number;
  downvotes: number;
}

export interface PublishConfig {
  /** Output directory, e.g. docs/v2. */
  out: string;
  /** When true, also inline into a single self-contained HTML file. */
  single?: boolean;
}

export interface LeagueConfig {
  id: string;
  label: string;
  /** Directory or file holding the export CSVs, relative to the repo root. */
  export: string;
  /** Directory of enrich/*.json for this league, relative to the repo root. */
  enrich?: string;
  totalRounds?: number;
  scoring?: ScoringMode;
  flooring?: FloorMode;
  budget?: VoteBudget;
  theme?: ThemeRules;
  /** Ids of earlier leagues to embed as history, in display order. */
  history?: string[];
  redact?: boolean;
  publish?: PublishConfig;
}

const SCORINGS: ScoringMode[] = ['competitive', 'friendly'];
const FLOORINGS: FloorMode[] = ['song', 'none'];

function fail(id: string, message: string): never {
  throw new Error(`League config ${id}: ${message}`);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validates a parsed league config, rejecting unknown keys and bad values so
 * a typo fails at the terminal rather than silently producing a wrong page.
 * Returns a typed, defaulted config.
 */
export function validateLeagueConfig(raw: unknown): LeagueConfig {
  if (!isPlainObject(raw)) throw new Error('League config: not an object');
  const id = typeof raw.id === 'string' ? raw.id : undefined;
  if (!id) throw new Error('League config: "id" is required and must be a string');

  const allowed = new Set([
    'id', 'label', 'export', 'enrich', 'totalRounds', 'scoring', 'flooring',
    'budget', 'theme', 'history', 'redact', 'publish',
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) fail(id, `unknown key "${key}"`);
  }

  if (typeof raw.label !== 'string' || !raw.label) fail(id, '"label" is required');
  if (typeof raw.export !== 'string' || !raw.export) fail(id, '"export" is required');
  if (raw.enrich !== undefined && typeof raw.enrich !== 'string') fail(id, '"enrich" must be a string');

  if (raw.totalRounds !== undefined) {
    if (typeof raw.totalRounds !== 'number' || !Number.isInteger(raw.totalRounds) || raw.totalRounds < 1) {
      fail(id, '"totalRounds" must be a positive integer');
    }
  }
  if (raw.scoring !== undefined && !SCORINGS.includes(raw.scoring as ScoringMode)) {
    fail(id, `"scoring" must be one of ${SCORINGS.join(', ')}`);
  }
  if (raw.flooring !== undefined && !FLOORINGS.includes(raw.flooring as FloorMode)) {
    fail(id, `"flooring" must be one of ${FLOORINGS.join(', ')}`);
  }

  let budget: VoteBudget | undefined;
  if (raw.budget !== undefined) {
    if (!isPlainObject(raw.budget)) fail(id, '"budget" must be an object');
    const { upvotes, downvotes } = raw.budget as Record<string, unknown>;
    if (typeof upvotes !== 'number' || upvotes <= 0) fail(id, '"budget.upvotes" must be a positive number');
    if (typeof downvotes !== 'number' || downvotes < 0) fail(id, '"budget.downvotes" must be a non-negative number');
    budget = { upvotes, downvotes };
  }

  let theme: ThemeRules | undefined;
  if (raw.theme !== undefined) {
    if (!isPlainObject(raw.theme)) fail(id, '"theme" must be an object');
    const t = raw.theme as Record<string, unknown>;
    if (t.source !== 'title') fail(id, '"theme.source" must be "title"');
    for (const k of ['win', 'lose', 'skip'] as const) {
      if (typeof t[k] !== 'number') fail(id, `"theme.${k}" must be a number`);
    }
    const overrides = t.overrides ?? {};
    if (!isPlainObject(overrides)) fail(id, '"theme.overrides" must be an object');
    for (const [round, player] of Object.entries(overrides)) {
      if (typeof player !== 'string') fail(id, `"theme.overrides.${round}" must be a string`);
    }
    let schedule: string[] | undefined;
    if (t.schedule !== undefined) {
      if (!Array.isArray(t.schedule) || t.schedule.some((s) => typeof s !== 'string')) {
        fail(id, '"theme.schedule" must be an array of player names');
      }
      schedule = t.schedule as string[];
    }
    theme = {
      source: 'title',
      win: t.win as number,
      lose: t.lose as number,
      skip: t.skip as number,
      overrides: overrides as Record<string, string>,
      schedule,
    };
  }

  let history: string[] | undefined;
  if (raw.history !== undefined) {
    if (!Array.isArray(raw.history) || raw.history.some((h) => typeof h !== 'string')) {
      fail(id, '"history" must be an array of league ids');
    }
    if ((raw.history as string[]).includes(id)) fail(id, 'a league cannot list itself in "history"');
    history = raw.history as string[];
  }

  if (raw.redact !== undefined && typeof raw.redact !== 'boolean') fail(id, '"redact" must be a boolean');

  let publish: PublishConfig | undefined;
  if (raw.publish !== undefined) {
    if (!isPlainObject(raw.publish)) fail(id, '"publish" must be an object');
    const p = raw.publish as Record<string, unknown>;
    if (typeof p.out !== 'string' || !p.out) fail(id, '"publish.out" is required');
    if (p.single !== undefined && typeof p.single !== 'boolean') fail(id, '"publish.single" must be a boolean');
    publish = { out: p.out, single: p.single as boolean | undefined };
  }

  return {
    id,
    label: raw.label,
    export: raw.export,
    enrich: raw.enrich as string | undefined,
    totalRounds: raw.totalRounds as number | undefined,
    scoring: raw.scoring as ScoringMode | undefined,
    flooring: raw.flooring as FloorMode | undefined,
    budget,
    theme,
    history,
    redact: raw.redact as boolean | undefined,
    publish,
  };
}
