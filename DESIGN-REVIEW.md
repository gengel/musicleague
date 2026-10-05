# Backlog: design review of the v2 dashboard

The open work list. This file merges two earlier sources:
- the original design review (2026-09-30, from screenshots of `docs/v2` at
  1440px and 390px with 1 of 12 rounds played)
- the older post-M7 review (now `archive/REVIEW-v2.md`)

Last pruned on 2026-10-05 at `b12c3ef`. Work through it with the procedure
in `HANDOFF.md` §3–§5: one item, verified, one commit.

Tags: **[impact]** makes something pop, **[declutter]** removes or merges,
**[bug]**. Effort: S = under an hour, M = a few hours, L = a day or more.
Items marked *(not re-checked)* were last examined before the Standings
rework. Confirm they still apply before starting them.

---

## Suggested order

1. Small bugs: the era-spectrum label collisions (Players), the orphaned
   "Show all N songs" link (Rounds), and the "round(s)" pluralisation
   (player page).
2. **G2 early-season gating.** This is the biggest clutter cut while only
   one round has been played.
3. The Score-over-time projection fans (Standings).
4. Duplicate lists on Songs and Room.
5. G4/G5: move method text and runner-up lines into `InfoTip`s.
6. Impact work: This Round podium, Players card grid, round page.

---

## 1. Cross-cutting

**G2 [declutter, M] Nothing is gated for an early season.** With one round
played:
- the Rounds tab's four superlatives all name the same round
- Songs shows 8 superlatives from 12 songs, and "Hold the Line" appears in
  three of them
- the era×popularity and era×genre heatmaps are mostly `n=1` cells
- player-page taste sections rest on a single song

Only Room's Relationships panel is gated, until 3 rounds. Add one shared
helper in `src/lib/`, for example `gate(minRounds | minSamples)`, and apply
it panel by panel with unit tests. A gated panel should become one slim
"unlocks after round N" line, not an empty card.

**G3 [declutter, S] The "Season in progress" banner shows on every tab**
(`src/App.tsx`, the `stats.inProgress` block), even though the header
already says "1 of 12 rounds". Keep it on This Round only, or turn it into
a header pill. Ask the user first: they kept the Standings tab's banners
on purpose.

**G4 [declutter, M] Method text appears as grey subtitles on most cards
outside Standings and the player page.** Move it into an `InfoTip` on the
title, or into a `MethodDrawer`. Keep a subtitle only when it changes how
the numbers read.

**G5 [declutter, S] Superlative cards carry three grey runner-up lines.**
Move them into a tooltip. This applies on Songs and Rounds.

**G6 [impact, M] Only the player page has visual hierarchy.** Reuse the
cover art, big numerals and `PlayerAvatar` elsewhere: a podium on This
Round, and a card grid on Players.

**G9 follow-up [declutter, S].** The single-value-column rule uses three
different tests:
- Songs uses `league.rounds.length`
- Standings uses `roundsPlayed`
- Room uses "all values equal"

Unify these into one helper. **Before hiding any column, check that no
cell says something different in kind** (see the HANDOFF lessons).

## 2. This Round

- **[impact, M]** The "Latest result" tile and ranking row 1 repeat each
  other. Replace both with a top-3 podium with covers, then "Show all".
- **[declutter, S]** In the "Next up" brief, tied lists carry no signal.
  For example, "Artists they reward" lists six artists all tied at 2. Show
  at most three items, and hide a list when all its values are equal.
- **[declutter, S]** In the mini-standings, CHANGE equals TOTAL in round 1.
  Hide CHANGE until round 2.

## 3. Standings

Most of this tab was reworked in 2026-10. See `HANDOFF.md` §6 for the
current design. Still open:

- **[impact, M] Score over time draws 12 overlapping projection fans**,
  which read as mud. Default to the actual lines only, with the top 3 in
  full colour and the rest dimmed. Show a player's fan only on hover or
  when they are selected.
- **[declutter, S] The THEME column** shows "—" in 11 of 12 rows. Consider
  hiding it until two or more players have a bonus.

Decided, do not reopen unless the user asks:
- The theme banner stays as a full-width banner at the top of the tab.
- "What can still happen" stays above the table, including the
  "Rounds left" tile.
- The title race uses **bands only**, with no bar chart. The win % is the
  headline figure, and rows are sorted by win % within each band.

