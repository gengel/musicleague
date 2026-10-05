# Phase 7 — Restore race predictions on The Race tab

## Context

`src/lib/projection.ts` already implements a Monte Carlo resampler:
`projectStandings(stats)` runs 500 simulations of the remaining rounds, drawing
whole ballot shapes from the league's history (I3), and returns each player's
**win share** — the fraction of simulations they finished first in. It has
tests. **It has never been rendered anywhere.**

The wireframe (`wireframes-v2.html:306-322`) shows three prediction surfaces
that the current build is missing:

1. A `Can the gap close?` card with a resampled-projection narrative.
2. A `The assumption that decides it` card with a **scenario toggle** —
   *non-voters stay silent* vs *everyone votes from here*. That toggle is the
   most useful control on the tab: for this league, one non-voter (Caroline)
   swings the whole standings by ~60 pts.
3. A projection **cone** on the ScoreTimeline covering the unplayed rounds,
   shading each player's plausible finish range.

`FuturePanel.tsx` also exists on The Race with per-round targets and forfeit
notes, but it does not use the Monte Carlo output. That prose is complementary
and should stay.

Pass C restores race predictions by surfacing `projectStandings`, adding a
scenario switch, and drawing the projection cone.

---

## Guiding rules

- **Never claim precision the simulation cannot provide.** Show ranges
  (p10–p90), win shares as percentages, and always name the assumption.
- **Absent data self-suppresses (I6).** If `projectStandings` returns
  `insufficientData`, the whole prediction card renders null with a short
  reason — never partial numbers with a warning.
- **The scenario toggle is a real input**, not cosmetic. Under
  "everyone votes from here" the simulation credits each future-round upvote
  the trailing player earns (currently forfeited). The math and the prose
  both need to shift when it flips.
- **The prose already on the tab (`FuturePanel`) stays.** It answers a
  different question (per-round target vs distributional forecast) and its
  forfeit-aware phrasing is already correct.

---

## C1 — Extend projection.ts to return distributions

### Why

Current output is only `winShare` per player. To draw the cone we need a
range of simulated final scores per player, and to write "projects to finish
around +20" prose we need a central tendency.

### Files to edit

**`src/lib/projection.ts`** — extend `WinShare` (or add a companion type):

```typescript
export interface PlayerForecast {
  playerId: string;
  name: string;
  winShare: number;
  currentPoints: number;
  /** Percentiles of the simulated final score, from 500 runs. */
  finalScore: { p10: number; p25: number; median: number; p75: number; p90: number };
  /** Per-round cumulative percentiles, indexed by round-from-now (0 = end of R+1). */
  trajectory: { p10: number; median: number; p90: number }[];
}

export interface ResampleProjection {
  roundsSimulated: number;
  runs: number;
  forecasts: PlayerForecast[]; // renamed from `shares`
  insufficientData: boolean;
  /** Optional: same result run again under "everyone votes from here". */
  scenario: 'baseline' | 'all-vote';
}
```

Inside `projectStandings`:

1. Instead of only recording who won each run, record every player's cumulative
   score after **each** simulated round. Store a matrix `[playerCount][runs][roundsLeft+1]`.
2. After all runs, compute percentiles (`p10/p25/median/p75/p90`) of the final
   column, and `p10/median/p90` of each intermediate column, per player.
3. Add an `opts.scenario` parameter. When `scenario === 'all-vote'`, before
   simulating, add each non-voter's per-round expected upvote earnings to
   their starting `pointsCounted` — modelled as their observed
   `pointsReceived / roundsSubmitted` (or use `upvotesReceived / roundsSubmitted`).
   Do NOT compound: the extra points are pinned once, then normal
   simulation continues from there.

### Files to touch

Tests in `src/__tests__/projection.test.ts` must be updated to reference
`forecasts` (was `shares`). Add coverage for:
- Percentiles are monotonic (p10 ≤ p25 ≤ median ≤ p75 ≤ p90).
- Trajectory length equals `roundsLeft`.
- Under scenario `all-vote`, a non-voter's median final score is strictly
  higher than under baseline.

