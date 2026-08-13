/**
 * Deterministic synthetic league in the modern export layout.
 *
 * Used for the dashboard's demo mode and as an integration fixture. The
 * players are given deliberate personalities (a superfan, a downvoter, a
 * serial non-voter) so every panel has something to show.
 */

/** Mulberry32 — small, seedable, good enough for fixtures. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLAYERS = ['Ada', 'Bo', 'Cleo', 'Dev', 'Esme', 'Finn', 'Gus'] as const;

const ROUNDS = [
  ['Songs that open with a scream', 'Loud from the very first second.'],
  ['One-hit wonders', 'They had exactly one and then vanished.'],
  ['Covers better than the original', 'Fight about it in the comments.'],
  ['Songs under two minutes', 'In, out, done.'],
  ['Guilty pleasures', 'No judgement. Some judgement.'],
  ['Best bassline', 'Low end only.'],
] as const;

const ARTISTS = [
  'The Ochre Hours',
  'Vellum',
  'Sparrowgrass',
  'Neon Postcard',
  'Halcyon Drift',
  'Static Bloom',
  'The Ochre Hours',
  'Marble Index',
  'Low Ceiling',
  'Papercut Radio',
];

const TITLES = [
  'Glass Weather',
  'Slow Parade',
  'Kerosene Sunday',
  'Tallboy',
  'Hymn for a Wire',
  'Antenna Kid',
  'Blue Hour Freight',
  'Cassette Ghost',
  'Paper Lantern',
  'Salt and Signal',
];

/** Extra weight voter -> submitter, layered on top of song quality. */
const AFFINITY: Record<string, Record<string, number>> = {
  Ada: { Bo: 3.2, Gus: 0.15 },
  Bo: { Ada: 1.4 },
  Cleo: { Dev: 2.6, Esme: 0.2 },
  Dev: { Cleo: 0.5 },
  Esme: { Finn: 2.0 },
  Finn: { Ada: 1.8, Bo: 0.3 },
  Gus: { Esme: 1.7 },
};

/** Rounds in which a player submits but never votes. */
const SKIPPED_VOTING: Record<string, number[]> = {
  Gus: [2, 4, 5],
  Dev: [3],
};

const POINTS_PER_VOTER = 10;
const MAX_PER_SONG = 4;
const DOWNVOTES_PER_VOTER = 2;
/** Players who actually spend their downvotes, and on whom. */
const DOWNVOTERS: Record<string, string> = { Finn: 'Gus', Ada: 'Gus', Dev: 'Bo' };

const csvCell = (v: string): string =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

const csvRow = (cells: (string | number)[]): string =>
  cells.map((c) => csvCell(String(c))).join(',');

