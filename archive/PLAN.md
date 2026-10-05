# Implementation Plan — Music League Dashboard v2

Handoff document. Everything needed to implement is here; no prior conversation
required. Wireframes: `wireframes-v2.html` (current target), `wireframes-final.html`
and `wireframes.html` (earlier drafts, keep for reference).

---

## 1. Current state

Working app, 308 tests passing, typecheck clean. Bake command in use:

```bash
npm run bake -- src/data --redact --single --competitive --no-floor --rounds 10 --genres
```

| Thing | Value |
|---|---|
| Tabs | 8: Overview, Standings, Voting, Network, Future, Participation, Songs, Players |
| Tests | 308 (`npx vitest run`) |
| `dist/` | 8.5 MB |
| JS bundle | 4345 kB, containing 72 base64 data URIs (~3.6 MB of art) |
| `league.html` | 4466 kB self-contained |
| `.cache/art.json` | 4.57 MB of base64, 145 entries |

Verify commands:

```bash
npx vitest run          # tests
npx tsc -b              # typecheck
npm run bake -- ...     # build with data baked in
```

**Warning:** plain `npm run build` overwrites `dist/` *without* baked data. Always
re-bake after.

### Data files already fetched (do NOT redo)

| File | Contents | Coverage |
|---|---|---|
| `src/data/years.csv` | Release years from MusicBrainz | 65 of 68 songs (96%) |
| `src/data/covers.csv` | Round 6 cover → original mappings | 11 of 11 |
| `src/data/wiki-facts.csv` | Wikipedia liner notes | 40 of 68 songs |
| `.cache/genres.json` | MusicBrainz artist genres | 65 of 81 artists |
| `.cache/art.json` | Spotify oEmbed album art | 68 covers |

These are keyed by title (`years.csv`, `wiki-facts.csv`) or by cover title
(`covers.csv`). **Phase 1 must re-key them all by Spotify track URI** — titles
repeat across rounds and carry version suffixes like
`Get Back - 2010 Remaster`.

---

## 2. Real data — use these for tests and copy

### Roster: TWO CAROLINES (critical)

```
"Caroline"       5 songs, 0 rounds voted, LAST on −28
"Caroline Cone"  6 songs, 6 rounds voted, FIRST on +44
```

Redaction renders them `Caroline` and `Caroline C---`. Any generated prose that
shortens either to a first name produces a factual error. See invariant I1.

Full roster: Go_BirdzDH, t33nwitch, Brittny Laudani, Cynthia Dallas, Greggo,
Megan Pallace, Caroline, Meredith Conde, Bob, Tim Engel, Laura M, Caroline Cone.

### Standings (competitive, no floor)

```
Caroline Cone    44      Brittny Laudani  −4
t33nwitch        20      Megan Pallace    −4
Cynthia Dallas   20      Bob              −7
Tim Engel        14      Laura M          −8
Go_BirdzDH        7      Meredith Conde   −9
                         Greggo          −12
                         Caroline        −28
```

Lead is **24 points with 4 rounds left**. Best single round anyone has posted: 16.
7 of 12 players are below zero.

### Vote budget is fixed and always fully spent

Every voter spends **exactly 8 upvote and 6 downvote points every round**, with no
exceptions across all 6 rounds and all 11 active voters.

```
Born This Way      upvotes 72/72   downvotes 54/54
Served Hot         upvotes 72/72   downvotes 54/54
Algorithm & Blues  upvotes 80/80   downvotes 60/60
Brain FM           upvotes 72/72   downvotes 54/54
The Walk-Up Call   upvotes 80/80   downvotes 60/60
Secondhand Hits    upvotes 88/88   downvotes 66/66
```

Consequences: scores are **zero-sum within a round**, so projections must resample
whole ballots rather than sampling players independently (invariant I3). And
downvoting is **mandatory, not chosen** — the interesting question is where it is
aimed, not whether.

### Rounds, and raw vs credited winners

| # | Round | Theme | Songs | Voters |
|---|---|---|---|---|
| 1 | Born This Way | song released the year you were born | 9 | 9 |
| 2 | Served Hot | food or drink in the title | 12 | 9 |
| 3 | Algorithm & Blues | something an algorithm gave you | 12 | 10 |
| 4 | Brain FM | song living rent free in your head | 11 | 9 |
| 5 | The Walk-Up Call | your MLB walk-up song | 12 | 10 |
| 6 | Secondhand Hits | your favourite cover song | 12 | 11 |

