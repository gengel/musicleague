# Design review: every tab, panel and page (v2 dashboard)

Reviewed on 2026-09-30 from screenshots of the baked `docs/v2/` build
(league 2, **1 of 12 rounds played**), taken at 1440px and 390px wide.
Pages covered: This Round, Standings, Players, Songs, Room, Rounds,
`#round/1` and `#player/bob`, plus phone widths for This Round, Standings,
Songs and Bob's page. Standings was cut off after "The title race" at
4200px tall, so anything below that panel was not reviewed. The player
Submissions and Relationships sub-tabs were reviewed from code only.

Aim: more impact, less clutter. The player page already follows the
standing preference: the key facts pop, and the method sits in tooltips and
drawers (`InfoTip` / `MethodDrawer`). No other tab does this yet.

Each item is tagged **[impact]** (makes something pop), **[declutter]**
(removes or merges things), or **[bug]**. Effort: S = under an hour,
M = a few hours, L = a day or more.

---

## 1. Cross-cutting issues (fix these first; they affect every tab)

**G1 [declutter, done in `0ffb23f` + `70f2d6d`] The same 12-player table
appeared six times.** "Players, end to end" and "Points received" are gone,
`PlayersPanel.tsx` with them; "Where it stands" is the canonical table.
Originally seen in:
- This Round: Standings (top 5)
- Standings: "Where it stands" and "How the scores add up"
- Players: "Players" (archetypes) and "Players, end to end"
- Room: "Points received"

They all rank the same 12 people by nearly the same number. Keep one
canonical table ("Where it stands" on Standings). Fold the useful columns
from the others into it, or move them to the player page. Delete
"Players, end to end" and "Points received" outright.

**G2 [declutter, M] Nothing is gated for an early season.** With 1 round played:
- the Rounds tab's four superlatives all name the same round
- Songs shows 8 superlatives from 12 songs (Hold the Line appears in three)
- the era×popularity and era×genre heatmaps are mostly `n=1` cells
- the race prediction and 12 overlapping projection fans are mostly noise

Only Room's Relationships panel is gated ("appears after 3 rounds").
Add one shared helper, e.g. `gate(minRounds | minSamples)` in
`src/lib/`, and apply it to every panel. A gated panel should become one
slim "unlocks after round N" line, not an empty card.

**G3 [declutter, S] The "Season in progress" banner is on every tab.** The
header already says "1 of 12 rounds". Keep the banner on This Round only,
or make it a small pill in the header.

**G4 [declutter, M] Method text is shown on every card.** Most cards carry a
grey subtitle explaining the method. Examples: "Upvotes received, minus
downvotes, minus the upvotes forfeited…", "Resampled from 1 played round ×
500 simulations", and "Archetype blends submissions (×2) + upvotes (×1)…".
Move these into the card title's `InfoTip`, or into `MethodDrawer` for
long ones, as the player page already does. Leave a subtitle only when it
changes how the numbers read.

**G5 [declutter, S] Superlative cards carry three grey runner-up lines each.**
The label, the big number and the song name are the point. Move the
runner-ups ("75% of voters Time Moves Slow · 75% of voters…") into a
tooltip. This affects Songs, Standings (forfeit cards) and Rounds.

**G6 [impact, M] Only the player page has visual hierarchy.** Every other
tab is a stack of equal-weight cards and tables. Reuse the pieces built in
M3–M5 (cover art, big numerals, player tint, `PlayerAvatar`):
- This Round: a podium of the top 3 songs with covers.
- Standings: a leader hero (avatar, score, storyline).
- Players: a card grid (see Players, below).

**G7 [bug, done in `a75e5fc`] `#round/N` highlighted the Players tab.** In `src/App.tsx:136`,
`activeTab` falls back to `'Players'` for every non-tab route. It should
be `'Rounds'` for `route.kind === 'round'`. Only `player` routes should
fall back to `'Players'`.

**G8 [bug/declutter, done in `3ac84d6`] Phone layout problems.**
- The main nav wraps to two rows at 390px. Make it a single horizontally
  scrolling strip.
- Redacted names break mid-dash (`Meredith C--` then `-` on the next line)
  in the standings, race and This Round tables. Add
  `white-space: nowrap` on name cells.
- Wide tables are clipped with no scroll cue: "Where it stands" loses
  "Per song" onward, and the race table loses "Median". Hide secondary
  columns under 620px, or add a fade on the scroll edge.
