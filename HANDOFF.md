# Handoff: Music League dashboard v2

Read this whole file before touching code. It is the single source of truth
for how the project works today. Updated 2026-10-05 at commit `b12c3ef`.

Other documents:
- `README.md`: scoring rules and metric definitions (user-facing).
- `DESIGN-REVIEW.md`: the open backlog. Pick work from there.
- `archive/`: finished plans and old reviews. They are history only. Their test
  counts, tab names and commands are out of date, so do not follow them.

---

## 1. What this is

A static, backend-free dashboard for a Music League CSV export, built with
React 18, Vite and TypeScript. Tests use Vitest with jsdom. A "bake" step
parses the export at build time and embeds it in the page.

- Published site: **`docs/v2/`**. This is league 2, **"Now That's What I Call
  You"**: 12 players, 12 rounds, currently **1 of 12 played**. GitHub Pages
  serves `docs/`.
- League 1, **"Streaming Consciousness"** (11 rounds, finished), is embedded
  as player history and joined by player id.
- `docs/index.html` is a landing page that links both seasons.
- Six tabs (`src/lib/route.ts` `TABS`): This Round, Standings, Players,
  Songs, Room, Rounds. Plus the routes `#player/<slug>` and `#round/<n>`.

League 2 rules (set in `leagues/league2.json`; Music League does not apply
the theme bonus, this page does):
- Competitive scoring: a player who skips voting forfeits the upvotes their
  song earned that round, but still takes its downvotes.
- No floor, so totals can go negative.
- Each voter has exactly +10 / −10 points per round.
- Theme bonus: each round is themed around one player, read from the round
  title. That player gets +3 if their song wins the round, and −3 if it
  loses or they do not submit. The bonus counts in totals only. The round
  ranking is never changed by it.

## 2. Repository map

```
leagues/league1.json, league2.json   per-league config (scoring, budget, theme, history, publish dir)
data/league{1,2}/export/             the raw CSV exports (multi-file format)
enrich/, enrich/league{1,2}/         years, durations, Last.fm obscurity (baked in)
scripts/bake.mjs                     validate + build + embed. Entry point for publishing
scripts/art.mjs, genres.mjs, years.mjs, enrich.mjs, obscurity.mjs   enrichment fetchers
scripts/snapshot.mjs                 SEASON-1 ONLY: reads src/data, not data/league2 (see §9)
src/App.tsx                          tabs, routing, page layout
src/lib/stats.ts                     every derived metric; computeStats(league, options)
src/lib/theme.ts                     theme-bonus detection and scoring
src/lib/future.ts                    "What can still happen": swing figures, scenario cards, bands
src/lib/projection.ts                Monte Carlo season simulation (projectStandings, 500 runs, fixed seed)
src/lib/route.ts                     hash routing
src/lib/history.ts                   joins league 1 into player profiles
src/components/TheRaceTab.tsx        Standings tab: ThemeBanner, standings table
src/components/FuturePanel.tsx       "What can still happen" card
src/components/RacePredictionPanel.tsx  "The title race" card (bands + projected range)
src/components/ui.tsx                Card, StatTile, SortableTable and other shared pieces
src/components/InfoTip.tsx           InfoTip (ⓘ tooltip) and MethodDrawer (collapsible method text)
src/styles.css                       all CSS, one file
src/__tests__/                       Vitest suites
dist/                                TRACKED build output; must be restored after `vite build` (§3)
docs/v2/                             the published, baked site (commit it after a rebake)
```

Unreferenced but kept: `src/components/Overview.tsx` and `Participation.tsx`.
Ask the user before deleting them.

## 3. Commands (run in this order for every change)

```bash
npx tsc -b 2>&1 | grep -vE 'Unknown user|minimum-release'   # typecheck; those two lines are harmless npm noise
npx vitest run 2>&1 | grep -aE '×|Tests |FAIL'              # expect "496 passed"
npx vite build 2>&1 | grep -aE 'error'; git checkout -- dist; git clean -fq dist/assets   # build check, then RESTORE dist/
npm run bake -- --league league2 --base ./ >/dev/null 2>&1; echo "bake=$?"   # rebuilds docs/v2; expect bake=0
(npx vite preview --outDir docs/v2 --port 4310 >/dev/null 2>&1 &); sleep 3   # serve docs/v2
# ...screenshot (§4)...
pkill -f 'vite preview'
```

Traps:
- `vite build` overwrites the tracked `dist/`. If you skip the restore
  line, the commit fills with build noise.
- Always pass `--base ./`, because the site lives in a subfolder.
- The bake prints a privacy "Note" at the end. That is expected.
- `stats.budget` is only set when a budget is passed to `computeStats`. The
  app passes it from the baked manifest. **Tests that rely on budget
  behaviour must pass `budget: { upvotes: 10, downvotes: 10 }` themselves.**
- Leftover debug tests: if you write a scratch `src/__tests__/zz-*.test.ts`
  to print values, delete it before committing.

## 4. Visual check (required for any UI change)