```
R1  raw 16 Real Love (t33nwitch)              credited: same
R2  raw  8 Honey (Meredith Conde)             credited: same
R3  raw 10 Kirby Down B (Caroline Cone)       credited: same
R4  raw 10 Mercy (Caroline) FORFEITED     ->  credited  7 Tha Crossroads (Go_BirdzDH)
R5  raw 13 A Milli (Laura M) FORFEITED    ->  credited  5 2.0 (Tim Engel)
R6  raw 14 I Shall Be Released (Caroline) FORFEITED -> credited 13 Shine (Caroline Cone)
```

Credited round wins: Caroline Cone 2, t33nwitch 1, Meredith Conde 1,
Go_BirdzDH 1, Tim Engel 1. See invariant I2.

### Era profile per player (real)

`submitted` = median release year of their songs. `upvoted` = points-weighted mean
year of songs they upvoted. `blend` = (2 × submitted + upvoted) / 3.

| Player | submitted | n | upvoted | n | blend |
|---|---|---|---|---|---|
| Cynthia Dallas | 1996 | 6 | 2000 | 28 | 1997 |
| Caroline Cone | 1998 | 6 | 2003 | 30 | 2000 |
| Megan Pallace | 2002 | 6 | 1999 | 31 | 2001 |
| Go_BirdzDH | 2002 | 6 | 2005 | 31 | 2003 |
| Caroline | 2005 | 5 | — | 0 | 2005 |
| Greggo | 2011 | 5 | 1996 | 10 | 2006 |
| t33nwitch | 2009 | 6 | 2003 | 30 | 2007 |
| Laura M | 2007 | 3 | 2007 | 6 | 2007 |
| Bob | 2016 | 4 | 2003 | 30 | 2012 |
| Brittny Laudani | 2017 | 6 | 2002 | 32 | 2012 |
| Meredith Conde | 2017 | 6 | 2004 | 24 | 2013 |
| Tim Engel | 2021 | 6 | 2004 | 32 | 2015 |

Four players have a 13-year-plus gap between what they submit and what they
reward (Tim 17, Greggo 15, Brittny 15, Meredith 13, Bob 13) — the "double agent"
tag.

### Decade performance (real)

```
1960s  n= 1  avg net +14.0      2000s  n=16  avg net  +0.6
1970s  n= 2  avg net  +5.0      2010s  n=14  avg net  +1.5
1980s  n= 5  avg net  +2.6      2020s  n=11  avg net  −0.9
1990s  n=16  avg net  +4.1
```

Median song year 2004. 65 of 68 songs dated.

### Upvote targeting (real)

All voters spend 8/round. 8 of 11 back all 11 rivals at some point.

| Voter | Spent | Targets | Top | Share | Herfindahl |
|---|---|---|---|---|---|
| Greggo | 32 | 6 | t33nwitch 15 | 47% | 29% |
| Meredith Conde | 48 | 11 | t33nwitch 12 | 25% | 14% |
| Bob | 48 | 11 | Caroline Cone 10 | 21% | 12% |
| Megan Pallace | 48 | 11 | Caroline Cone 10 | 21% | 12% |
| Go_BirdzDH | 48 | 9 | Tim Engel 9 | 19% | 12% |
| Cynthia Dallas | 48 | 11 | Go_BirdzDH 8 | 17% | 11% |
| Brittny Laudani | 48 | 11 | Caroline Cone 8 | 17% | 11% |
| Tim Engel | 48 | 11 | Caroline Cone 7 | 15% | 11% |
| t33nwitch | 40 | 11 | Meredith Conde 7 | 18% | 11% |
| Caroline Cone | 48 | 11 | Meredith Conde 7 | 15% | 10% |
| Laura M | 8 | 6 | t33nwitch 2 | 25% | 19% |
| Caroline | 0 | — | never voted | — | — |

### Downvote targeting (real)