- The Songs heatmaps overflow the card.

**G9 [declutter, done in `53ad55c`] Hide columns and filters that have only one value.**
- Songs: the ROUND column and the Round filter chips when there is one
  round.
- Room: the SPENT column is 10 for every voter in a fixed-budget league.
- Standings: "Rounds voted 1 of 1", and "Per song" / "Best round" when
  each equals the score.

Hide a column when all its values are identical.

**Caveats found afterwards, when G9 was implemented:**
- A column can be single-valued and still carry a *second* signal. "Rounds
  voted" read "1 of 1" for everyone who voted but "never voted" for the
  three who did not. Hiding it dropped the only non-voter marker. Fixed in
  `8830bd0` by moving the flag beside the player's name. **Before hiding a
  column, check that no cell in it says something different in kind.**
- The THEME column is still shown with "—" in 11 of 12 rows. It is not
  single-valued so the rule leaves it, but it is nearly empty. Consider
  hiding it until two or more players have a bonus.
- G9 uses two different criteria: Songs keys off
  `stats.league.rounds.length`, Standings off `stats.roundsPlayed`, Room off
  "are all values equal". The last one is the general rule; the other two
  are proxies. Worth unifying into one helper.

---

## 2. This Round

- **[impact, M]** The "Latest result" winner tile and ranking row 1 repeat
  each other. Replace both with a podium of the top 3 songs (covers,
  submitter avatars, scores), followed by "Show all 12".
- **[declutter, S]** The "Next up" brief has four equal text columns, and
  "Artists they reward" is six rows all tied at 2 pts. Ties carry no
  signal: show at most three items, and hide a list when all its values
  are equal. On a phone the four lists stack to about 1.5 screens.
  Collapse them behind "Scout {name} →", which links to the player page's
  brief.
- **[declutter, S]** In the mini-standings, TOTAL equals CHANGE in round 1.
  Hide CHANGE until round 2, and show movement as ▲/▼ arrows rather than a
  second number. At 1440px the table has a very wide empty middle, so cap
  its width or put it beside the result.

## 3. Standings (the longest page; over 4200px on desktop)

- **[declutter, S]** The theme-bonus explainer is a large permanent card
  at the top. Move it into an `InfoTip` on the THEME column header and on
  every theme chip.
