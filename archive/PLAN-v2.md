# Music League Dashboard v2: implementation plan

League 2 has 12 players and 12 rounds. Every ballot is exactly +10 / −10. Scoring is Competitive Mode with no floor. Each round has a theme player, whose bonus is applied by us, not by Music League. Players also get deep profile pages that include league 1 history.

## Rules as agreed

| Rule | Decision |
| --- | --- |
| Scoring | Competitive. A player who doesn't vote forfeits the upvotes their song earned that round. |
| Floor | Off. Totals can go negative. |
| Budget | 10 upvote points and 10 downvote points per voter per round. |
| Rounds | 12. |
| Theme player | Read from the round title ("Now That's What I Call **Bob**"). |
| Win | +3 if the theme player's song finishes first in their round. |
| Lose | −3 if it finishes anywhere other than first. |
| Skip | −3 if the theme player submits nothing in their round. |
| Where it counts | Season totals, standings and the timeline. The round ranking stays exactly as voted. |
| Visibility | The ±3 appears wherever a total is shown, with the reason next to it. |

Confirmed:

- A tie for first counts as a win.
- A theme player who submits but doesn't vote forfeits their upvotes, is judged on the counted score, and so almost certainly takes −3.
- Each player is the theme exactly once, because there are 12 players and 12 rounds.

What round 1 gives, as a check value:

- Bob wins "Now That's What I Call Bob" with 14, so his total is 17.
- Joel, Megan and Go_BirdzDH didn't vote and forfeit their upvotes.
- All 12 player IDs match league 1, so history joins by ID with no fallback needed.

---

## Milestone 0: League config and data layout

The goal is to stop encoding a league's rules as bake flags. League 1's output must stay byte-for-byte the same in its stats.

**Files**
- `leagues/league1.json` and `leagues/league2.json`: new and committed. They hold rules only, no personal data.
  ```json
  {
    "id": "league2",
    "label": "League 2",
    "export": "data/league2/export",
    "enrich": "enrich/league2",
    "totalRounds": 12,
    "scoring": "competitive",
    "flooring": "none",
    "budget": { "upvotes": 10, "downvotes": 10 },
    "theme": { "source": "title", "win": 3, "lose": -3, "skip": -3, "overrides": {} },
    "history": ["league1"],
    "redact": true,
    "publish": { "out": "docs/v2", "single": true }
  }
  ```
  `theme.overrides` maps a round name to a player name. It's only for a title the detector can't resolve.
- `data/<league>/export/`: exports move here from `src/data/` and `snapshots/*/export`. `.gitignore` already ignores `*.csv`. Add `data/` explicitly as well.
- `enrich/league1/`: the current `enrich/*.json` files move here. `enrich/league2/` is new. The enrich scripts gain a `--league <id>` flag.
- `scripts/bake.mjs`:
  - Add `--league <id>`, which loads the config.
  - CLI flags still override the config.
  - The legacy `npm run bake -- <dir> --flags` call keeps working unchanged.
- `src/lib/config.ts`: new. Holds the `LeagueConfig` type and a validator. The validator rejects unknown keys and bad numbers, and gives the error at the terminal.

**Verification**
- A test bakes league 1 the old way and from `league1.json`, then asserts the embedded manifest and the `computeStats` output are identical.
- Re-bake `docs/league3.html` from the config and diff it against the current file. Only the bundle hash should change.

---

## Milestone 1: Theme bonus in the scoring model

**Model changes** (`src/lib/stats.ts`, `src/lib/types.ts`)
- Add `StatsOptions.theme?: ThemeRules`, holding `{ win, lose, skip, overrides }`. When it's absent, nothing changes, so league 1 is untouched.
- Add `StatsOptions.budget?: { upvotes: number; downvotes: number }`.
- `ScoreBreakdown` gains `theme: number`, and the invariant becomes:
  ```
  total = upvotes − downvotes − forfeited + absorbed + theme
  ```
  - Songs always carry `theme: 0`. The bonus belongs to the player, not the song.
  - `sumBreakdowns` for a player adds that player's theme adjustments.