| Voter | Spent | Targets | Top | Herfindahl |
|---|---|---|---|---|
| Go_BirdzDH | 36 | 9 | Brittny 8, Bob 8 | 16% |
| Greggo | 24 | 10 | Meredith Conde 6 | 15% |
| t33nwitch | 30 | 8 | Greggo 6 | 15% |
| Tim Engel | 36 | 10 | Bob 7, t33nwitch 7 | 13% |
| Bob | 36 | 9 | Meredith Conde 7 | 13% |
| Brittny Laudani | 36 | 9 | Meredith Conde 7 | 14% |
| Caroline Cone | 36 | 9 | Bob 7 | 13% |
| Meredith Conde | 36 | 10 | Tim Engel 7 | 13% |
| Cynthia Dallas | 36 | 10 | Bob 6 | 12% |
| Megan Pallace | 36 | 11 | Laura M 6, Caroline 6 | 11% |
| Laura M | 6 | 4 | Brittny 2 | 28% |

Nobody has a true nemesis — the most focused downvoter still spreads 75%
elsewhere. Only Greggo concentrates praise more than blame.

### Points received (real)

| Player | Up | Down | Net | Distinct backers |
|---|---|---|---|---|
| t33nwitch | 59 | 33 | +26 | 10 of 11 |
| Caroline Cone | 54 | 10 | +44 | 9 of 11 |
| Cynthia Dallas | 43 | 23 | +20 | 9 of 11 |
| Caroline | 43 | 28 | +15 | **11 of 11** |
| Bob | 37 | 44 | −7 | 9 of 11 |
| Tim Engel | 37 | 23 | +14 | 9 of 11 |
| Meredith Conde | 35 | 44 | −9 | 9 of 11 |
| Go_BirdzDH | 34 | 27 | +7 | 8 of 11 |
| Laura M | 34 | 15 | +19 | 10 of 11 |
| Brittny Laudani | 33 | 37 | −4 | 7 of 11 |
| Megan Pallace | 33 | 37 | −4 | 8 of 11 |
| Greggo | 22 | 27 | −5 | 10 of 11 |

Caroline is the only player every voter has backed, and she is last.

### Wikipedia fact coverage is biased against this league's taste

```
songs WITH a fact:     40   avg net +1.10
songs WITHOUT a fact:  28   avg net +2.57
```

The obscure songs score better. Facts must be garnish that is allowed to be
absent, never a section implying completeness.

---

## 3. Invariants — enforce with tests

**I1 — Display names must be unique.** Two players share the first name Caroline.
Add a `displayName` resolver and a test asserting no two players in the league
resolve to the same narrative name. All generated prose uses it. Never shorten to
a first name.

**I2 — Never conflate the best song with the round winner.** Round ranking uses
`effectiveNet` (after forfeits). In rounds 4, 5 and 6 the highest raw score was
forfeited, so the credited winner scored less. Chapters and superlatives must name
the credited winner and report the forfeited score as the twist. Regression test
required: assert round 6's winner is Caroline Cone's *Shine*, not Caroline's
*I Shall Be Released*.

**I3 — Simulated rounds must preserve the vote budget.** Resample whole historical
ballots. Test that every simulated round distributes exactly `8 × voters` upvote
points and `6 × voters` downvote points.

**I4 — Existing scoring invariants** (already enforced, keep):
`breakdown.total === pointsCounted`; `countedScore === Math.max(0, effectiveNet)`
only when flooring is on; flooring never changes a round winner.

**I5 — All 23 superlatives appear exactly once** across the app. Test the
placement audit. With obscurity data present the expected count is 25.

**I6 — Absent metadata is a supported state, never a failure.** Year, obscurity,
duration, facts and covers are all optional. Panels self-suppress.

**I7 — Old snapshots stay reproducible.** Rebuilding from an archived export plus
its pinned enrichment must reproduce that edition.

**I8 — Redaction holds.** After every bake, grep `dist/` for all six surnames
(Laudani, Cone, Dallas, Pallace, Conde, Engel) and expect zero hits.

---

## 4. Decisions taken

| Decision | Choice |
|---|---|
| `--single` / `league.html` | **Remove.** User hosts it; not worth maintaining two art paths. |
| Album art | **Real image files**, not inlined data URIs. |
| Spotify Web API | **Not required.** Blocked on a Premium account. Design for absence. |
| Release year | MusicBrainz, free, 96% coverage. Already fetched. |
| Obscurity axis | Provider-pluggable (Spotify popularity *or* Last.fm listeners). Phase 6. |
| Archetypes | Blend submissions ×2 + upvotes ×1. Keep them; statistical confounds are acceptable — this is for fun. |
| Play-by-Play prose | **Templated by the app.** No LLM at bake time. |
| Statistical hedging | Light. Show sample sizes; do not refuse to state fun findings. |

### Two open questions for the user

