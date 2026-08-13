/**
 * Everything the bake script needs from the app's own libraries.
 *
 * The CLI bundles this one entry so the published page and the command line
 * agree on how an export is parsed — a separate implementation would drift.
 */
export { artistNames, artworkTargets, describeLeague, type LeagueSummary } from './inspect';
export type { FloorMode, ScoringMode } from './stats';
export { buildRedactionMap, redactCsvText, redactName } from './redact';
export type { NamedFile } from './parse';