The user has rejected changes that were never looked at. **Take a
screenshot, open the image with the image reader, and look at it before
saying a layout works.** Never put "verified" in a commit message or report
unless you did.

There is no playwright npm package. Use the headless-shell binary directly:

```bash
H=~/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell
mkdir -p /tmp/shot
"$H" --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --virtual-time-budget=6000 \
     --window-size=1440,2800 --screenshot=/tmp/shot/full.png "http://localhost:4310/#standings"
```

- Check widths of 1440 (desktop) and 390 (phone). Only the headless shell
  honours widths under about 500px.
- **Window height matters.** The capture is only the top W×H of the page.
  On Standings, "The title race" starts at about y=1550, so use a height of
  2800 or more. Cropping (`sips`, `--cropOffset`) proved unreliable, so make
  the window taller instead. Images over 4000px tall are downscaled when
  viewed and become hard to read.
- URLs: `#this-round`, `#standings`, `#players`, `#songs`, `#room`,
  `#rounds`, `#round/1`, `#player/bob`, `#player/caroline-c` (redacted
  slug). Bob and Caroline played both seasons, so their pages show season
  tabs.
- Delete `/tmp/shot` afterwards.

## 5. Working rules (from the user, standing)

1. **One small change at a time.** Run §3, then §4, then make a **new
   commit** (never amend) with a message body that explains why. The user
   iterates fast and often reverses decisions. A small commit makes each
   reversal cheap.
2. **Do not push** unless asked. `origin/main` is currently at `b12c3ef`,
   so everything up to now has been pushed by the user.
3. **Information should pop.** The figure that matters is big and bold. The
   method and caveats go in an `InfoTip` (ⓘ) or a `MethodDrawer`, not in
   grey paragraphs.
4. **The only outside request allowed is Spotify, and only on play.** Fonts
   and art are bundled or baked.
5. **Correct maths beats nice copy.** Two past notes were removed because
   they were mathematically wrong (§8). If a sentence claims a number,
   check how the number is computed.
6. Report honestly and briefly. Say what you checked and what you did not.

## 6. The Standings tab today (most recent work)

Render order (`src/App.tsx`, around line 256):

1. **`<ThemeBanner/>`** (exported from `TheRaceTab.tsx`): a full-width
   banner explaining the ±3 theme bonus.
2. **`<FuturePanel/>`**, "What can still happen", built from `future(stats)`
   in `src/lib/future.ts`:
   - Five stat tiles:
     - Rounds left
     - Best round so far
     - Typical winning round (the median round winner)
     - **Biggest one-round swing**: best song result minus worst, e.g.
       +14 − (−25) = 39
     - **Round ceiling**, explained below
   - Up to three scenario cards. Each is chosen only if it is interesting:
     The title, Last place, Too close to call, plus kingmaker / form /
     downvote exposure / fragile support once enough rounds exist.
   - The "Most forfeited" and "Most rounds skipped" boxes were removed.
     They duplicated the table.
3. **`<TheRaceTab/>`**:
   - **"Where it stands"**: a single sortable table. The columns are the
     terms of one identity:
     `upvotes − downvotes − forfeited + floored + theme = score`.
     A term column is hidden when it is zero for everyone. A
     "didn't vote" flag sits beside the player's name. On phones the
     score column is sticky.
   - **`<RacePredictionPanel/>`**, "The title race":
     - A header line, "% is each player's chance of winning", with an
       InfoTip.
     - **Named bands** (`future(stats).bands`). Each row shows the
       standings rank, the name, and **the win % as the bold headline
       figure**, with "−N back" underneath. The points score is not shown.
       Rows within a band are **sorted by win %, descending**, while the
       rank number stays the standings rank.
     - "Where they could finish": each live player's 10th–90th percentile
       final score and median.
     - A `MethodDrawer`, "How the simulation works".
     - **There is no bar chart.** It was added, removed, re-added and
       removed again. The user's latest decision is bands only.
   - `<ScoreTimeline/>` (still draws 12 overlapping projection fans; see
     the backlog).

### The maths behind it (in `src/lib/future.ts`)

- **Win share** = the fraction of 500 simulated seasons a player finished
  first (`projectStandings`). Each simulated round reuses real ballots'
  shapes. Non-voters keep skipping at their observed rate.
- **Bands** (`winProbabilityBands(ranked, winShareOf, clinchedId?, eliminatedIds?)`):

  | key | label | rule |
  |---|---|---|
  | `locked` | Clinched | **maths**: no rival can catch them even with a perfect run |
  | `crowned` | One hand on the trophy | win share ≥ 90% |
  | `yourstolose` | Yours to lose | ≥ 65% |
  | `drivers` | Flip of a coin | ≥ 40% |
  | `stillinit` | Still in it | ≥ 10% |
  | `chance` | So you're telling me there's a chance | < 10% and not eliminated |
  | `gameover` | Game over | **maths**: cannot reach the leader even with a perfect run |

  Clinched and Game over are **never** assigned from the win share. A 100%
  or 0% simulation result does not mean certainty. The other bands come
  from the simulation. Empty bands are omitted.