1. **Commit `enrich/*.json`?** Contains song titles, artists, years, facts — no
   player names, no votes. Recommendation: yes, it preserves the research and
   makes builds reproducible. Note `.gitignore` currently blanket-ignores `*.csv`,
   which is why enrichment moves to JSON.
2. **Publish the archive to the host?** ~10 MB for ten editions once art is
   shared. Recommendation: yes, with an `editions.html` index.

---

## 5. Target architecture

```
enrich/                     committed, URI-keyed, no personal data
  years.json                { "spotify:track:X": 1994 }
  covers.json               { "spotify:track:X": { title, artist, year, note } }
  facts.json                { "spotify:track:X": "one trimmed sentence" }
  obscurity.json            { "spotify:track:X": { value, source, fetchedAt } }
  rounds.json               { "<roundId>": { kind: "covers" | "remix" | "none" } }

src/data/                   current export only (gitignored)

snapshots/                  gitignored locally, uploaded to host
  art/                      shared across all editions, keyed by track id
  r6-2026-08-14/
    export/                 the 4 CSVs as they were
    enrich/                 pinned copy — guarantees I7
    dist/                   the built site
    league.html             final artifact of the inliner, kept for history

dist/
  art/<trackid>-64.jpg      table thumbnails
  art/<trackid>-640.jpg     hero covers
  assets/index.js           ~700 kB after art is externalised
  index.html
  editions.html             links to past snapshots
```

New npm scripts:

| Command | Behaviour |
|---|---|
| `npm run snapshot` | Archives export + enrich + build. Refuses to overwrite an existing snapshot for the same round count. Prints a manifest. |
| `npm run enrich` | Fetches years/art/genres for **new track URIs only**. Prints a worklist of what needs human/LLM research. |
| `npm run bake` | As now, minus `--single`, plus `editions.html`. Never touches `snapshots/`. |

---

## 6. Phases

### Phase 0 — Preserve, then simplify

Order matters: snapshot **before** deleting the inliner, so the round-6
`league.html` survives even though nothing will be able to rebuild it afterwards.

1. Write `scripts/snapshot.mjs` and the `snapshot` npm script.
2. Run it to create `snapshots/r6-2026-08-14/`. Verify contents by hand.
3. Delete `scripts/inline.mjs`, `scripts/inline.d.mts`, the `--single` flag in
   `scripts/bake.mjs` (line ~95 switch case, line ~40 import, usage strings), the
   inliner tests in `src/__tests__/bake.test.ts`, and the README references
   (lines ~48, 70, 82, 114, 327).
4. Rewrite `scripts/art.mjs`: write binaries to `dist/art/`, reduce
   `.cache/art.json` to a manifest of `trackId -> { file, w, h }`. Keep the
   existing cache-hit behaviour so rebuilds stay fast.
5. Update components that consume art to take URLs: `SongMedia.tsx`,
   `Overview.tsx` (showcase), `SongsPanel.tsx`. Respect `--base` for subfolder
   hosting.
6. Add `editions.html` generation to `bake.mjs`.
7. README: the built page now fetches same-origin images, so the "fetches
   nothing" wording needs correcting. Still no third-party request until play.

Verification: `dist/` ≈ 3.4 MB, bundle ≈ 700 kB, all 68 covers render (DOM dump),
I8 surname sweep clean, and a rebuild-fidelity test for I7.

### Phase 1 — Data model

1. `src/lib/enrich.ts` — loaders for all five `enrich/*.json` files. A missing or
   empty file is valid and yields no data (I6).
2. Migrate `src/data/years.csv`, `covers.csv`, `wiki-facts.csv` into URI-keyed
   JSON under `enrich/`. Write a one-off migration script; match on title +
   round to recover the URI from `submissions.csv`.
3. Extend the song type with optional `year`, `cover`, `fact`, `obscurity`,
   `durationMs`.
4. `MetricAvailability` — report coverage per optional dimension so panels can
   declare requirements and self-suppress.
5. **`displayName` resolver + I1 test.**
6. `enrich/rounds.json` for round semantics; round 6 is `covers`, round 10 will
   be `remix`.
7. `scripts/enrich.mjs` — diff export against cache, fetch what it can, print the
   human worklist.

Tests: URI keying survives a version-suffixed title; absent metadata degrades;
display names unique; worklist identifies exactly the new tracks.

### Phase 2 — Analysis modules

