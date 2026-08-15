# Phase 7 — Pass B implementation guide

## Context

Pass A (already merged) removed duplicate panels and cleaned up tab
structure. Pass B is about **using the genre and obscurity data everywhere it
belongs**, not just in the two places that reference them today.

Current state of the data:
- `enrich/obscurity.json` — 68/68 songs have Last.fm listener counts
- `enrich/durations.json` — 68/68 songs have ms
- `enrich/years.json` — 67/68 songs have year
- `.cache/genres.json` (baked into `virtual:league-data` as `embeddedGenres`) —
  65/81 artists tagged, keyed by lowercased artist name

Current UI usage of that data:
- Obscurity: two superlatives ("Deepest cut to score", "Biggest hit to bomb")
- Genre: aggregate `GenrePanel` on The Songs tab; one Overview headline card
- Year: era spectrum, era table, decade table, "The time capsule" superlative
- Duration: nothing yet

Nowhere does a **song row** show any of these. Every song list shows title,
artist, submitter, round, and score, and stops there. Pass B fixes that and
builds the two missing summary panels (quadrant, popularity bands).

Pass B is six items, ordered so the first change (B1) unblocks the rest and
delivers the biggest visual payoff for the smallest change.

Every change follows the same rule: **absent data self-suppresses**. A song
with no obscurity reading gets no obscurity tag, no error, no `—` placeholder.
The existing I6 invariant is upheld everywhere.

---

## B1 — SongTags component + obscurity helper (first, unblocks the rest)

### What it does

Every song row across every tab gains a compact tag line under the title:
`2018 · deep cut · alt · covers "Sabotage"`.

Chips render only when the underlying field exists on the song. On a song
with none of them, the whole line is absent (renders `null`).

### Files to create

**`src/lib/obscurity.ts`** — new file. Band thresholds for Last.fm listener
counts. Should export:

```typescript
export type ObscurityBand = 'deep cut' | 'known' | 'hit' | 'mega-hit';

/** Bucket a Last.fm listener count into a human label. */
export function obscurityBand(value: number, source: string): ObscurityBand {
  // Only Last.fm listener counts have known thresholds; Spotify popularity
  // (0-100 scale) would need different bands. Return 'known' as a
  // conservative default for unrecognised sources.
  if (source !== 'lastfm-listeners') return 'known';
  if (value < 20_000) return 'deep cut';
  if (value < 500_000) return 'known';
  if (value < 5_000_000) return 'hit';
  return 'mega-hit';
}
```

Thresholds are copied straight from the wireframe's popularity-band table
(line 401 of `wireframes-v2.html`).

Tests for this file live in `src/__tests__/obscurity.test.ts` (new). Two
cases: threshold values return the right band; unknown source falls back
to 'known'.

### Files to edit

**`src/components/SongMedia.tsx`** — add a new `<SongTags>` component that
takes a song-like object with any of the enrichment fields, and renders the
tag line. Signature:

```typescript
interface SongTagsProps {
  year?: number;
  obscurity?: { value: number; source: string };
  artist?: string; // used only to look up genre
  durationMs?: number;
  cover?: { originalTitle?: string; originalArtist?: string };
  className?: string;
}
export function SongTags(props: SongTagsProps): JSX.Element | null;
```

The component:
1. Reads `embeddedGenres` from `virtual:league-data` at module scope.
2. Builds an array of chip strings, in this order:
   - Year, if present: `"2018"`
   - Obscurity band, if present: `"deep cut" | "known" | "hit" | "mega-hit"`
   - Up to 2 genres for the artist (lowercased-first-artist lookup): `"alt"`, `"pop"`
   - Duration, only when noteworthy: `"< 2:00"` if under 120000ms, `"> 6:00"`
     if over 360000ms
   - Cover-of, if present: `"covers \"Sabotage\""`
3. Returns `null` if the array is empty.
4. Otherwise returns a `<span className="song-tags">…</span>` with each chip
   wrapped in `<span className="song-tag song-tag--{kind}">…</span>` so CSS
   can colour them differently. The `kind` matches: year, obscurity, genre,
   duration, cover.

### Files to touch (wire it in)

Wire `<SongTags>` into every song row. In each case, the tag line goes on a
new line under the title/artist, before the score.

1. `src/components/SongsPanel.tsx` — inside the "Song" cell renderer (find
   the column with `key: 'title'`), render `<SongTags {...song} />` right
   after the title/artist line.

