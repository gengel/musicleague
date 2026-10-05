# Music League v2 — dashboard review and improvement backlog

Written after implementing milestones M0–M7 for the season-2 dashboard. Everything below is a *suggestion*, not a defect: the dashboard is working, all 436 tests pass, the build is clean, and `docs/v2/` is baked with round-1 data (Bob's theme win applied, both leagues' art and last.fm data embedded, league 1 joined as history).

Grouped by priority. Each item says what I observed and what I'd change.

## What was built

- **Theme bonus** end to end: detection from the round title, ±3 scoring judged on the counted score, a reconciling `theme` term in every breakdown, and visible chips/banners with the reason wherever a total appears.
- **League config** (`leagues/*.json`) replacing bake flags; league 1 still bakes identically.
- **League 1 as history**, joined by player id, redacted with one shared map so a player keeps one name across seasons.
- **Deep player pages** (`#player/<slug>`) combining both leagues: record, submissions, who they rank with reciprocity, taste, and a scouting brief.
- **Hash routing**, a **This Round** landing tab, ARIA tabs, and the network panel gated until 3 rounds.

## High value

1. **The `--rounds` / in-progress copy is only half-applied.** The header and the banner say "1 of 12 rounds", but individual panels still say "song of the season", "winner", and use season-total language. The plan (item 7 from the original review) called for the copy to shift to "best song of the first N", "leader" not "winner", "has yet to give them a point". With one round played this is very visible. Worth a pass over the superlative and play-by-play captions that keys off `stats.inProgress`.

2. **The kingmaker projection ignores the scoring switch.** `future.ts`'s `decisiveVoters` re-scores rounds without applying the theme bonus or, in some paths, the forfeit rule. With themed rounds now changing who effectively "wins" the season, the kingmaker analysis should re-score using the same counted-score path the standings use, or it will occasionally name the wrong swing voter. (Original review item 8.)

3. **Player-page taste sections are thin at one round and not yet gated.** Three of twelve players have no taste alignment yet (they voted too little to rank), and genre/era blends rest on a single submission. The page renders fine, but a "from 1 song" hedge — like the genre panel's *thin* marking — would stop a single data point reading as a preference. Add per-section `minSongs` gating on the player page, matching the network gate.

4. **`publish.single` is config but unused.** `leagues/league2.json` sets `single: true`, but bake never inlines `docs/v2` into a one-file page. Either wire the inline step (as the season-1 `league3.html` had) or drop the field so the config doesn't imply behaviour that isn't there. The folder deploy works without it; this is just avoiding a dead setting.

## Medium value

5. **`docs/` has accumulated stale builds.** `index0/1/2.html`, `league.html`, `league0..2.html` are old snapshots of season 1. The new `docs/index.html` landing links only the current two. Consider archiving the old ones under `snapshots/` or deleting them, so the deploy folder isn't full of dead pages a visitor could stumble onto.

6. **`PlayerDetail` in `PlayersTab.tsx` is now dead code.** The Players tab navigates to the deep `PlayerPage`, so the old inline `PlayerDetail` (and its subtabs) only renders when `onOpenPlayer` is absent — which never happens in the app. It's still exercised by no test. Either remove it or route the demo/no-history case through it deliberately.

7. **No round page navigation UI.** `#round/<n>` works and renders a single round, but nothing links to it — the Rounds tab lists every round without per-round anchors, and This Round doesn't link "see this round". Add round permalinks so the route is reachable without typing the hash.

8. **Budget validation is unused.** The config carries the 10/10 budget and `stats.budget` is set, but a ballot that doesn't spend its full budget is never flagged. The plan proposed a soft warning. Low effort, and it would catch an export imported wrong.

9. **Downvote devotion isn't computed.** The plan proposed `PairStats.downDevotion` (downvotes / max down possible) so "who they target" is comparable across voters now that the down budget is known. The player page shows raw down totals instead. Worth adding for the zero-sum league where downvotes are half the game.

## Low value / polish

10. **Theme chip colour contrast.** The win chip is dark text on `--theme` gold; check it against WCAG AA at small sizes. The lose chip (red outline, transparent) is fine. I used text+sign so it never relies on colour alone, but the gold could be nudged darker.

11. **Mobile width not verified.** I reasoned about layout from the code and the wide tables (standings, who-they-rank) but did not open the baked page at a phone width. The `who they rank` table has six numeric columns; it likely needs horizontal scroll affordance on a narrow screen.

12. **Genre coverage gaps are listed but not shown on the player page.** 24 artists across both leagues have no genre. The genre panel lists them; the player page silently omits ungenred songs from the genre blend. A small "N songs without a genre tag" note would match the honesty of the rest of the app.

13. **History warnings aren't surfaced in the UI.** `joinHistory` returns `warnings` (name-vs-id joins) and `newPlayers`, and the bake could print them, but neither is shown. For season 2 it's moot (all 12 joined by id, no warnings), but a future season with a new player would benefit from a "new this league" note on their page.

## Verification notes

- 436 tests pass (`vitest run`), including new suites for config, theme scoring, the theme chip, history join, the player-profile builder, and the router.
- `tsc -b` and `vite build` are clean.
- `docs/v2/` served under `vite preview` returns 200 for the page, its JS bundle, and art.
- With the real round-1 export: Bob = 17 (14 votes + 3 theme), all 12 players join to season 1, no unresolved themes.