- New type:
  ```ts
  interface ThemeOutcome {
    roundId: string; roundSequence: number; roundName: string;
    playerId: string; playerName: string;
    outcome: 'won' | 'lost' | 'skipped';
    points: number;            // +3 / −3
    /** Human reason, e.g. "Won their own round, Now That's What I Call Bob (14 pts, 1st of 12)". */
    reason: string;
    /** The counted score and rank that decided it, for tooltips. */
    score?: number; rank?: number; tiedWith?: string[];
  }
  ```
- `RoundStats.themePlayerId?` and `RoundStats.theme?: ThemeOutcome`.
- `Stats.themeOutcomes: ThemeOutcome[]`.
- `Stats.themeUnresolved: string[]`: rounds whose theme player couldn't be identified. These are surfaced as warnings.
- `PlayerStats.themeBonus: number` and `PlayerStats.themeRoundId?`.
- `pointsCounted` includes the bonus. Timelines add it in the round where it's earned.

**Theme detection** (`src/lib/theme.ts`, new)
- For each round, `overrides[round.name]` wins if present.
- Otherwise, match each player's full name and first name as whole words, case-insensitive, against the round title. Title only, since the user said the theme is in the title.
  - Prefer the longest match.
  - Exactly one player must match. If none or several do, add the round to `themeUnresolved` with a warning naming the candidates, and apply no bonus.
  - Real data: "Bob" matches only Bob. The detector must not match "Caroline" against two Carolines, which is why the unique-match rule exists.
- The outcome is only decided for rounds with results (`hasVotes`):
  - No submission from the theme player means `skipped`.
  - If their counted score equals the round's top counted score, that's `won`, and ties count.
  - Anything else is `lost`.
- It judges on `effectiveNet`, the score the league counted. That's the same figure round rank uses.

**Official-standings inference.** Music League's standings won't include the bonus. When the export has `[standings]`, inference compares totals *without* the bonus. The bake command prints both figures, so they can be checked against the site.

**Downstream consumers.** These modules read `pointsCounted` or the timelines, so they pick up the bonus automatically. Each gets a check:
- `facts.ts`: runaway leader and similar facts.
- `future.ts` and `projection.ts`:
  - Players whose theme round is still to come carry a pending ±3.
  - Mathematical-alive ceilings add +3 for them and floors subtract 3.
  - The simulation draws the win/lose outcome from each simulated round.
  - This relies on the "each player once" assumption. Without it, projections just note that one player per round moves by ±3.
- `recap.ts` (Play-by-Play): chapter text mentions the theme outcome.
- `inspect.ts` (bake CLI): the standings table gains a `theme` column, plus a "Theme rounds" block listing each outcome and its reason.

**Tests** (`src/__tests__/theme.test.ts`)
- Won, including a tie for first.
- Lost as second.
- Lost as last.
- Skipped, with no submission.
- Submitted but didn't vote under Competitive Mode: forfeited, judged on the counted score.
- A round without results gets no outcome.
- A title that matches nobody gets a warning, and one that matches several gets a warning.
- An override takes precedence.
- No theme rules means identical output to today.
- The breakdown reconciles for every player: the parts sum to `total`.
- Real round 1 fixture: Bob is `won`, +3, and totals 17. The fixture is created from the export in the test setup, never committed.

---

## Milestone 2: Making the ±3 visible

The requirement is that the adjustment can't be missed and always says why.

| Where | What it shows |
| --- | --- |
| Rules banner (Standings, collapsible) | "This league adds a theme bonus: the theme player gets +3 for winning their own round, −3 for anything else, including not submitting. Music League doesn't apply this; this page does." |
| Standings table | A `Theme` column, shown when any outcome exists. It has a green `+3` or red `−3` chip, with the reason on the next line in small text, not only in a tooltip. |
| "How the scores add up" panel | A new segment and legend entry, "theme bonus", in its own colour. The total's label reads e.g. "17 = 14 from votes + 3 theme bonus". |
| Standings timeline | A marker on the round where it was earned. The tooltip splits the round: "14 from votes, +3 theme bonus". |
| Round card / This Round page | A banner at the top, e.g. "Theme: Bob. Bob won his own round, so +3 on the season standings." It includes the note: "The round ranking below is as voted; the bonus applies to the season total." |
| Player page header | A theme status: "Theme round: R1, won, +3", or "Theme round still to come". |
| Bake CLI | A theme column and a theme rounds block, as described in M1. |

