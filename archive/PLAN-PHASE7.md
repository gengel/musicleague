# Phase 7 — Close the wireframe gaps, surface genre & obscurity

## Context

Phase 3 collapsed 8 tabs → 6 and Phase 4 added narrative Play-by-Play chapters, but
a comparison against `wireframes-v2.html` (the canonical target) and a data audit
turned up two classes of gaps:

1. **Structural mismatches** — the built tabs render every module the wireframe
   called for, plus a few extras that shouldn't be there. But the *arrangement*
   is thinner than the mockup: gateway cards are one-liners, some visual
   elements are missing (bars, tag rows, prose bios), and one panel (`RoundsPanel`)
   is duplicated across two tabs.
2. **Under-used data** — the enrichment pipeline resolved 68 obscurity values
   (Last.fm listeners) and 65 artist genres, but neither appears on individual
   song rows or in the standard song cards. Obscurity powers only two
   superlatives; genre lives only inside the aggregate GenrePanel. The quadrant
   panel that PLAN.md's Phase 3.5 called for (era × obscurity, self-suppressing)
   was never built.

Phase 7 closes these gaps in three passes, in priority order: **de-duplicate**,
**surface**, **prose**.

---

## Pass A — De-duplicate and prune (fast, high signal)

Small footprint. These are outright bugs where the current build shows the same
data twice, or where a panel lives on the wrong tab.

1. **Remove `RoundsPanel` from `TheSongsTab`** (`src/components/TheSongsTab.tsx`).
   The "Round by round" table belongs only under Play-by-Play per the wireframe.
2. **Remove `RoundsPanel` and `Participation` from `PlayByPlayTab`**
   (`src/components/PlayByPlayTab.tsx`). Chapters already carry per-round
   winner + song list; the extra table dump duplicates them. Participation's
   "cost of not voting" fact belongs inside a chapter or on The Race.
3. **Move `Participation` into `TheRaceTab`** — forfeit accounting is a
   standings-adjacent story, not a round-recap story.
4. **Remove the "At a glance" tiles card from `Overview`**
   (`src/components/Overview.tsx`). The wireframe deliberately chose prose
   Headlines over KPI tiles; the tiles now conflict with the design intent.
   (Alternative: keep only if the user prefers them — flag for confirmation.)

**Verify:** run `npm test`; the App tests will need light updates for the
removed panels but 379+ should still pass.

---

## Pass B — Surface genre & obscurity everywhere they belong

The data is already loaded — this pass wires it into components that don't
currently see it.

### B1 — Tag row on song cards

Wireframe song rows show a compact tag line under the title:
`2018 · deep cut · alt · covers Beastie Boys`.

Add a shared `<SongTags>` component in `src/components/SongMedia.tsx` that
renders (only what exists, silently skipping absent fields):

- Year tag (`2018`)
- Obscurity band tag from listener count → `deep cut` / `known` / `hit` /
  `mega-hit`. Thresholds in a new `src/lib/obscurity.ts` helper.
- Genre chips (up to 2), pulled from `embeddedGenres[artist]`
- Duration tag when > 6 min or < 2 min (`8:12` or `1:47`)
- Cover-of tag when `song.cover?.of` exists (`covers "Sabotage"`)

Wire it into:
- `SongsPanel` song rows (`src/components/SongsPanel.tsx`)
- Overview `TopSongs` showcase cards (`src/components/Overview.tsx`)
- `PlayByPlayTab` chapter song rows (`src/components/PlayByPlayTab.tsx`)
- `PlayersTab` submission rows (`src/components/PlayersTab.tsx`)

### B2 — Sort/filter chip bar on the songs collection

The wireframe puts a sort selector and a filter chip row above the song list
(Sort: Score / Year / Popularity / Length / Upvotes / Downvotes / Breadth ·
Filter: Decade / Genre / Round / Submitter / Covers / Forfeited).

Two of those (Popularity, Length) require the obscurity and duration fields we
just added — the whole panel is more useful with them present.

Modify `src/components/SongsPanel.tsx` to add sort keys and filter chips. Use
existing `SortableTable` machinery where possible; add filter state as component
state.

### B3 — Build the obscurity × era quadrant panel

`computeObscurityQuadrants(songs, ...)` in `src/lib/taste.ts` already returns
per-quadrant score means. Build a new `QuadrantPanel` component that renders a
2×2 grid: old-obscure / old-known / new-obscure / new-known, showing the mean
score and the top song in each cell.

Place it in `TheSongsTab` between DecadePanel and SongsPanel. Self-suppress
(return null) when either axis is missing per I6.

### B4 — Add popularity band table to `TheSongsTab`

Wireframe (line 401-ish) shows a compact table binning songs by listener count:
"Deep cuts (<20k): mean +3.4 pts · Known (20k–500k): +1.1 · Hits (500k–5M):
−0.4 · Mega-hits (>5M): −1.6". This is the answer to "what wins here, by
popularity" and pairs with the decade table.

New helper `computePopularityBands(songs)` in `src/lib/taste.ts`. Renders as a
small card ("What wins here, by popularity") next to DecadePanel.

