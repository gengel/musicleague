# Handoff: Music League dashboard v2

For whoever picks this up next. Read this, then `DESIGN-REVIEW.md` (the
backlog), before touching code. Written 2026-09-30, at commit `8830bd0`.

## 1. What this is

A static, backend-free dashboard for a Music League CSV export. React 18,
Vite and TypeScript; tests are Vitest with jsdom. The export is parsed at
bake time and embedded in the page. The published site is **`docs/v2/`**
(league 2, "Music League 2", currently 1 of 12 rounds played), with league
1 joined in as player history. `README.md` explains the scoring rules and
metric definitions. `PLAN-v2.md` is the original plan and records the M8
decisions.

## 2. Commands

```bash
npx tsc -b 2>&1 | grep -vE 'Unknown user|minimum-release'   # typecheck; those two lines are harmless npm noise
npx vitest run                                              # expect 477 passed
npx vite build && git checkout -- dist && git clean -fq dist/assets   # build check, then RESTORE the tracked dist/
npm run bake -- --league league2 --base ./                  # rebuilds docs/v2 (config: leagues/league2.json)
npx vite preview --outDir docs/v2 --port 4220 &             # serve it; stop with: pkill -f 'vite preview'
```

Gotchas:
- `vite build` overwrites the tracked `dist/`. Always restore it
  afterwards, as shown above, or the commit fills with build noise.
- `--base ./` is required, because the site is hosted in a subfolder.
- The bake prints a privacy "Note" at the end. That is expected, not an
  error.

## 3. Checking visually (required for any layout change)

The user has rejected layout "fixes" that were never looked at. **Take a
screenshot and actually open the image before you claim a layout works.**
No playwright/puppeteer npm package is installed, so use the headless
shell binary directly:

```bash
H=~/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell
$H --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --virtual-time-budget=6000 \
   --window-size=1440,1400 --screenshot=/tmp/x.png "http://localhost:4220/#player/bob"
```

- Check 1440px and 390px (phone). The headless shell honours narrow
  widths; normal Chrome `--headless=new` does not go below about 500px.
- Useful URLs: `#this-round`, `#standings`, `#players`, `#songs`, `#room`,
  `#rounds`, `#round/1`, `#player/bob`, and `#player/caroline-c`
  (redacted slug). Bob and Caroline played both leagues, so they show the
  season tabs.
- Very tall screenshots (4000px or more) get downscaled when viewed. For
  detail, shoot a short window, around 1400px tall.
- Delete `/tmp` screenshots afterwards.

## 4. Work done to date

Season-1 work (before `ba6b45f`): the parser, metrics, redaction, art,
genres, snapshots, and the network and future tabs.

v2 (`6976f5d`…`68415a5`), in order:
- **M0–M7**:
  - league config (`leagues/*.json`) and the theme bonus (±3) in scoring
  - the bonus shown everywhere a total appears
  - zero-sum audit
  - league 1 embedded as history, joined by player id
  - deep player pages (`#player/<slug>`) with hash routing (`src/lib/route.ts`)
  - This Round landing tab
  - published to `docs/v2`
- **UX passes**:
  - probability bands and theme schedule
  - scannable This Round
  - tab gating (Room relationships after 3 rounds)
  - player sub-tabs: Summary / Submissions / Relationships, plus one tab
    per season
  - nemesis, taste block, history enrichment, mobile fixes
- **M8, the player-page visual overhaul** (commits M1–M6, 2026-09):
  - `InfoTip` and `MethodDrawer` (`src/components/InfoTip.tsx`)
  - type scale; Inter Display bundled locally (no outside font requests)
  - category icons (`Icons.tsx`: `popularityIcon`, `eraIcon`, `genreIcon`)
  - hero header: cover-mosaic avatar (`PlayerAvatar.tsx`), player tint
    from covers with a palette fallback (`src/lib/tint.ts`), blurred
    backdrop, and the `careerStoryline` line ("CLIMBED 12TH → 1ST")
  - taste graphics: popularity dial, era timeline, genre chips
  - best-song hero tile, cover strip, theme medal (`ThemeChip.tsx`)
  - labelled season tab group; name avatars in the Players grid
  - 64px thumbnails baked for avatars
- **Season tabs on the same row, right-aligned** (`01164be`). The earlier
  attempts `f6e001f` and `68415a5` did not work. The cause was that
  `.scope-tabs` is a direct child of the multi-column `main.grid`, so it
  was only as wide as its content. The fix is `grid-column: 1 / -1`. On
  phones (620px and below), the section and season groups each wrap to
  their own line with compact, icon-free pills. Checked in screenshots at
  1440, 1100, 820 and 390px. **Any new direct child of the player page
  that should be full-width needs `grid-column: 1 / -1`** (cards get this
  from `wide`).