**Components**
- `ScoreBreakdownPanel.tsx`, `ui.tsx` (score bar), `ScoreTimeline.tsx`, `TheRaceTab.tsx`, `PlayersPanel.tsx`.
- New: `ThemeChip.tsx` (shared chip + reason) and `ThemeBanner.tsx`.
- The chip uses text and a sign as well as colour, so it doesn't rely on colour alone. The reason is always visible text, never only a tooltip.

**Tests.** Component tests (jsdom) cover:
- The chip renders a sign, the value and the reason.
- The column is hidden in a league without the rule.
- The breakdown label reconciles.
- The timeline tooltip splits the round's points.

---

## Milestone 3: Zero-sum audit

Every ballot nets to zero, so the league-wide net is zero before forfeits. Anything that compares a score to "average", or describes downvotes as unusual, needs checking.

Known issues to fix:
- **`future.ts` "Where games are won"**: with equal budgets the share is exactly 100%. The current `>= 1` check then says downvotes took away *more than* upvotes gave, which is false. Split the cases into more than, exactly as much as, and less than. Also, the card isn't informative when it's fixed by the rules, so hide it when both budgets are fixed and fully spent.
- **Average song score** (superlatives, genres, eras): the league average is about 0, so keep the existing "above/below average" wording and never use ratios. `genres.ts` already does this; check `taste.ts` and the superlatives.
- **Downvote devotion**: new. With a known downvote budget, add `PairStats.downDevotion = downvotes / maxDownPossible`, so "who they target" is comparable across voters.
- **Budget validation**: warn when a ballot doesn't spend exactly +10 / −10. Music League allows under-spending, so this is a warning, not an error.
- **Facts and captions**: sweep every string mentioning downvotes, averages or "more than everyone else". Run against the real league 2 data and read every card.

**Tests**: a synthetic zero-sum league fixture, plus snapshot checks of the fact/card labels produced.

---

## Milestone 4: League 1 history

**Bake**
- For each league in `config.history`:
  - Load its config and export.
  - Redact it with the same redaction map as the current league. The map is built from the union of both leagues' names, so a player gets the same redacted name in both, and colliding surnames stay distinct across leagues.
  - Collect its art, genres and enrichment.
- Manifest and virtual module gain `embeddedRules` (theme rules and budget) and `embeddedHistory: { id, label, files, enrichment, scoring, flooring, totalRounds }[]`.
- Art and genre lookups run over both leagues. Nearly all league 1 art is already in `snapshots/art`.
- Page size: league 1's export is about 170 kB of CSV, and the current page is 912 kB. Expect about 1.1–1.2 MB. That's acceptable, and gzip on Pages cuts it substantially.
- Privacy: league 1 is already published redacted at `docs/league3.html`, so this adds no new exposure. The bake still prints the comment rewrites for review.

**Library** (`src/lib/history.ts`, new)
- Runs `computeStats` for each history league with that league's own rules. League 1 has no theme bonus.
- `joinPlayers(current, history)`:
  - Joins by player ID.
  - Falls back to `identityKey(name)`, with a warning listing anyone joined by name.
  - Anyone unmatched is shown as "new this league".
- Returns `PlayerHistory { leagueId, label, stats: PlayerStats, finish, of }` per player.

**Tests**: ID join, name fallback with a warning, a player absent from history, and the redacted names matching across both leagues.

---

## Milestone 5: Deep player pages

Route: `#player/<slug>`, where the slug is the redacted display name lowercased, e.g. `#player/bob`. There's one page per player, and the Players tab becomes an index of cards linking to them.

A new `src/lib/playerProfile.ts` builds a `PlayerProfile` from current stats, history stats, enrichment and genres. It's pure and unit-tested; components only render it.

Page sections, each with league 1 and league 2 side by side where both exist:

1. **Header**
   - Name, current rank and total, with the full breakdown including the theme chip.
   - League 1 finish, e.g. "4th of 13".
   - Theme status.
2. **Season record**
   - Finish, points, average per song, average round rank, wins, last places, rounds missed voting, and points forfeited.