### B5 — Genre column in the songs collection

Add a `Genre` column to `SongsPanel`'s table (top genre or `—`).

### B6 — Add "Avg pop" column to the era table

Wireframe (Players tab) shows an Avg pop column that mixes into archetype
labels. Compute per-player mean obscurity for songs submitted, add as
`avgObscurity` on `EraProfile` in `src/lib/taste.ts`, render in `EraTable`.
Format as a short label ("mostly deep cuts" / "mostly hits") rather than a
number, since the raw listener figure is inscrutable.

---

## Pass C — Prose and structural fills

Larger footprint. These match the narrative voice of the wireframe.

### C1 — Overview gateway cards get their teasers back

Currently 4 one-liners. The wireframe fills each with a small visualization:
- **The Race:** a stacked bar of projected win share (from `projection.ts`).
- **The Songs:** the decade winner ("2000s songs beat all others: mean +3.1").
- **The Room:** the mutual-admiration pair or the graph's densest edge.
- **Play-by-Play:** the round that lost the most points to forfeit.

Modify `src/components/Overview.tsx`. Reuse `projection.ts` and existing stats.

### C2 — Play-by-Play "After: standings" line per chapter

Each chapter card in `PlayByPlayTab` gets a footer line: "After: Bo 42 · Ada 39
· Cleo 37 · …". Cumulative score after the round, top 5 shown.

Use `stats.timelines` (already Map<playerId, StandingPoint[]>) — look up each
player's score at that round's sequence.

### C3 — Selected-player prose bio on Players tab

Currently the player detail shows subtabs immediately. Wireframe (line 720ish)
opens with a bio paragraph: "*Ada submits from median 2011, spends upvotes on
1996 — a double agent. Her 12 pts against Gus is the season's coldest
shoulder.*"

Add a `describePlayer(profile, stats)` template in `src/lib/taste.ts` that pulls
from era profile, pair extremes, and archetype. Render at the top of
`PlayerDetail` in `PlayersTab.tsx`.

### C4 — The Race — restore "Note" column

Add a computed commentary column to the standings table. Rules:
- If `pointsCounted` leader and `downvotesReceived < median`: "most consistent"
- If highest `avgBreadth`: "most broadly liked"
- If highest `roundsMissedVoting > 1`: "forfeited N pts"
- Otherwise leave blank

Renders as a `.dim small` chip in the last column of `TheRaceTab`'s "Where it
stands" table.

### C5 — LopsidedPair visual bar

The `LopsidedPair` panel in `TheRoomTab.tsx` currently shows text. Add a
horizontal split-bar: left half = points A→B, right half = points B→A, colored
by relative magnitude. Existing `.dbar` classes may already work.

### C6 — Praise-vs-blame raw counts

Add `Backed` and `Targeted` count columns to the `PraiseBlamePanel` table
(voters who upvoted / downvoted this submitter at least once). The percentages
alone hide sample size.

---

## Order of implementation

Recommended sequence:
1. **Pass A** (de-duplicate) — clears clutter first so B/C changes land on a
   clean tab structure. Half a day.
2. **B1 (song tags)** — biggest payoff for smallest change. Every song row on
   every tab gains three or four tag chips. Half a day.
3. **B3 + B4 (quadrant panel + popularity band table)** — the obscurity story
   the wireframe planned, now fully told. One day.
4. **B2 (sort/filter chip bar)** — depends on B1's tags being visible.
5. **C1 (Overview gateways)** — highest-visibility prose fill.
6. **B5 / B6 / C2–C6** — polish in whatever order.

---

## Critical files

- `src/components/Overview.tsx` — A4, C1
- `src/components/TheSongsTab.tsx` — A1, B3, B4
- `src/components/TheRaceTab.tsx` — A3, C4
- `src/components/TheRoomTab.tsx` — C5, C6
- `src/components/PlayersTab.tsx` — B1 (submissions), B6, C3
- `src/components/PlayByPlayTab.tsx` — A2, B1 (chapter songs), C2
- `src/components/SongsPanel.tsx` — B1, B2, B5
- `src/components/SongMedia.tsx` — B1 (new `<SongTags>`)
- `src/lib/taste.ts` — B3 (already has quadrant), B4 (new bands), B6 (avgObscurity), C3
- `src/lib/obscurity.ts` (new) — band thresholds and label helper

## Verification

- `npm test` after each pass; update the App tests that reference removed panels
  (`RoundsPanel` on Songs tab, `Participation` on Play-by-Play).
- Rebuild with `npm run bake -- snapshots/r6-2026-08-14/export/ --genres` and
  spot-check each tab in the browser at `http://localhost:4173`.
- I5 audit test (superlativePlacement.test.ts) will need no changes — no new
  superlatives are added in Phase 7.

## Not in scope

- Round-7 dry run (PLAN.md Phase 5) — separate exercise, tools not code.
- Phase 6 obscurity fetcher — already done, Last.fm data is live.
- Redesigning the aesthetic — this closes structural gaps, not visual polish.