### Verification

- Existing tests pass with the rename.
- New percentile test cases pass.
- No component references `share` yet (nothing consumes it).

---

## C2 — RacePredictionPanel component

### Why

The main "who's likely to win" surface on The Race tab. Consumes `PlayerForecast[]`
from C1 and renders a compact bar chart with the scenario toggle.

### Files to create

**`src/components/RacePredictionPanel.tsx`** — new component. Signature:

```typescript
export function RacePredictionPanel({ stats }: { stats: Stats }): JSX.Element | null;
```

Implementation:

1. Local state: `const [scenario, setScenario] = useState<'baseline' | 'all-vote'>('baseline')`.
2. Call `projectStandings(stats, { roundsLeft: stats.totalRounds - stats.roundsPlayed, scenario })`.
3. If `insufficientData`, render null.
4. If `roundsLeft === 0` (season complete), render a `<Card>` with a short
   settled-season message: "Season complete. Final standings above."
5. Otherwise render:

```
+-------------------------------------------------+
| Race prediction                                 |
| Resampled from 6 played rounds × 500 sims       |
| [ non-voters stay silent | everyone votes here ]|
|                                                 |
| Caroline Cone  ████████████████ 78%             |
| t33nwitch      ███ 12%                          |
| Cynthia D      ██ 6%                            |
| Tim Engel      ▌ 2%                             |
| Others         ▌ 2%                             |
|                                                 |
| Projected final scores (10th–90th %ile):        |
| Caroline Cone  +38 … +62 (median +52)           |
| t33nwitch      +12 … +48 (median +30)           |
| ...                                             |
|                                                 |
| Note: assumes voters keep their observed        |
| appetite for spreading vs. concentrating points.|
+-------------------------------------------------+
```

- Top block: horizontal win-share bars, only players with ≥ 2% shown; the
  rest collapse into "Others". Bar colour matches the `chart-legend__swatch`
  scheme so this ties visually to the timeline.
- Bottom block: table of top 6 players' `finalScore` percentiles.
- Toggle: two segmented buttons using existing `.seg` styling.

### Files to touch

**`src/components/TheRaceTab.tsx`** — import and place `<RacePredictionPanel>`
between the "Where it stands" standings table and `FuturePanel`. It's the tab's
headline for a season-in-progress; put it high.

### CSS to append (`src/styles.css`)

```css
.race-forecast {
  display: grid;
  gap: 6px;
  margin: 12px 0;
}
.race-forecast__row {
  display: grid;
  grid-template-columns: 140px 1fr 44px;
  gap: 10px;
  align-items: center;
  font-size: 13.5px;
}
.race-forecast__bar {
  height: 10px;
  background: rgba(255,255,255,0.05);
  border-radius: 3px;
  overflow: hidden;
}
.race-forecast__fill {
  height: 100%;
  border-radius: 3px;
}
.race-forecast__pct {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--dim);
}
```

### Verification

- Unit test: given the demo stats, `RacePredictionPanel` renders bars whose
  widths sum to ~100%.
- Toggle test: click "everyone votes here", verify at least one non-voter's
  bar width increases.
- Visual: refresh The Race tab, see prediction card between standings and
  `FuturePanel`.

---

## C3 — Projection cone on the ScoreTimeline

### Why

The wireframe (line 322) explicitly calls for a shaded cone over the played
lines showing the plausible range for future rounds. This uses the
`trajectory` data added in C1.

### Files to edit

**`src/components/ScoreTimeline.tsx`** — extend the chart:

1. When `stats.inProgress` and mode === 'cumulative' (the only mode where the
   cone makes sense — league position and per-round modes stay unchanged),
   run `projectStandings(stats)` and merge each played row with the
   simulated trajectory for that player: `p10Name`, `medianName`, `p90Name`.
2. For each visible (unmuted) player, add an `<Area>` component from
   `recharts` with `dataKey=[p10Name, p90Name]`, `stroke="none"`,
   `fill={entry.color}`, `fillOpacity={0.10}`. Only render for the
   projected-rounds portion (recharts handles the leading nulls fine).