3. **What they submit**
   - Every song across both leagues: art, play, round, rank, counted score, up/down split, and the comment they wrote.
   - Filterable by league.
   - Best and worst song.
4. **Taste profile**
   - Genre mix against the league, era/decade blend, obscurity, and archetype, all from existing `taste.ts` and `genres.ts`, computed for this player.
   - Sample-size hedges carried over: genres under 4 songs are marked *thin*.
5. **How they vote**
   - Ballot shape: songs backed per round, max-stack rate, and downvote use and spread.
   - Taste alignment (mainstream vs contrarian).
   - New: **what they reward and punish**. Their upvotes and downvotes joined to song genre, era and obscurity, compared with the room: "gives 40% of upvotes to 90s songs vs 22% for the league".
6. **Who they rank**
   - A table of every opponent, showing up, down, net, net affinity and devotion, per league.
   - Their biggest fans and sceptics, and who they back and punish most.
   - Reciprocity: "backs Meredith, Meredith doesn't back them".
   - Links to each opponent's page.
7. **Theme brief**
   - Shown for a player whose theme round is next or still to come: "What is quintessentially Bob?"
   - Their top-rewarded songs and artists, their most-downvoted, their own best-received submissions, and their dominant genres and eras. All from league 1 plus league 2 so far.
   - After their round, **who read them best**: each submission ranked by the theme player's own points, i.e. whose song the theme player liked most.
8. **Comments**: everything they wrote, verbatim and redacted.

Every figure names its sample, e.g. "over 11 rounds" or "from 2 songs". Sections with nothing to say are omitted rather than shown empty.

**Tests**
- Profile builder on a fixture with history.
- A page renders for every player in the demo and in league 2 (smoke test).
- A player with no history.
- A player with one song.
- Links between pages resolve.

---

## Milestone 6: Navigation and usability

Findings from reading the code (not yet checked in a browser or on a phone):
- There are about 25 panels over 6 tabs, with 9 on The Songs and 8 on The Room, and no clear starting point.
- The tab isn't reflected in the URL, so you can't share a link to a tab.
- The tabs are plain buttons, with no `role="tablist"`, `aria-selected` or arrow-key support.
- `FuturePanel` is built but not rendered.
- In round 1, most panels have almost nothing to show.

**Changes**
- Tabs:
  - **This Round**: the default. Theme banner, results with art, standings movement, notable votes, and the next theme brief.
  - **Standings**: race, breakdown, timeline, and `FuturePanel` restored.
  - **Players**: an index linking to the deep pages.
  - **Songs**.
  - **Room**.
  - **Rounds**: Play-by-Play as linkable round pages, `#round/<n>`.
- Hash router (`src/lib/route.ts`): `#this-round`, `#standings`, `#player/bob`, `#round/1`.
  - Back and forward work.
  - The old hash names redirect via the existing `HASH_REDIRECTS`.
- Tabs follow the ARIA tabs pattern, with keyboard support.
- Each panel declares `minRounds` and `minSongs`. Below that, the panel is hidden, or collapsed to a single line such as "Network appears after round 3".
- Header: "League 2 · Round 1 of 12 · Theme: Bob".
- A manual pass in a desktop browser and at a mobile width before publishing, fixing overflow in wide tables.

**Tests**: router parsing and redirects, tab keyboard navigation, and panel gating.

---

## Milestone 7: Publishing

- `npm run bake -- --league league2` builds, inlines, and copies to `docs/v2/index.html`, with art in `docs/v2/art/`. The copy step moves into bake via `publish.single`, so there's no more hand-copying.
- `npm run snapshot -- --league league2` archives the export to `snapshots/league2-rN/` after each round.
- `docs/index.html` becomes a landing page linking League 2 (current) and League 1 (final), plus past editions. It replaces the stale `editions.html`, which lists only round 6.
- The legacy `docs/league*.html` files stay where they are, so existing links keep working.
- **Before every publish**:
  - `tsc -b`, the full test suite, and the build pass.
  - The CLI standings, theme block and comment rewrites have been read.
  - Spot-check the page locally with `npx vite preview`.

