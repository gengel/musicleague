# Handoff: Music League dashboard v2

For whoever picks this up next. Read this, then `DESIGN-REVIEW.md` (the
backlog), before touching code. Written 2026-09-30, at commit `01164be`.

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
npx vitest run                                              # expect 475 passed
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
- **Hide single-value columns and filters (G9)**: Round column and filter chips in Songs, Spent in Room, Per song / Best round / Rounds voted in Standings.

## 5. Current state

- The build is clean, 475 tests pass, and `docs/v2` is baked and current.
- **Known open issues:**
  1. `DESIGN-REVIEW.md` §1–8 lists the remaining backlog.
- **Older backlog (`REVIEW-v2.md`), status as checked today:**
  - Gate helper (G2): add shared helper and apply panel by panel to early-season noise.
  - `PlayerDetail` in `PlayersTab.tsx:173` is still dead code (item 6).
  - The stale `docs/index0-2.html` and `docs/league0-2.html` are still
    there (item 5).
  - `downDevotion` has not been added (item 9).
  - Items 1–3 and 8 were not re-checked.

## 6. Next steps, in order

Do one item at a time: make the change, typecheck, run the tests, build
and restore `dist`, rebake, screenshot and look at it, then commit with a
new commit (never amend). Don't push unless asked.

1. Remove the duplicate tables and panels (G1, the Songs lists, Room
   "Points received", Players "end to end"). Update any tests that assert
   those panels exist.
2. Move method subtitles and runner-ups into `InfoTip` (G4, G5).
3. Impact work: This Round podium, Players card grid, Standings chart
   defaults, round page.

## 7. User preferences (standing)

- Relevant information should pop; method and detail go in tooltips or
  drawers.
- No outside requests except Spotify, and only on play. Fonts and art are
  bundled or baked.
- Commit after each milestone, only once it is verified.
- Report honestly. If something wasn't checked, say so. Never write
  "verified" in a commit message without a screenshot you actually looked
  at.