- `maxGain = roundsLeft × perRound`, where `perRound = ceiling − min(0, worstObserved)`.
- **Round ceiling** = `perSongLimit × (rosterSize − 1)`, where:
  - `rosterSize` is the number of players with any song or any vote
    (12 here).
  - `perSongLimit` is the budget's upvotes (10) when a budget is
    configured, else the largest single vote observed.
  - For league 2 the ceiling is 10 × 11 = 110.
- `contentionBands` is a legacy gap-based banding, used only when the
  finish line (total rounds) is unknown. In that case there is no win
  share, and band rows fall back to showing points.
- `forfeitAwareNote(chaser, gapPts)` produces the one-line non-voter note:
  "But none of that is reachable while they keep skipping!"

## 7. History of the work (condensed, oldest first)

- **Season 1** (before `ba6b45f`): parser, metrics, redaction, art, genres,
  snapshots, network and future analysis.
- **v2 M0–M7**: league config files and theme-bonus scoring; the bonus
  shown everywhere a total appears; a zero-sum audit; league 1 as history;
  deep player pages and hash routing; the This Round tab; published to
  `docs/v2`.
- **UX passes**: tab gating (Room relationships after 3 rounds); player
  sub-tabs (Summary / Submissions / Relationships / one per season).
- **M8 player-page overhaul** (`807a23d`…`21917e3`): InfoTip/MethodDrawer;
  Inter Display bundled; category icons; hero header with cover-mosaic
  avatar and player tint; taste graphics (popularity dial, era timeline,
  genre chips); best-song tile; theme medal.
- **Season tabs fix** (`01164be`): any full-width direct child of the
  player page's `main.grid` needs `grid-column: 1 / -1`.
- **Design review** (`DESIGN-REVIEW.md`), then G7 round-tab highlight, G8
  phone layout, G9 hide single-value columns, and G1 remove duplicate
  tables.
- **Taste rework**: one legend; dots for submissions and rings for upvotes;
  upvoted/downvoted genres on net points; fixed series colours.
- **League names** (`b4ead84`), set by `label` in `leagues/*.json` and
  written into the page `<title>`.
- **Standings tab rework** (`96f248e`…`b12c3ef`, 2026-10):
  - The merged standings table.
  - Win-probability bands that went through several iterations. They now
    use maths-only certainty bands, show the win % as the headline figure,
    and sort by win % within a band.
  - The theme banner moved to the top of the tab.
  - "The title race" folded into one card.
  - The win-% bar chart was removed.
  - Forfeit boxes were removed.
  - The swing tile was relabelled.
  - The round ceiling was corrected to use the full roster and the budget.
  - The wrong non-voter maths was removed (§8).

## 8. Lessons (each one cost a round of rework)

- **Check the maths behind any sentence with a number in it.** One note
  said a non-voter had an "inflated per-round target". That was wrong: a
  competitive non-voter loses ground every round, so no target is
  reachable. Another was the "Round ceiling 48". It came from the largest
  vote seen × songs, not from the real budget × other voters, so it
  understated the true 110.
- **Labels must say what the number is.** "Biggest swing seen" was really
  "best song minus worst song in one round". Name it exactly.
- **Certainty is a maths claim, not a statistic.** Never label someone
  clinched or out from a simulation share.
- **Before hiding a "single-value" column, check that no cell says
  something different in kind.** "Rounds voted" carried the only
  "never voted" flag.
- **The player tint is decoration, not data.** It is derived from album
  covers. Never use it for a series that sits beside `--pos` / `--neg`.
- **A shared legend must match what is plotted.**
- **Deleting a component's last use orphans files and imports.** `tsc`
  will not warn about an unused exported module, so search for references
  yourself.
- **A full-width child of a CSS grid needs `grid-column: 1 / -1`.** Cards
  get this from the `wide` prop. A long subtitle is capped at 80ch unless
  the card has `wideSubtitle`.

## 9. Updating for a new round (not yet done for v2; check carefully)

1. Put the new export's CSVs in `data/league2/export/`. The export is
   cumulative, so replace the old files.
2. Enrich new tracks: `npm run enrich -- --league league2` (years) and
   `npm run obscurity -- --league league2` (Last.fm; reads `LASTFM_KEY`
   from `.env`, never print it). Art is fetched during the bake.
3. If the theme player cannot be read from the round title, add them to
   `theme.schedule` or `theme.overrides` in `leagues/league2.json`.
4. Bake (§3), then check that the bake's printed standings match Music
   League's site. Theme bonuses will differ from the site, because Music
   League does not apply them.
5. **`scripts/snapshot.mjs` predates league configs.** It archives
   `src/data` and `dist`, not `data/league2` and `docs/v2`. `src/data` is
   an untracked copy of `data/league1/export`. Do not rely on the snapshot
   script for v2. Either update it to read `--league`, or copy the folders
   by hand into `snapshots/`. Ask the user which they prefer.
6. As rounds accrue, gated panels unlock on their own (e.g. Room
   relationships at 3 rounds). Re-screenshot every tab.