2. `src/components/Overview.tsx` — in `TopSongs`, inside the
   `.showcase__title` div, add `<SongTags {...song} />` below the artist line.

3. `src/components/PlayByPlayTab.tsx` — in `ChapterSongs`'s song rows and
   in `ChapterCard`'s `.chapter__winner-body`, render `<SongTags {...song} />`
   below the artist/submitter line.

4. `src/components/PlayersTab.tsx` — in the `PlayerDetail` submissions
   subtab (the `mySongs.map` block that renders `.song-row`), add
   `<SongTags {...s} />` in `.song-row__body`.

### CSS to add to `src/styles.css`

Append at the end:

```css
/* ---------------- song tags (year / obscurity / genre / duration / cover) ---------------- */

.song-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 3px;
}

.song-tag {
  display: inline-block;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--dim);
  border: 1px solid rgba(255, 255, 255, 0.06);
  white-space: nowrap;
}

.song-tag--year { color: #b9a4d0; }
.song-tag--obscurity { color: #d29922; }
.song-tag--genre { color: var(--accent-2); }
.song-tag--duration { color: var(--dim); }
.song-tag--cover { color: var(--accent); font-style: italic; }
```

### Verification

- `npm test` all green (no test should reference SongTags yet — this is
  additive).
- Rebake: `npm run bake -- snapshots/r6-2026-08-14/export/ --rounds 10`.
- Browser check: every song on every tab shows tags. Songs with no
  enrichment (rare) show no tag line at all.

---

## B2 — Sort/filter chip bar on the songs collection

### What it does

Above the "Every song" table in `SongsPanel`, a two-row control bar:

- Sort row: `Sort by: [Score] [Year] [Popularity] [Length] [Upvotes] [Downvotes] [Breadth]`
- Filter row: `Show: [All] [Covers] [Forfeited] [1990s] [2000s] [2010s] [Hip hop] [Rock] …`

Both use `.seg`/`.seg__btn` styling that already exists in `styles.css`.

### Files to edit

**`src/components/SongsPanel.tsx`** — add local state:

```typescript
type SortKey = 'net' | 'year' | 'obscurity' | 'duration' | 'upvotes' | 'downvotes' | 'breadth';
type FilterKey = 'all' | 'covers' | 'forfeited' | `decade-${number}` | `genre-${string}`;

const [sortKey, setSortKey] = useState<SortKey>('net');
const [filter, setFilter] = useState<FilterKey>('all');
```

Then derive `rows` from `stats.songs`:

1. Apply the filter — `covers` keeps songs with `song.cover`, `forfeited`
   keeps `song.forfeited === true`, `decade-2000` keeps songs where
   `Math.floor(song.year/10)*10 === 2000`, `genre-hip-hop` keeps songs where
   any of that artist's genres (from `embeddedGenres`) equals 'Hip hop'.
2. Sort by the current `sortKey` descending. Missing values sort last.
   For `obscurity`, sort by `song.obscurity?.value ?? Infinity` (so absent =
   last regardless of direction).

The available filter decades and genres are derived from the data:
```typescript
const decades = uniq(stats.songs.map(s => s.year && Math.floor(s.year/10)*10)).filter(Boolean).sort();
const topGenres = topN(genreCounts(stats, embeddedGenres), 4); // pick the 4 most common
```

Render:

```tsx
<div className="controls">
  <div className="seg seg--wrap">
    <span className="seg__label">Sort by</span>
    {SORT_OPTIONS.map(([key, label]) => (
      <button key={key} className={`seg__btn ${sortKey === key ? 'seg__btn--on' : ''}`}
              onClick={() => setSortKey(key)}>{label}</button>
    ))}
  </div>
  <div className="seg seg--wrap">
    <span className="seg__label">Show</span>
    {filterChips.map(...)}
  </div>
</div>
```

CSS additions:

```css
.controls {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}
.seg__label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--dim);
  padding: 6px 8px;
}
```

### Verification

- New test in `src/__tests__/App.test.tsx`: openDemo → click The Songs tab
  → click "Covers" filter → check that visible rows ≤ 12 (demo has ~12 covers).
- Manual: try each sort key; each filter chip.

---

## B3 — Quadrant panel (era × obscurity)

### What it does

A 2×2 grid on The Songs tab, between the DecadePanel and SongsPanel:

