# Music League Dashboard

A local dashboard for a Music League export. Drop the CSV in and it answers the
questions the site itself does not: who votes for whose songs, who gets frozen
out, what not voting actually cost, and how the standings really moved.

Everything is parsed in the browser. There is no backend and no upload — your
league data never leaves the machine. The only outside requests the published
page can make are for its own images, and to Spotify, only when a reader
presses play on a song.

## The two league rules the export does not carry

Music League leagues differ in two ways that decide the standings, and neither
appears in the export file. Both are settings here rather than assumptions.

**Non-voters.** Music League has no point penalty for skipping a vote. In
**Competitive Mode** a non-voter instead receives **none of the upvotes their
own song earned** that round, while still taking any downvotes.

**Negative scores.** Music League's own documentation says a song's score floors
at zero, so downvotes can only take it to nothing. Real leagues do not all
behave that way: one league checked against its live standings summed raw nets,
with seven of twelve players finishing below zero. So flooring is a switch.

Both are resolved in the same order:

1. `--competitive` / `--friendly` and `--floor` / `--no-floor` on the bake
   command always win.
2. Otherwise, if the export has a `[standings]` section, all four combinations
   are computed and the one that reproduces the official totals is used.
3. Otherwise it assumes friendly scoring with flooring on, matching Music
   League's documented defaults, and the CLI says so.

The bake command prints the standings it is about to publish, itemised, so they
can be compared against the site before anything is hosted. If they disagree,
one of the two rules is set the wrong way.

The published page carries switches for both, shown only when the league
actually contains the situation each governs — non-voters, and downvotes.

Under competitive scoring, a forfeited song keeps its raw numbers everywhere
that describes *how the room voted* — breadth, spread, concentration, affinity,
devotion — and loses them everywhere that describes *what the league counted*:
round rank, round winner, season total, standings timeline. Round ranking always
uses the raw score, so the zero floor never changes who won a round.

```bash
npm run bake -- src/data --competitive --no-floor --redact
```

## Running it

```bash
npm install
npm run dev      # opens http://localhost:5173
npm test         # 308 tests over the parser, the metrics, scoring, the UI and redaction
npm run build    # type-check and produce dist/
```

Add `#demo` to the URL to load a synthetic sample league, e.g.
`http://localhost:5173/#demo:Voting`.

## Publishing a static copy

`npm run build` gives a hostable `dist/`, but visitors would still have to drop
the CSV in themselves. To bake the league into the page instead:

```bash
npm run bake -- "~/Downloads/My League.csv"           # -> dist/
npm run bake -- "My League.csv" --base /musicleague/  # GitHub Pages subfolder
```

The CSVs are parsed and validated first, so a wrong file fails at the terminal
rather than as an empty page on your host. It prints what it found — players,
rounds, songs, vote rows — before building.

| Option | Effect |
| --- | --- |
| `--out <dir>` | output directory, default `dist` |
| `--base <path>` | public base path for subfolder hosting, e.g. `/repo-name/` |
| `--label <name>` | header title, default derived from the filename |
| `--redact` | publish surnames as an initial and dashes, e.g. `Tim E---` |
| `--competitive` | non-voters forfeit the upvotes their song earned that round |
| `--friendly` | everyone keeps what their songs earned |
| `--floor` | a song cannot score below zero |
| `--no-floor` | downvotes carry through, so a total can be negative |

`dist/` works on any static host — GitHub Pages, S3, Netlify, Cloudflare Pages,
a plain nginx directory. There is no backend; it fetches its own images from
wherever it is hosted, and the only third-party request is Spotify, only when
a reader presses play.

**It contains the export in readable form** — names, songs, every vote and who
cast it. Anyone with the URL can read it, so host it privately if the league
would not want it public.

## A league that is still running

The export only contains rounds that exist, so a season halfway through looks
identical to a finished one. Passing `--rounds <n>` states how many rounds the
league will run. That puts "6 of 10 rounds" in the header, adds a banner saying
every standing is a running total, and shifts the copy: "song of the season"
becomes "best song of the first 6 rounds", "never gave them a point" becomes
"has yet to give them a point", and the winner becomes the leader.

Where an export does contain a round with no results yet — one still in voting —
that is detected on its own and the same language applies.

```bash
npm run bake -- src/data --competitive --no-floor --rounds 10 --redact
```

## Redacting surnames for a public deploy

`--redact` publishes `Tim Engel` as `Tim E---`, first names intact.

The rewrite happens to the **export itself, before it is embedded**. Redacting
at display time would be theatre: the full names would still sit in the bundle
for anyone who opened the page source.

What it does, and does not, touch:

- Display-name columns are rewritten; opaque id columns never are, or the
  classic export's joins between votes, songs and people would break.
- A `Name` column means a person in `competitors.csv` and `[standings]`, and a
  round title in `rounds.csv`. Context decides, so round names survive.
- Names written into comments are swept too, including bare surnames — a
  comment reading "classic Engel pick" would otherwise leak the very thing
  being hidden. Every such edit is printed for review, because comments are
  published verbatim and a wrong substitution would be visible.