## 4. Players

- **[bug, S] Era-spectrum labels collide** (for example, "Megan 2010 /
  Greggo 2011"). Stagger them, or put avatars on the axis and show names
  on hover.
- **[impact, M]** Replace the picker chips and tables with a 12-card grid.
  Each card shows the avatar, rank, score, archetype and `careerStoryline`,
  and opens the player page.

## 5. Songs

- **[declutter, S]** Cut the eight superlatives to four, and never name
  the same song twice.
- **[declutter, M]** Merge the four "What wins here" panels into one panel
  with a segmented toggle. The four are era (`TheSongsTab.tsx`), popularity
  (`PopularityBandsPanel.tsx`), era×popularity (`QuadrantPanel.tsx`) and
  era×genre (`EraGenrePanel.tsx`). Gate the heatmaps under G2.
- **[impact, S]** Move "Every song" to the top of the tab.
- **[declutter, S]** Remove "Room-uniting songs" and "Most divisive songs"
  (`SongsPanel.tsx`). The table is already sortable on both.

## 6. Room

- **[declutter, S]** The gated Relationships card reads as broken. Make it
  a slim full-width notice.
- **[declutter, M]** "Where the upvotes go" and "Where the downvotes go"
  have the same shape. Merge them into one voter table.
- **[impact, S]** Non-voters are silently missing from the voter tables.
  Add a "3 didn't vote" line.

## 7. Rounds and the round page

- **[bug, S]** "Show all N songs ↓" (`PlayByPlayTab.tsx`) sits outside its
  card. Move it into the card footer.
- **[declutter, S]** The sentence "Bob's '…' won the round on +14 pts"
  repeats the winner tile. Remove it.
- **[impact, M]** `#round/N` shows nothing beyond the Rounds card. It
  should show the full ranking with covers, the voter×song grid and the
  comments. Only This Round links to it today. Add links from the Rounds
  tab too.

## 8. Player page

- **[bug, S]** The text reads "1 round(s) not voted" (`PlayerPage.tsx`,
  two places). Pluralise it properly.
- **[impact, S]** The hero's "+17 +3" is ambiguous. Show
  `+14 votes · +3 theme = +17`.
- **[impact, S]** The career line is small grey text. Make it 3–4 stat
  tiles.
- **[declutter, S]** The popularity-dial markers overlap. Ties repeat in
  "Artists they reward".
- **[declutter, S]** `.taste-block` sets `grid-template-columns` twice, and
  the first rule is dead CSS.
- **[impact, S] (not re-checked)** Add a note saying "N songs without a
  genre tag", and a "new this league" note for players with no history.

## 9. Code and data hygiene

- **`publish.single` is dead config.** Both league JSONs set it, and
  `bake.mjs` assigns `opts.single` but never reads it. Wire it up, or
  remove the field.
- **`scripts/snapshot.mjs` is season-1 only.** It reads `src/data`/`dist`,
  not `data/league2`/`docs/v2`. Fix it before round 2 lands (`HANDOFF.md`
  §9).
- **Stale pages in `docs/`:**
  - Probably stale: `index0/1/2.html`, `league.html`, `league0..2.html`
  - Still live: `league3.html`, linked from `docs/index.html`

  Ask before deleting.
- **Unreferenced components:** `Overview.tsx` and `Participation.tsx`. Ask
  before deleting.
- **`PairStats.downDevotion` was never added.** It would make "who they
  target" comparable across voters.
- **No soft warning for ballots that underspend the budget.**
- **(not re-checked)** In-progress copy: some panels may still say "song of
  the season" or "winner" mid-season.
- **(not re-checked)** Contrast of the gold theme chip at small sizes
  (WCAG AA).
- **(low)** The kingmaker check (`decisiveVoters` in `future.ts`) re-scores
  with forfeits applied. The theme bonus never changes round winners, by
  design, so it is probably correct. Add a test before trusting it in a
  themed round.

## Done (for reference)

- G1: duplicate tables removed.
- G7: `#round/N` tab highlight.
- G8: phone layout.
- G9: hide single-value columns.
- Player season tabs.
- Taste block rework and its series colours.
- `PlayerDetail` dead code removed.
- Standings rework (2026-10): merged table, bands, theme banner, title-race
  card, forfeit boxes removed, round ceiling fixed.