```
      obscure       famous
old   +3.4 (12 songs)   +0.4 (18 songs)
new   -0.2 (11 songs)   -1.6 (20 songs)
```

Each cell shows mean net score for songs falling into that quadrant, plus
count. The compute function already exists.

### Files to create

**`src/components/QuadrantPanel.tsx`** — new component. Signature:

```typescript
export function QuadrantPanel({ stats }: { stats: Stats }): JSX.Element | null;
```

Implementation:

1. Call `computeQuadrantTable(stats)` from `src/lib/taste.ts`.
2. If it returns an empty array (I6: not enough data), return `null`. Do
   NOT render an empty card — the panel self-suppresses.
3. Otherwise render a `<Card title="What wins here, by era and popularity">`
   containing a 2×2 CSS grid, one cell per `QuadrantStats` object.

Cell markup:

```tsx
<div className="quadrant__cell">
  <div className="quadrant__label">{q.quadrant}</div>
  <div className="quadrant__score">{q.avgNet > 0 ? '+' : ''}{q.avgNet.toFixed(1)}</div>
  <div className="quadrant__count">{q.count} songs</div>
</div>
```

Grid layout: the four quadrants aren't necessarily returned in a fixed
order, so build a lookup `Map<ObscurityQuadrant, QuadrantStats>` and render
cells in a fixed order (`old & obscure`, `old & famous`, `new & obscure`,
`new & famous`).

### Files to edit

**`src/components/TheSongsTab.tsx`** — import and place `<QuadrantPanel>`
right after `<DecadePanel>` and before the popularity-band table (B4).

### CSS to add

```css
.quadrant {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-top: 12px;
}
.quadrant__cell {
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 14px 16px;
  text-align: center;
}
.quadrant__label {
  font-size: 11.5px;
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
}
.quadrant__score {
  font-size: 22px;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
}
.quadrant__score.pos { color: var(--pos); }
.quadrant__score.neg { color: var(--neg); }
.quadrant__count {
  font-size: 12px;
  color: var(--dim);
  margin-top: 4px;
}
```

### Verification

- New test in `src/__tests__/taste.test.ts`: given a small set of songs,
  `computeQuadrantTable` returns the expected quadrants. (May already exist.)
- Rebake and eyeball: The Songs tab shows a 2×2 panel with plausible
  numbers. Songs without both year and obscurity aren't included.

---

## B4 — Popularity band table

### What it does

A small card next to the DecadePanel: "What wins here, by popularity". Four
rows, one per band:

```
Deep cuts (< 20k listeners)   +3.4    (n=8)   [bar]
Known                          +1.1    (n=22)  [bar]
Hits                          -0.4    (n=25)  [bar]
Mega-hits (> 5M listeners)     -1.6    (n=13)  [bar]
```

### Files to edit

**`src/lib/taste.ts`** — add:

```typescript
export interface PopularityBandStats {
  band: ObscurityBand;
  count: number;
  avgNet: number;
}

export function computePopularityBands(stats: Stats): PopularityBandStats[] {
  const rated = stats.songs.filter((s) => s.obscurity !== undefined);
  if (!rated.length) return [];
  const buckets = new Map<ObscurityBand, number[]>();
  for (const song of rated) {
    const band = obscurityBand(song.obscurity!.value, song.obscurity!.source);
    const arr = buckets.get(band);
    if (arr) arr.push(song.net);
    else buckets.set(band, [song.net]);
  }
  // Return in canonical order, regardless of what's present.
  return (['deep cut', 'known', 'hit', 'mega-hit'] as const)
    .filter((b) => buckets.has(b))
    .map((band) => {
      const nets = buckets.get(band)!;
      return { band, count: nets.length, avgNet: nets.reduce((a, b) => a + b, 0) / nets.length };
    });
}
```

Import `obscurityBand` from `../lib/obscurity` (created in B1).

### Files to create

**`src/components/PopularityBandsPanel.tsx`** — new component. Same shape
as `DecadePanel` (see `TheSongsTab.tsx` for a nearly identical component).

- If `computePopularityBands(stats)` returns empty, render `null`.
- Otherwise render a Card titled "What wins here, by popularity" with a
  table mirroring the decade table's structure: label, count, mean, bar.
- Bar width scales to the largest absolute avgNet in the set.

### Files to edit

**`src/components/TheSongsTab.tsx`** — place `<PopularityBandsPanel>` right
after `<DecadePanel>`. Both together form a 2-panel row.

### Tests