Pure functions, no UI. Most test-dense phase. Give the demo league
(`src/lib/demo.ts`) full metadata including obscurity, so later UI work exercises
every path.

1. `src/lib/taste.ts` — era blend, archetype bands (Crate digger / Y2K kid /
   Algorithm native, defined on era **alone** so labels never re-shuffle),
   double-agent gap, decade table, and the two-axis quadrant classifier whose
   second axis is optional (degrades to the decade table without obscurity).
   Obscurity adds a *modifier* to the label, never a re-classification.
2. `src/lib/targeting.ts` — upvote and downvote flows per voter, Herfindahl
   concentration, praise-versus-blame, totals received, lopsided pairs.
3. `src/lib/projection.ts` — ballot resampling honouring I3; win shares; a
   "non-voters start voting" toggle. Replaces the current "technically alive"
   logic in `future.ts`.
4. `src/lib/recap.ts` — per-round chapters: credited winner (I2), forfeit twists,
   candidate moments ranked by unusualness, **one angle per player across the
   whole season**, no superlative claims before round 3.
5. Register the two obscurity superlatives now — `add()` already skips empty
   candidate lists, so they stay dormant until data arrives.

Tests: budget preserved in every simulated round (I3); rounds 4/5/6 detected as
credited ≠ raw (I2); no repeated storyline per player; targeting totals reconcile
against raw vote rows; archetype labels stable with and without obscurity.

### Phase 3 — UI restructure

Target: the six tabs in `wireframes-v2.html`.

1. Tabs 8 → 6: Overview, The Race, The Songs, The Room, Players, Play-by-Play.
   **Keep old hashes redirecting** (`#demo:Voting` etc.) so existing links work.
2. Superlative strips, 4 per tab, per the audit in section 8. Enforce I5.
3. Overview: headlines, showcase, gateway cards, strip. Teasers only — one item
   per category with a link, never a copy of the destination list.
4. The Race: standings, projections, timeline with projection cone, breakdown.
5. The Songs: decade panel, quadrant panel (self-suppressing), filterable card
   collection with cover/fact inline, genre, artists.
6. The Room: graph hero, upvote targeting, downvote targeting, praise-vs-blame,
   lopsided pair callout, pair superlatives, affinity matrix.
7. Players: table with archetype and era columns, then a selected-player detail
   view with three sub-views — Submissions, Votes given, Votes received.
8. Real empty states: Caroline has 0 votes, Laura M voted in 1 round of 6, Greggo
   did not submit in round 1.

Tests: every tab renders against the demo league; empty states present; I5 audit;
old hashes redirect.

### Phase 4 — Play-by-Play

1. Chapter component plus the round-scoped superlative strip.
2. Prose from templates over `recap.ts`. No LLM at bake time.
3. Regression test for I2 — the round-6 winner naming.

### Phase 5 — Round-7 dry run

1. Synthesise a round 7 into a copy of the export.
2. Run `snapshot` → `enrich` → `bake` end to end.
3. Assert the r6 snapshot is untouched and still rebuildable (I7), and that
   `editions.html` lists both editions.
4. Delete the synthetic data.

### Phase 6 — Obscurity activation (only when a key exists)

1. One fetcher script writing `enrich/obscurity.json` with `value`, `source`,
   `fetchedAt`. Spotify popularity or Last.fm listeners — the axis does not care.
2. Pin per snapshot, since the metric drifts over time. Old editions must keep
   the value as at their fetch date.
3. Nothing else changes: superlatives wake up, the quadrant panel gains its
   second axis, archetype labels gain modifiers.

Should be half a day. If it never happens, the site ships with no obscurity
column, no empty panels and no TODOs.

---

## 7. Round-update runbook

For round 7 and after:

```bash
# 1. archive the current edition first
npm run snapshot

# 2. replace the export (Music League exports are cumulative)
#    put the new CSVs in src/data/

# 3. auto-fetch what can be automated; prints a worklist
npm run enrich

# 4. human/LLM step — research only the new songs (see section 9)

# 5. build
npm run bake -- src/data --redact --competitive --no-floor --rounds 10 --genres

# 6. verify
npx vitest run
for x in Laudani Cone Dallas Pallace Conde Engel; do grep -rw "$x" dist | wc -l; done

# 7. publish dist/ and snapshots/
```

---

## 8. Superlative placement (I5)

All 23 existing superlatives, four to a tab, none repeated. Real current winners
in parentheses.