- **[declutter, S]** Merge the two forfeit/skip cards ("−7 pts Joel", "1
  round Go_BirdzDH") into the table. The "never voted" flag is already
  there; add a tooltip with the forfeited points.
- **[declutter, M]** Race prediction shows the same numbers twice: bars
  with a percentage, then a table of range and median. Merge them into one
  row per player: name, a probability bar, and the projected range as a
  whisker.
- **[impact, M]** Score over time draws 12 translucent projection fans on
  top of each other, which reads as mud. Default to actual lines only,
  with the top 3 in full colour and the rest dimmed. Show a player's
  projection fan only on hover or when their legend entry is selected.
- **[declutter, S]** "How the scores add up" is good, but it is audit
  detail. Collapse it by default ("Show the arithmetic") or move it into a
  `MethodDrawer`.
- **[declutter, M]** "What can still happen" (stat tiles and cards) and
  "The title race" (leading / in contention) tell the same story. Keep the
  title race as the visual, then add the 2–3 most interesting cards (title,
  last place, too-close-to-call) under it. Drop the "Rounds left 11 of 12"
  tile, since the header already says it.

## 4. Players

- **[impact, M]** Replace the picker chips and the two tables with a card
  grid of 12 cards. Each card shows the avatar, rank, score, archetype
  chip(s) and the one-line storyline (`careerStoryline`). A card opens the
  player page. This is the "pop" version of what the tab is for.
- **[bug, S]** The era spectrum labels collide ("Megan 2010 / Greggo 2011",
  "Cynthia 2015 / t33nwitch 2016"). Stagger the labels into more rows, or
  show avatars on the axis with names on hover.
- **[declutter, S]** Delete the "Players, end to end" table (see G1). Move
  the archetype table's GAP/AVG POP columns to the player page.

## 5. Songs

- **[declutter, S]** Cut the eight superlatives to four. Never name the
  same song twice (Hold the Line is Most divisive, Most downvoted and
  Biggest hit to bomb).
- **[declutter, M]** There are four "What wins here" panels (era,
  popularity, era×popularity, era×genre). Make one panel with a segmented
  toggle, and gate the 2-D heatmaps until each cell has at least 3 songs
  (G2). On a phone the heatmaps overflow.
- **[impact, S]** "Every song" is the best table in the app, with covers
  and tags. Make it the first thing on the tab, above the superlatives.
- **[declutter, S]** "Room-uniting songs" and "Most divisive songs" repeat
  the table's Voters reached and Spread columns. Remove them; the table is
  sortable on both.

## 6. Room

- **[declutter, S]** The gated Relationships card is a small box alone at
  the top left and reads as broken. Make it a slim full-width notice, or
  hide it.
- **[declutter, M]** "Where the upvotes go" and "Where the downvotes go"
  are two tables with the same shape. Merge them into one voter table:
  top recipient (up) beside top target (down), with share bars. Drop
  SPENT (G9).
- **[declutter, S]** Delete "Points received" (G1).
- **[impact, S]** Voters who did not vote (Joel, Megan P, Go_BirdzDH) are
  silently missing from the voter tables. Add a "3 didn't vote" line.

## 7. Rounds and the round page

- **[declutter, S]** Gate the four superlatives until at least 3 rounds
  (all four currently name the same round).
- **[declutter, S]** The sentence "Bob's 'El Pastor' won the round on +14
  pts" repeats the winner tile directly below it. Remove it.
- **[bug, S]** "Show all 12 songs ↓" sits outside the card and looks
  orphaned. Move it inside the card footer.
- **[impact, M]** `#round/1` is the same as the Rounds card, with nothing
  extra. A round page should show the full ranking with covers, the
  voter×song vote grid for that round, and every comment.

## 8. Player page (`#player/<slug>`)

- **[bug, done in `01164be`]** The season tabs are now right-aligned, and
  the phone overflow is fixed.
- **[impact, improved in `a12fb06`…`86af080`]** The taste block is much
  stronger than when this review was written: one shared legend, the era
  timeline split into dots (submissions) and rings (upvotes), and genre
  split into upvoted and downvoted on *net* points, so a genre can no
  longer appear in both lists. That last part matches the README's rule
  that anything phrased as a feeling ranks on net.
- **[bug, done in `981ab5d`]** Two follow-on defects from that work:
  the "submissions" series used the per-player tint (drawn from their album
  covers) while upvotes and downvotes use fixed `--pos` / `--neg`, so a
  pink-tinted player made submissions and downvotes nearly identical, and a
  green-tinted one would have collided with upvotes. And the legend listed a
  downvotes series that neither the dial nor the era timeline plots.
  **Lesson: the player tint is decoration, so never use it for a data
  series that sits beside semantic colours.**
- **[impact, S]** The hero's "+17 +3" is ambiguous (is the +3 inside the
  17?). Show it as `+14 votes · +3 theme = +17`, or make the big number
  the total with a smaller "+3 theme" chip beneath it.
- **[impact, S]** The career line ("−2 career points · 11 songs · 1 round
  win · 76 upvotes and 78 downvotes received · 1 round(s) not voted") is
  small grey text. Make it 3–4 stat tiles with big numbers, and fix
  "round(s)" to use proper pluralisation.
- **[declutter, S]** On the popularity dial the two markers overlap at the
  top, so it isn't clear which is which without the legend. Offset them
  or label them directly. The era dots at 1440px are very small.
- **[declutter, S]** In the People section, "Artists they reward" repeats
  4 pts four times (ties again). Show the top 3, and only when they differ.
- **[declutter, S]** `.taste-block`'s `grid-template-columns` is set once
  and then overridden unconditionally about 80 lines later, under a
  "Player page on phones" comment that is not in a media query. The first
  rule is dead. Pre-existing, not from the recent work.

---

## Suggested order

G7, G8, G9 and G1 are done (see the tags above). What is left, in order:

1. Remaining small bugs: the era spectrum label collisions on Players, and
   the orphaned "Show all 12 songs" link on Rounds.
2. G2 gating — the biggest remaining clutter cut, and the one that matters
   most this early in a season.
3. The remaining duplicate lists (Songs "Room-uniting"/"Most divisive",
   the four "What wins here" panels).
4. G4 and G5: method text and runner-ups into `InfoTip`s.
5. Impact work: This Round podium, Players card grid, Standings chart
   defaults, round page.