**`src/__tests__/taste.test.ts`** — extend with cases for
`computePopularityBands`: given a mix of songs, returns bands in canonical
order; songs without obscurity are excluded.

### Verification

- Rebake and check that the popularity bands panel appears with 4 rows.

---

## B5 — Genre column on the songs table

### What it does

Add a "Genre" column to the `SortableTable` in `SongsPanel`, showing the
top genre for each song's artist (or `—` if absent). Chosen genre is the
first entry in `embeddedGenres[artist.toLowerCase()]`.

### Files to edit

**`src/components/SongsPanel.tsx`** — add to the `columns` array:

```typescript
{
  key: 'genre',
  label: 'Genre',
  value: (s) => {
    const genres = embeddedGenres[s.artist?.toLowerCase() ?? ''] ?? [];
    return genres[0] ?? '';
  },
  render: (s) => {
    const genres = embeddedGenres[s.artist?.toLowerCase() ?? ''] ?? [];
    return genres[0] ? <span className="dim small">{genres[0]}</span> : <span className="dim">—</span>;
  },
},
```

Import `embeddedGenres` at the top:
```typescript
import { embeddedGenres } from 'virtual:league-data';
```

### Verification

- The Songs → Every song table now has a Genre column, sortable.
- Songs by artists with no genre show `—`.

---

## B6 — Avg pop column on the era table

### What it does

Add a per-player "Avg pop" column to the era table on Players, formatted
as a **label** ("mostly deep cuts" / "mixed" / "mostly hits") rather than a
raw listener figure. The raw number is inscrutable; the label lets a reader
compare players.

### Files to edit

**`src/lib/taste.ts`** — extend `PlayerEraProfile`:

```typescript
export interface PlayerEraProfile {
  // …existing fields
  avgObscurity?: number; // mean obscurity across this player's submitted songs, when any have one
}
```

In `computeEraProfiles`, after the existing submission calc, add:

```typescript
const rated = mine.filter((s) => s.obscurity !== undefined);
const avgObscurity = rated.length
  ? rated.reduce((a, s) => a + s.obscurity!.value, 0) / rated.length
  : undefined;
```

Then include `avgObscurity` in the pushed profile.

**`src/components/PlayersTab.tsx`** — in `EraTable`, add a column between
"Gap" and "Archetype":

```tsx
<th className="num">Avg pop</th>
```

And in the row body:

```tsx
<td className="num dim" title={era?.avgObscurity ? `${Math.round(era.avgObscurity).toLocaleString()} avg listeners` : ''}>
  {popLabel(era?.avgObscurity)}
</td>
```

Add a small helper:

```typescript
function popLabel(v: number | undefined): string {
  if (v === undefined) return '—';
  // Buckets align with the same thresholds obscurityBand uses.
  if (v < 20_000) return 'deep cuts';
  if (v < 500_000) return 'mixed';
  if (v < 5_000_000) return 'hits';
  return 'megahits';
}
```

### Tests

- `taste.test.ts`: `computeEraProfiles` returns `avgObscurity` when songs
  have obscurity; leaves it undefined when they don't.

---

## Order and dependencies

- **B1 must come first** — B4 uses `obscurityBand` from B1's new file, and
  B2's sort-by-popularity is only useful after B1 shows the reader what the
  popularity data looks like.
- B3, B4, B5, B6 have no cross-dependencies and can go in any order after B1.
- B2 is the biggest interaction change; do it last so nothing else is
  churning around it.

Recommended sequence: **B1 → B3 → B4 → B5 → B6 → B2**.

---

## Global verification (after every task)

1. `npm test` — all green.
2. `npm run bake -- snapshots/r6-2026-08-14/export/ --rounds 10` — no errors.
3. Refresh `http://localhost:4173` in the browser and eyeball the affected
   panels. Absent-data cases (a song with no obscurity, an artist with no
   genre) should self-suppress, not render placeholders or error.

If a test that previously passed starts failing, the change likely
introduced a duplicate element (e.g. two "Genre" columns on the same table).
Read the assertion carefully before "fixing" the test — the test was probably
right about a real bug.

---

## Not in this pass

- Pass C (Overview gateway teasers, chapter "After: standings", player bio
  prose, Race Note column, LopsidedPair bar visual, Praise-vs-blame counts)
- Phase 5 round-7 dry run
- Any visual overhaul of the aesthetic

Those are separate documents (Pass C plan to follow).