export function buildDemoCsv(seed = 20260813): string {
  const rand = rng(seed);
  const lines: string[] = [];

  /* ---- rounds ---- */
  lines.push('[rounds]');
  lines.push(csvRow(['Position', 'Title', 'Description', 'Voting Closes', 'Status']));
  ROUNDS.forEach(([title, description], i) => {
    const day = String(3 + i * 7).padStart(2, '0');
    lines.push(
      csvRow([i + 1, title, description, `2026-0${1 + Math.floor(i / 3)}-${day}T18:00:00Z`, 'Completed']),
    );
  });
  lines.push('');

  /* ---- submissions ---- */
  interface Song {
    round: string;
    roundIdx: number;
    submitter: string;
    title: string;
    artist: string;
    /** Latent quality, drives how the room votes. */
    quality: number;
  }
  const songs: Song[] = [];

  ROUNDS.forEach(([roundTitle], roundIdx) => {
    PLAYERS.forEach((player, pi) => {
      // Esme sits out round 4 entirely.
      if (player === 'Esme' && roundIdx === 3) return;
      // Titles must be unique within a round: Music League will not accept
      // the same track twice, and the votes section refers to songs by name.
      const t = (roundIdx * 2 + pi) % TITLES.length;
      // Artists deliberately repeat, both within and across rounds.
      const a = (roundIdx * 3 + pi * 2) % ARTISTS.length;
      songs.push({
        round: roundTitle,
        roundIdx,
        submitter: player,
        title: `${TITLES[t]}${roundIdx % 2 === 1 ? ' (Reprise)' : ''}`,
        artist: ARTISTS[a],
        quality: 0.25 + rand() * 0.75,
      });
    });
  });

  lines.push('[submissions]');
  lines.push(
    csvRow(['Round', 'Submitter', 'Song Title', 'Artist', 'Spotify Track ID', 'Note', 'Submitted At']),
  );
  songs.forEach((s, i) => {
    lines.push(
      csvRow([
        s.round,
        s.submitter,
        s.title,
        s.artist,
        `track${String(i).padStart(3, '0')}`,
        i % 5 === 0 ? 'Been saving this one.' : '',
        `2026-01-0${1 + (i % 9)}T12:00:00Z`,
      ]),
    );
  });
  lines.push('');

  /* ---- votes ---- */
  const voteRows: (string | number)[][] = [];

  ROUNDS.forEach(([roundTitle], roundIdx) => {
    const ballot = songs.filter((s) => s.roundIdx === roundIdx);

    for (const voter of PLAYERS) {
      if (SKIPPED_VOTING[voter]?.includes(roundIdx)) continue;
      const votable = ballot.filter((s) => s.submitter !== voter);
      if (!votable.length) continue;

      // Weight each song, then hand out the budget in proportion to those
      // weights so a wired-in favourite reliably gets the per-song cap.
      const weighted = votable
        .map((s) => ({
          song: s,
          weight: s.quality * (AFFINITY[voter]?.[s.submitter] ?? 1) * (0.6 + rand() * 0.8),
        }))
        .sort((x, y) => y.weight - x.weight);

      const totalWeight = weighted.reduce((a, w) => a + w.weight, 0);
      const allocation = new Map<Song, number>();
      let spent = 0;
      for (const { song, weight } of weighted) {
        const share = Math.min(
          MAX_PER_SONG,
          Math.floor((weight / totalWeight) * POINTS_PER_VOTER),
          POINTS_PER_VOTER - spent,
        );
        if (share <= 0) continue;
        allocation.set(song, share);
        spent += share;
      }
      // Top up in weight order until the budget clears.
      while (spent < POINTS_PER_VOTER) {
        const candidate = weighted.find(({ song }) => (allocation.get(song) ?? 0) < MAX_PER_SONG);
        if (!candidate) break;
        allocation.set(candidate.song, (allocation.get(candidate.song) ?? 0) + 1);
        spent += 1;
      }

      for (const [song, points] of allocation) {
        voteRows.push([roundTitle, voter, song.submitter, song.title, points]);
      }

      // Downvotes, for the players who bother.
      const target = DOWNVOTERS[voter];
      if (target && roundIdx % 2 === 0) {
        const victim = votable.find((s) => s.submitter === target);
        if (victim) {
          voteRows.push([roundTitle, voter, victim.submitter, victim.title, -DOWNVOTES_PER_VOTER]);
        }
      }
    }
  });

  lines.push('[votes]');
  lines.push(csvRow(['Round', 'Voter', 'Submitter', 'Song Title', 'Points']));
  for (const row of voteRows) lines.push(csvRow(row));
  lines.push('');

  /* ---- comments ---- */
  const CHATTER = [
    'This is a banger and you all slept on it.',
    'Had to look this up. Glad I did.',
    'Bassline of the year, no notes.',
    'Sorry, not for me at all.',
    'I have played this eleven times today.',
    'Obvious pick but a correct one.',
  ];
  lines.push('[comments]');
  lines.push(csvRow(['Round', 'Song Title', 'Author', 'Comment', 'Posted At']));
  songs.forEach((s, i) => {
    const talkers = [PLAYERS[(i + 1) % PLAYERS.length], PLAYERS[(i + 3) % PLAYERS.length]];
    talkers.forEach((author, k) => {
      if (author === s.submitter) return;
      if ((i + k) % 3 !== 0) return;
      lines.push(
        csvRow([s.round, s.title, author, CHATTER[(i + k) % CHATTER.length], `2026-01-0${1 + (i % 9)}T20:00:00Z`]),
      );
    });
  });
  lines.push('');

  /* ---- standings ----
   * Computed the way a Competitive Mode league would: a player who skipped
   * voting keeps none of the upvotes their song earned that round. The
   * dashboard infers the scoring model by matching these totals, so they have
   * to be internally consistent.
   */
  const totals = new Map<string, number>();
  for (const p of PLAYERS) totals.set(p, 0);
  for (const s of songs) {
    const rows = voteRows.filter(
      (r) => r[0] === s.round && r[3] === s.title && r[2] === s.submitter,
    );
    const up = rows.reduce((acc, r) => acc + Math.max(0, Number(r[4])), 0);
    const down = rows.reduce((acc, r) => acc + Math.min(0, Number(r[4])), 0);
    const skipped = SKIPPED_VOTING[s.submitter]?.includes(s.roundIdx) ?? false;
    const counted = skipped ? 0 : Math.max(0, up + down);
    totals.set(s.submitter, (totals.get(s.submitter) ?? 0) + counted);
  }
  const ordered = [...totals.entries()].sort((a, b) => b[1] - a[1]);

  lines.push('[standings]');
  lines.push(csvRow(['Position', 'Name', 'Points', 'Rounds Played']));
  ordered.forEach(([name, points], i) => {
    const played = new Set(songs.filter((s) => s.submitter === name).map((s) => s.roundIdx)).size;
    lines.push(csvRow([i + 1, name, points, played]));
  });
  lines.push('');

  return lines.join('\n');
}