**Per-round routine for league 2**:
1. Export.
2. Unzip to `data/league2/export`.
3. `npm run enrich -- --league league2`.
4. `npm run bake -- --league league2`.
5. Review the CLI output.
6. Commit and push.

---

## Order and scope

| Order | Milestone | Needed before | Rough size |
| --- | --- | --- | --- |
| 1 | M0 config and layout | everything | small |
| 2 | M1 theme scoring | round 2 publish | medium |
| 3 | M2 ±3 visibility | round 2 publish | medium |
| 4 | M3 zero-sum audit (known issues only) | round 2 publish | small |
| 5 | M7 publish league 2 round 1 at `docs/v2/` | — | small |
| 6 | M4 history | player pages | medium |
| 7 | M5 deep player pages | — | large |
| 8 | M6 navigation and usability | — | medium |
| 9 | M3 full caption sweep | ongoing, with each new round's data | small |

Milestones 1–5 give a correct, published league 2 with a visible theme bonus. Milestones 6–8 are the larger v2 experience.

## Open questions

None. All resolved:

- A tie for first wins (+3).
- A theme player who didn't vote is judged on their counted score after the forfeit.
- Every player is the theme exactly once, so projections carry a pending ±3 for each player whose theme round is still to come, and each player page shows "theme round still to come".
- League 1 comments appear on player pages, redacted as in `docs/league3.html`.

## M8: Player-page visual overhaul

The player page is correct but text- and number-heavy. This milestone makes the
relevant facts pop with imagery and icons, and tucks the "how this was worked
out" detail into tooltips and drawers. Everything is drawn inline or built from
covers the bake already downloads, so the page still makes no outside requests.

### Recorded decisions (best-guess defaults, no further questions)

- **Display font: Inter Display**, bundled as local `woff2` in `public/fonts`
  (OFL). System font stays for body text. No Google Fonts fetch — it would
  break the "no outside requests" promise.
- **Player colour: derived from covers, palette fallback.** Average one 64px
  cover to a single hue at runtime; if too dull/dark, fall back to a fixed
  12-colour palette keyed by player id. Canvas-less environments (tests) always
  use the palette.
- **Scope: player page + avatars in name cells** (Players grid, standings). Full
  chrome (dials, drawers) stays on the player page only.
- **One ⓘ per block** cap, to avoid popover soup.
- Icons are Lucide path data (ISC) hand-copied into `Icons.tsx` to match the
  existing inline stroke set; no icon dependency added.

### Milestones (each: tsc → tests → build → rebake → screenshot 1280/390 → commit)

- **M1 foundations.** `InfoTip` (tap/hover/focus popover, Esc + outside close,
  ARIA) and `MethodDrawer` (native `<details>`). Type scale (12/14/18/28/44),
  colour roles (pink = nav only, green/red = scores, gold = theme). Bundle Inter
  Display. Move method copy into tips/drawers; neutralise summary chips.
- **M2 icons.** ~12 new icons (signal1–5, cassette/cd/phone/vinyl,
  guitar/mic/synth/sax/banjo) + `popularityIcon`/`eraIcon`/`genreIcon` helpers.
  Place on taste facets, People rows, song headings, tabs, theme line.
- **M3 header + avatars.** Bake 64px thumbnails for top songs. `PlayerAvatar`
  (2×2 cover mosaic → 1 cover → initials). `usePlayerTint` (cover average, palette
  fallback). Rebuilt header: avatar, display-font name, big season numbers,
  `careerStoryline()` line, blurred best-cover backdrop with dark overlay for
  contrast. Avatars in name cells.
- **M4 taste graphics.** SVG popularity dial (submit + reward needles, league
  median), era timeline (dot per song, sized by score), genre family chips.
  Helper `popularityPosition`. Text version kept for screen readers.
- **M5 songs as images.** Best-song hero tile (large cover, score badge),
  runner-up tiles, muted weakest; cover strip on Submissions shaded by score;
  gold theme medal replacing the text chip.
- **M6 tab group + cleanup.** Separate "Season:" tab group; drop dead CSS; final
  screenshots.

### Risks

- Backdrop contrast: dark overlay, verify ≥4.5:1 in screenshots.
- Muddy cover tints: palette fallback when luminance/saturation too low.
