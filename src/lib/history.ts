/**
 * Prior-league history, joined to the current league's players.
 *
 * League 2 reuses the same roster as league 1, so a player's league 1 record
 * is a scouting report: what they submit, how they vote, who they back. This
 * module computes each history league's stats once and joins them to the
 * current players, by id first and by normalised name as a fallback, so a
 * player who changed handles between seasons is still matched (with a warning
 * naming them).
 */
import { parseLeague, type NamedFile } from './parse';
import { computeStats, type PlayerStats, type Stats, type StatsOptions } from './stats';
import { identityKey } from './types';
import { attachEnrichment, parseEnrichment, type RawEnrichmentFiles } from './enrich';

export interface HistoryLeagueInput {
  id: string;
  label: string;
  files: NamedFile[];
  options: StatsOptions;
  /** Raw enrichment files (years, obscurity, …) baked for that league. */
  enrichment?: RawEnrichmentFiles;
}

export interface HistoryLeague {
  id: string;
  label: string;
  stats: Stats;
  /** Final ranking, best first, of players who submitted. */
  finishOrder: string[];
}

export interface PlayerHistoryEntry {
  leagueId: string;
  label: string;
  player: PlayerStats;
  /** 1-based finishing place among players who submitted, when known. */
  finish?: number;
  /** How many players that finish is out of. */
  of?: number;
}

export interface History {
  leagues: HistoryLeague[];
  /** currentPlayerId -> their record in each history league, oldest first. */
  byPlayer: Map<string, PlayerHistoryEntry[]>;
  /** Names of current players not found in any history league. */
  newPlayers: string[];
  /** Diagnostics: players joined by name rather than id. */
  warnings: string[];
}

/** Computes stats for each history league. */
export function buildHistoryLeagues(inputs: HistoryLeagueInput[]): HistoryLeague[] {
  return inputs.map((input) => {
    const computed = computeStats(parseLeague(input.files), input.options);
    // Attach year/popularity so pooled taste reads cover every league.
    const stats = input.enrichment
      ? { ...computed, songs: attachEnrichment(computed.songs, parseEnrichment(input.enrichment)) }
      : computed;
    const finishOrder = [...stats.players]
      .filter((p) => p.songs > 0)
      .sort((a, b) => b.pointsCounted - a.pointsCounted)
      .map((p) => p.playerId);
    return { id: input.id, label: input.label, stats, finishOrder };
  });
}

/**
 * Joins history leagues to the current league's players.
 *
 * `currentPlayers` are the current league's `Player`-like records (id + name).
 */
export function joinHistory(
  currentPlayers: { id: string; name: string }[],
  leagues: HistoryLeague[],
): History {
  const byPlayer = new Map<string, PlayerHistoryEntry[]>();
  const warnings: string[] = [];
  const matchedInAny = new Set<string>();

  for (const league of leagues) {
    const byId = new Map(league.stats.players.map((p) => [p.playerId, p]));
    const byName = new Map(league.stats.players.map((p) => [identityKey(p.name), p]));
    const finishOf = new Map(league.finishOrder.map((id, i) => [id, i + 1]));
    const submitterCount = league.finishOrder.length;

    for (const current of currentPlayers) {
      let match = byId.get(current.id);
      if (!match) {
        const named = byName.get(identityKey(current.name));
        if (named) {
          match = named;
          warnings.push(
            `${current.name}: matched to ${league.label} by name, not id (a different account id across seasons).`,
          );
        }
      }
      if (!match) continue;
      matchedInAny.add(current.id);
      const entry: PlayerHistoryEntry = {
        leagueId: league.id,
        label: league.label,
        player: match,
        finish: finishOf.get(match.playerId),
        of: submitterCount || undefined,
      };
      const list = byPlayer.get(current.id);
      if (list) list.push(entry);
      else byPlayer.set(current.id, [entry]);
    }
  }

  const newPlayers = currentPlayers
    .filter((p) => !matchedInAny.has(p.id))
    .map((p) => p.name);

  return { leagues, byPlayer, newPlayers, warnings };
}