**Overview** — Biggest single haul (16 pts, Real Love) · Biggest haul never
counted (15 forfeited, I Shall Be Released) · Best average song (7.3, Caroline
Cone) · Chattiest (65 comments, Tim Engel)

**The Race** — Most forfeited by not voting (−43, Caroline) · Most rounds skipped
voting (5, Caroline) · Broadest support base (63%, Caroline Cone) · Most
polarizing act (44%, Brittny Laudani)

**The Songs** — Widest appeal (90%, Bring Em Out) · Most divisive (±3.0, O
Superman) · Most downvoted (−13, Nothin' But A Good Time) · Narrowest win (63%,
Lost!) · Most one-sided single vote (8 pts, O Superman)

**The Room** — Biggest superfan (Greggo → t33nwitch, 15) · Mutual admiration
society (Meredith ↔ t33nwitch, 19 traded) · Most unrequited (Greggo → t33nwitch,
gave 15 got 1) · Arch-nemesis (Go_BirdzDH → Brittny, 8 downvote pts) · Most
points given raw (Greggo → t33nwitch, 15) · Coldest shoulder (Go_BirdzDH →
Brittny, 0 in 6 chances)

**Players** — Most generous spread (6.4 songs/round, t33nwitch) · Biggest stacker
(56% at cap, Greggo) · Most mainstream taste (60%, Megan Pallace) · Biggest
contrarian (64%, Greggo)

**Play-by-Play** — four new round-level ones: highest-scoring round (16, Born This
Way) · lowest-scoring round (8 to win, Served Hot) · best turnout (11 of 12,
Secondhand Hits) · most points lost in a round (26, The Walk-Up Call)

New song-level ones for The Songs: The time capsule (1969, I Shall Be Released)
plus, when obscurity lands, Deepest cut to score and Biggest hit to bomb.

Note two genuine overlaps in the current data: **Greggo → t33nwitch** wins
Biggest superfan, Most points given *and* Most unrequited; **Go_BirdzDH →
Brittny** wins both Coldest shoulder and Arch-nemesis. The cards should
cross-reference rather than present as independent findings.

---

## 9. What the app does vs what needs a human/LLM

**No LLM at bake time.** All research output is committed to `enrich/*.json` so
builds stay deterministic, offline, reproducible and testable.

**App does alone:** parsing · scoring · standings · all superlatives · pairs and
affinity · graph and clusters · up/down targeting · era blend and archetypes ·
ballot-resample projections · raw vs credited round winners · MusicBrainz years
and genres · Spotify oEmbed art · Wikipedia retrieval · Play-by-Play structure,
stats and templated prose · redaction.

**Needs a human or LLM, per new round (~12 songs):**

| Task | Why | Volume |
|---|---|---|
| Cover/remix → original | No API carries it reliably. Round 10 is remixes. | themed rounds only |
| Wikipedia bad-match removal | 16 wrong pages had to be cut — "Peach" matched IU, "Fearless" matched Taylor Swift. Needs to know what the song is. | ~12 checks |
| Fact selection and trimming | Regex scoring produced duds like "It is also on the Beastie Boys' compilation album." Editorial judgement. | ~7 of 12 |
| Year sanity check | MusicBrainz returned 1998 for Dolly Parton's *Shine* (actually 2001) and 1992 for Doris Troy's *Get Back* (actually 1970). 96% resolved is not 96% correct. | ~12 flags |
| Round semantics | Declare the new round's `kind` in `enrich/rounds.json`. | 1 line |

---

## 10. Notes and gotchas

- Music League exports are **cumulative** — the round 7 export contains rounds
  1–7 and replaces `src/data/`. This is why snapshots archive the export.
- Round 1's theme was "a song released the year you were born", so those release
  years are birth years, not taste. Round 6's years are the cover's, not the
  original's. Accepted as fun rather than corrected.
- Spotify obscurity metrics **drift**; store `fetchedAt` and pin per snapshot.
- `.gitignore` blanket-ignores `*.csv` and `src/data/`. Enrichment therefore
  lives in JSON so it can be committed.
- Genre analysis already has the right instincts to copy: `MIN_SAMPLE = 4`, thin
  genres get no verdict, unresolved artists are listed, performance reported as a
  difference rather than a ratio.
- Keep `AGENTS.md`-style conventions already in the codebase: comments explain
  *why*, tests assert behaviour not implementation, panels degrade rather than
  throw.