- **Today:** a design review of every tab (`DESIGN-REVIEW.md`).
- **Fix #round/N highlighting (G7)** (`a75e5fc`).
- **Fix phone layout problems (G8)** (`3ac84d6`): nav scroll strip, `nowrap` on names, hidden secondary columns, contained Songs heatmaps.
- **Hide single-value columns and filters (G9)** (`53ad55c`): Round column and filter chips in Songs, Spent in Room, Per song / Best round / Rounds voted in Standings.
- **Remove the duplicate tables (G1)** (`0ffb23f`): "Points received" from
  Room and "Players, end to end" from Players. Follow-up `70f2d6d` deleted
  the then-orphaned `PlayersPanel.tsx`, tidied the import list the deletion
  left behind, and renamed the archetype card to "Archetypes" so two cards
  are no longer both called "Players".
- **Taste block rework** (`a12fb06`, `08bc77f`, `e3a717c`, `8663fde`,
  `86af080`): one shared legend, era timeline as dots (submissions) plus
  rings (upvotes), and genre split into upvoted/downvoted computed on
  **net** points, so a genre cannot appear in both lists.
- **Taste series colours** (`981ab5d`): the "submissions" series had been
  using the player tint, which is derived from their album covers, while
  upvotes/downvotes use fixed `--pos`/`--neg`. A pink-tinted player made
  submissions and downvotes nearly identical. Submissions now use a fixed
  `--series-submit`. **Never use the player tint for a data series.** The
  legend also claimed a downvotes series the dial and era timeline do not
  plot; it now lists only what is shown.
- **Non-voter flag** (`8830bd0`): G9 hid the "Rounds voted" column, which
  also carried the only "never voted" marker. The flag now sits beside the
  player's name so it survives both that and the phone column hiding.

## 5. Current state

- The build and typecheck are clean, **477 tests pass**, and `docs/v2` is
  baked and in sync with `src` (a rebake produces no diff).
- **`origin/main` is at `08bc77f`**, so eight of these commits were pushed.
  The commits after it are local only. Check with the user before pushing;
  the standing rule is not to push to `main` unless asked.
- **Known open issues:** `DESIGN-REVIEW.md` §1–8 is the remaining backlog.
  Nothing is known broken.
- **Older backlog (`REVIEW-v2.md`):**
  - `PlayerDetail` in `PlayersTab.tsx` is still dead code (item 6). It only
    renders when `onOpenPlayer` is absent, which never happens in the app.
  - `Overview.tsx` and `Participation.tsx` are also unreferenced (pre-dating
    this work). Confirm before deleting: they may be wanted again.
  - The stale `docs/index0-2.html` and `docs/league0-2.html` are still
    there (item 5).
  - `downDevotion` has not been added (item 9).
  - Items 1–3 and 8 were not re-checked.

## 6. Next steps, in order

Do one item at a time: make the change, typecheck, run the tests, build
and restore `dist`, rebake, screenshot and look at it, then commit with a
new commit (never amend). Don't push unless asked.

1. Gate early-season panels (G2). This is the biggest remaining clutter
   cut. Add one shared helper and apply it panel by panel, with unit
   tests. A gated panel should become one slim "unlocks after round N"
   line, not an empty card.
2. The remaining small bugs: era spectrum label collisions on Players, and
   the orphaned "Show all 12 songs" link on Rounds.
3. The remaining duplicate lists: Songs "Room-uniting"/"Most divisive"
   (the table is already sortable on both), and the four "What wins here"
   panels merged behind a toggle.
4. Move method subtitles and runner-ups into `InfoTip` (G4, G5).
5. Impact work: This Round podium, Players card grid, Standings chart
   defaults, round page.

## 7. Lessons from the work so far

- **Before hiding a "single-value" column, check that no cell in it says
  something different in kind.** "Rounds voted" was "1 of 1" for everyone
  who voted and "never voted" for those who did not; hiding it lost the
  flag entirely. A signal that only appears in the exception rows is the
  easiest thing to delete by accident.
- **The player tint is decoration, not data.** It comes from their covers
  and can land on any hue, so it must not encode a series that sits beside
  `--pos` / `--neg`.
- **A shared legend must match what is actually plotted.** It sat above
  three panels but described a series only one of them had.
- **Removing a component's last usage usually orphans a file.** After any
  deletion, check for now-unreferenced files and imports; `tsc` will not
  tell you, because an unused exported module still compiles.

## 8. User preferences (standing)

- Relevant information should pop; method and detail go in tooltips or
  drawers.
- No outside requests except Spotify, and only on play. Fonts and art are
  bundled or baked.
- Commit after each milestone, only once it is verified.
- Report honestly. If something wasn't checked, say so. Never write
  "verified" in a commit message without a screenshot you actually looked
  at.