3. Add a dashed vertical `<ReferenceLine x={lastPlayedRound}>` so the
   reader sees where actual data ends.
4. Update the tooltip to note "projected" for rounds beyond
   `lastPlayedRound`.
5. Respect the scenario setting from `RacePredictionPanel` — either lift
   scenario state into `TheRaceTab` and pass it down, or accept a prop.

### Verification

- Manual: The Race tab shows the timeline with a translucent cone extending
  to round 10, one shaded region per player.
- Muting a player also mutes their cone (same `hidden` state).
- Toggle scenario in `RacePredictionPanel` → the cone updates.

---

## C4 — "The assumption that decides it" prose card

### Why

The wireframe's second projection card is the sharpest piece of writing on
The Race: it names Caroline as the single biggest variable and shows what
her raw scores would produce if she started voting. This is not a chart, it's
an argument.

### Files to create

**`src/components/AssumptionCard.tsx`** — new component.

Implementation:

1. Find the largest forfeiter under Competitive Mode:
   `const worst = players.filter(p => p.forfeitedUpvotes > 0).sort((a,b) => b.forfeitedUpvotes - a.forfeitedUpvotes)[0]`
2. Run both scenarios: baseline and all-vote. Take `worst`'s median final
   score from each.
3. Render prose: "*Caroline's raw scores are −11, −9, +10, +11, +14 — she is
   the form player of the league. She has counted none of it. If she votes
   the rest of the way she projects to finish around +N instead of −M.*"
4. Skip the card entirely (return null) when there are no non-voters —
   nothing to say.

Uses `stats.songs` to pull the worst forfeiter's per-round raw scores.

### Files to touch

**`src/components/TheRaceTab.tsx`** — place `<AssumptionCard>` right after
`<RacePredictionPanel>`, in the same grid slot as the wireframe.

---

## C5 — Wire the scenario toggle across C2/C3

### Why

The toggle in `RacePredictionPanel` needs to also update the cone in
`ScoreTimeline`. Two options:

**Option A** — lift `scenario` state into `TheRaceTab`, pass it down to
both `RacePredictionPanel` and `ScoreTimeline` as props. Simpler for
two consumers; slightly more prop drilling.

**Option B** — a React context. Overkill for two components.

Pick A. The signature becomes:

```typescript
export function TheRaceTab({ stats }: { stats: Stats }) {
  const [scenario, setScenario] = useState<'baseline' | 'all-vote'>('baseline');
  // ...
}
```

Pass `scenario` and `setScenario` to `RacePredictionPanel`; pass `scenario`
(read-only) to `ScoreTimeline`.

`FuturePanel` and `AssumptionCard` continue running both scenarios
internally — they aren't controls, they compare.

---

## Order and dependencies

- **C1 is mandatory first.** C2 needs the percentiles, C3 needs the
  trajectory, C4 needs both.
- After C1, C2/C3/C4 can be done in any order but C2 is the biggest
  visual payoff.
- C5 is the last plumbing step.

Recommended: **C1 → C2 → C5 → C3 → C4**.

---

## Global verification (after each step)

1. `npm test` — all green.
2. `npm run bake -- snapshots/r6-2026-08-14/export/ --rounds 10` — no
   errors.
3. Refresh `http://localhost:4173`, click The Race:
   - Prediction card with two-mode toggle and bars.
   - Timeline with a translucent cone extending past R6.
   - AssumptionCard names the largest forfeiter and gives a concrete swing.
4. If `--rounds` isn't set (season assumed complete), all four surfaces
   should self-suppress rather than showing "0 rounds left" garbage.

---

## Not in this pass

- Cross-tab impact: `Overview` gateway card for The Race still says "leads
  on +N". Pass C leaves it alone; Pass D (Overview teasers, per PLAN-PHASE7)
  will pull the top win-share into that gateway.
- Any change to `FuturePanel` — its per-round-target prose stays.
- Any change to `future.ts` — the forfeit-aware notes there stay.

Written to fit next to the existing PLAN-PHASE7-PASS-B.md.