- Colliding surnames keep enough letters to stay apart: `Dave Smith` and
  `Dave Sanders` become `Dave Sm---` and `Dave Sa---`, never one merged name.
- Single-token names (`Greggo`) and surnames already reduced to an initial
  (`Laura M`) are left exactly as they are.

After rewriting, the export is re-parsed and the player, song and vote counts
are compared with the originals. If redaction changed the data, the build fails
rather than publishing something wrong.

Song titles, artists and comment text are still published verbatim, so the CLI
lists any surname it can still find in the file after redaction.

## Album art and listening to the songs

The export carries a Spotify track id for every submission and a playlist URL
for every round, so both are exact rather than guessed.

**Artwork.** `npm run bake` resolves each track's cover through Spotify's oEmbed
endpoint, which needs no API key or quota, and writes it to a real image file
under `dist/art/`. The built page therefore shows artwork as a same-origin
image rather than a third-party request when a reader opens it — the file was
already fetched at build time, not on their behalf. Only track ids are sent to
Spotify — never names, votes or comments. Files are shared across every past
snapshot and cached under `.cache/art.json` (or `snapshots/art/` once a
snapshot exists), so rebuilds only download what they have not seen before, and
`--no-art` skips the step entirely.

Two sizes are fetched: a 64px thumbnail for table rows, and a 300px cover for
the handful of songs shown as hero cards. Keeping them as files rather than
inlining them into the JS bundle is what keeps that bundle small.

**Playback.** Each song gets a **Play** button that inserts a Spotify player,
plus links to the track and to a YouTube search. The player is
**click-to-load**: until a reader presses play, the page has made no third-party
request at all. That is why the privacy note says "no requests until you press
play" rather than "no requests".

YouTube is a search link rather than an embed on purpose. The export holds no
YouTube id, so embedding — or using a video thumbnail — would mean resolving one
through the Data API: an API key, a quota, and fuzzy matching that would
sometimes land on a lyric video or a live cover instead of the song someone
submitted. Spotify supplies the real cover for the exact track instead.

## Getting the export

On Music League, open your league and choose **Export Data** from the league
menu, or use the export button on the Standings tab. It is a Premium feature and
becomes available once voting has opened on the first round.

The file is one CSV containing five labelled sections — `[rounds]`,
`[submissions]`, `[votes]`, `[comments]`, `[standings]`. Older multi-file exports
(`competitors.csv`, `rounds.csv`, `submissions.csv`, `votes.csv`) also work;
select them all at once.

Exports respect the league's privacy settings, so the dashboard degrades
gracefully:

- vote breakdown hidden → per-voter panels are empty, with a warning
- anonymous rounds → those songs are excluded from per-submitter stats
- deleted accounts → shown as unknown rather than invented as a player

## The network and future tabs

**Network** draws the league as a graph. An edge is the *mutual* warmth between
two players — what they gave each other as a share of what the rules allowed —
so a one-way crush does not read as a friendship, and players with different
numbers of shared rounds stay comparable.

Clusters are built from each player's warmest few ties, then by following the
connections. Label propagation was tried first and does not work here: everyone
in a league votes for everyone at least a little, so the graph is dense and
propagation collapses into a single community that says nothing. Where a league
genuinely has no camps, the panel says so rather than drawing one blob and
calling it a cluster. The layout is a spring simulation with fixed starting
positions and a fixed iteration count, so the same export always draws the same
picture.

**Future** projects what can still change. Every figure is grounded in observed
play: the biggest round anyone has managed, the median winning score, and the
largest swing the league has actually produced. It reports two counts — who is
mathematically alive, and who is alive on swings that have really happened —
because the theoretical ceiling, every voter maxing out one song, is so far from
reality that it would call everyone a contender.

Beyond the two ends of the table it looks for angles that are not simply gaps:
the **kingmaker** whose ballot alone changed who won a round (found by
re-scoring each round with that voter removed), **form** across the first and
second half of the season, places that are **level or within a point**,
**downvote exposure** per round, and **support narrow enough to collapse** if
one voter changes their mind. Only one card per player is shown, so the most
interesting player cannot fill the tab.

## How the headline metrics are defined

Several obvious-looking metrics are misleading if taken literally, so they are
normalised. Definitions live next to the code in `src/lib/stats.ts`.

**Points forfeited by not voting.** Music League has no point penalty for
skipping a vote. In Competitive Mode a non-voter instead forfeits every upvote
their own song earned that round, while still taking any downvotes. The
dashboard reports those earned-but-uncredited points. If your league is not in
Competitive Mode nothing was deducted — read it as what non-voting would have
cost.

**How a score adds up.** Every points figure is shown as its parts, because
with downvotes and Competitive Mode forfeits a bare total is not checkable:

    total = upvotes − downvotes − forfeited + floored

The last term is the part of the downvotes that never landed, since a song
cannot score below zero; it is always zero in a league without flooring, and
the column then disappears. Without the term the figures look like they do not
reconcile. `ScoreBreakdown` in `src/lib/stats.ts` carries all five numbers per
song and per player, and the panel "How the scores add up" on the Standings tab
shows them side by side with a diverging bar: a zero axis with the counted score
to its right in green or to its left in red, and a dashed outline behind it for
what was earned in upvotes before downvotes and forfeits were taken off. A
player can therefore be seen to have earned plenty and still finished below zero.

**Affinity** — upvote points a voter gave someone, divided by what an even
spread of their ballot would predict. 1.00 is a fair share, 2.00 is double, 0
means never once. Intuitive, but its ceiling depends on ballot size.

**Net affinity** — the same ratio on *net* points, so downvotes count against a
voter's warmth. Affinity alone cannot describe how a voter feels about a player:
in this league a voter who gave one player a single point and six downvotes
scored the same affinity as one who gave a point and nothing else, and the
player profiles named the wrong sceptic because of it. Anything phrased as a
feeling — biggest fan, least impressed, their own favourite — ranks on net
affinity, and the panel prints the split ("net −5 — 1 up, 6 down") so the
reader can see both halves. Affinity itself is left on upvotes, because
"share of a ballot spent on you" is a question about what was given.

**Devotion** — points given as a share of the *most the rules allowed*
(the voter's budget, or the per-song cap times the songs available, whichever
binds). Bounded at 100%, so unlike affinity it is safe to compare across voters.
Superfan rankings use devotion, with ties broken by total points, so a
season-long loyalist is not displaced by someone who maxed out twice.

**Breadth** — the share of eligible voters who gave a song any points. Answers
"did the room agree" rather than "did it score well".

**Concentration** — Herfindahl index of a song's upvotes. 100% means a single
voter supplied the entire score.

**Spread** — standard deviation of points across everyone who could vote on the
song. High means the room split.

**Taste alignment** — for each round, songs are ranked by everyone *else's*
verdict, and the voter's points-weighted average percentile is taken. High is
mainstream, low is contrarian.

**Observed per-song cap** — inferred from the largest single vote actually cast,
so it reflects any automatic cap raise Music League applied to a thin round.

Two deliberate choices about scoring: a song's raw net score (which can be
negative) is kept for ranking, while a player's season total floors each song's
contribution at zero, matching what Music League displays. Both are available —
`pointsReceived` is the raw net, `pointsFloored` is the league score, and the
dashboard shows the latter everywhere so no two panels disagree. Under
competitive scoring a third figure appears per song, `effectiveNet`: what the
league actually counted after any forfeit.

## Limitations worth knowing

- **The per-song cap is inferred, not given.** The export does not carry league
  settings, so the cap is taken from the largest vote anyone actually cast. If
  nobody maxed out in a round, the real cap was higher, and devotion and
  "maxed out" will read a little high for that round.
- **Rounds with no vote rows are left alone.** Where the breakdown is hidden or
  voting is still open, those rounds produce no winner, no ranks and no
  forfeits, rather than a table full of zeroes and alphabetical winners.
- **Anonymous songs sit out the relational stats.** They still count toward
  round totals, but they cannot be attributed, so they are excluded from
  affinity, devotion and per-submitter figures.
- The official `[standings]` section is parsed and available but not yet
  displayed; every figure shown is derived independently from the vote rows.

## Layout

```
src/lib/types.ts    canonical data model
src/lib/parse.ts    tolerant CSV parsing, both export generations
src/lib/stats.ts    every derived metric
src/lib/inspect.ts  pre-build validation summary
src/lib/social.ts   mutual-warmth graph and clustering
src/lib/future.ts   projections for the rounds still to play
src/lib/demo.ts     deterministic sample league
src/components/     dashboard panels
scripts/bake.mjs    CLI: validate an export and build a static copy
src/lib/redact.ts   surname redaction for a public deploy
scripts/snapshot.mjs archives an export, its enrichment and its build before
                    the next round's export overwrites them
scripts/art.mjs     fetches album art at bake time, writing real image files
scripts/genres.mjs  resolves artist genres on MusicBrainz, with a vocabulary
src/lib/genres.ts   genre analysis, with sample sizes enforced
```

## Genres, and why they are hedged

The export carries no genre field, so genre is the one figure here that comes
from outside the league. `--genres` resolves it from artist names through
MusicBrainz, which needs no API key but asks for one request a second, so an
81-artist league takes about two minutes on a cold cache. Results are cached
under `.cache/genres.json`.

Three limits are handled in the open rather than papered over:

- **Coverage is partial.** 65 of 81 artists resolved in the league this was
  built against; soundtrack casts, kids' brands and small artists often have no
  tags. Unresolved artists are listed on the page rather than dropped silently.
- **Tags are crowd-sourced and noisy.** "90s", "american" and "male vocalists"
  arrive alongside real genres, so tags are mapped onto a fixed vocabulary and
  anything unrecognised is discarded. Matching takes the longest fragment, which
  is what stops "reggaeton" being filed under Reggae or "indie rock" under Rock.
- **The samples are small.** Sixty-odd songs over a dozen genres leaves three or
  four songs each. Genres below four songs are marked *thin* and get no verdict,
  because one lucky round would decide the ranking.

Performance is reported as points per song **above or below** the league
average, not as a ratio. In a downvote-heavy league the average sits near zero,
and dividing by it turns ordinary noise into multipliers like 3.6×.
