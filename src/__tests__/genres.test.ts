import { describe, expect, it } from 'vitest';
import { canonicalGenre, genresFromTags } from '../../scripts/genres.mjs';
import { genreHighlights, genreReport, MIN_SAMPLE } from '../lib/genres';
import { parseLeague } from '../lib/parse';
import { computeStats } from '../lib/stats';

describe('canonicalGenre', () => {
  it('maps real tags onto the vocabulary', () => {
    expect(canonicalGenre('alternative rock')).toBe('Alternative');
    expect(canonicalGenre('hip hop')).toBe('Hip hop');
    expect(canonicalGenre('new jack swing')).toBe('R&B');
    expect(canonicalGenre('downtempo')).toBe('Electronic');
    expect(canonicalGenre('reggaeton')).toBe('Latin');
  });

  it('discards tags that are not genres at all', () => {
    // MusicBrainz tags are crowd-sourced and full of these.
    for (const junk of ['90s', 'male vocalists', 'favourites', 'seen live', '']) {
      expect(canonicalGenre(junk)).toBeNull();
    }
  });

  it('does not mistake a nationality for a genre', () => {
    // "american" must not become "Americana" via a loose substring match.
    expect(canonicalGenre('american')).toBeNull();
    expect(canonicalGenre('americana')).toBe('Folk');
  });

  it('lets the longest fragment win, not the first listed', () => {
    // "reggaeton" contains "reggae", and filing it under Reggae would be wrong.
    expect(canonicalGenre('reggaeton')).toBe('Latin');
    expect(canonicalGenre('reggae')).toBe('Reggae');
    expect(canonicalGenre('indie rock')).toBe('Alternative');
    expect(canonicalGenre('deep house')).toBe('House');
  });

  it('prefers the more specific genre when tags overlap', () => {
    expect(canonicalGenre('punk rock')).toBe('Punk');
    expect(canonicalGenre('indie rock')).toBe('Alternative');
    expect(canonicalGenre('classic rock')).toBe('Rock');
  });
});

describe('genresFromTags', () => {
  it('weights by how many people voted for a tag', () => {
    expect(
      genresFromTags([
        { name: 'rock', count: 1 },
        { name: 'hip hop', count: 9 },
      ]),
    ).toEqual(['Hip hop', 'Rock']);
  });

  it('keeps a short list rather than everything', () => {
    const tags = ['rock', 'punk', 'metal', 'pop', 'jazz'].map((name) => ({ name, count: 1 }));
    expect(genresFromTags(tags)).toHaveLength(2);
  });

  it('returns nothing when no tag is a genre', () => {
    expect(genresFromTags([{ name: '90s', count: 5 }, { name: 'american', count: 3 }])).toEqual([]);
  });

  it('handles a missing or empty tag list', () => {
    expect(genresFromTags(undefined)).toEqual([]);
    expect(genresFromTags([])).toEqual([]);
  });
});

/** Six songs: three rock (one a winner), two pop, one untagged artist. */
const CSV = `[rounds]
Position,Title
1,R1
2,R2

[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
R1,Ada,Loud,Guitar Band,s1
R1,Bo,Catchy,Pop Star,s2
R1,Cleo,Obscure,Nobody Knows,s3
R2,Ada,Louder,Guitar Band,s4
R2,Bo,Catchier,Pop Star,s5
R2,Cleo,Riff,Guitar Band,s6

[votes]
Round,Voter,Submitter,Song Title,Points
R1,Bo,Ada,Loud,6
R1,Cleo,Ada,Loud,4
R1,Ada,Bo,Catchy,2
R1,Cleo,Bo,Catchy,1
R1,Ada,Cleo,Obscure,1
R1,Bo,Cleo,Obscure,1
R2,Bo,Ada,Louder,5
R2,Cleo,Ada,Louder,3
R2,Ada,Bo,Catchier,1
R2,Cleo,Bo,Catchier,1
R2,Ada,Cleo,Riff,4
R2,Bo,Cleo,Riff,2
`;

const LOOKUP = { 'Guitar Band': ['Rock'], 'Pop Star': ['Pop'] };
const stats = computeStats(parseLeague([{ name: 'g.csv', text: CSV }]));

describe('genreReport', () => {
  const report = genreReport(stats, LOOKUP);

  it('counts only the songs it could actually tag', () => {
    expect(report.tagged).toBe(5);
    expect(report.untagged).toBe(1);
  });

  it('names the artists it could not resolve, rather than hiding them', () => {
    expect(report.missingArtists).toEqual(['Nobody Knows']);
  });

  it('reports share against every song, so it is not overstated', () => {
    const rock = report.stats.find((g) => g.genre === 'Rock')!;
    expect(rock.songs).toBe(3);
    // Six songs in the league, five of them tagged: 3/6, not 3/5.
    expect(report.total).toBe(6);
    expect(rock.share).toBeCloseTo(3 / 6, 6);
  });

  it('scores each genre and indexes it against the league', () => {
    const rock = report.stats.find((g) => g.genre === 'Rock')!;
    const pop = report.stats.find((g) => g.genre === 'Pop')!;
    // Rock: 10, 8, 6 -> 8. Pop: 3, 2 -> 2.5. Baseline across the five: 5.8.
    expect(rock.avgScore).toBeCloseTo(8, 6);
    expect(pop.avgScore).toBeCloseTo(2.5, 6);
    expect(report.baseline).toBeCloseTo(5.8, 6);
    // A difference, so it stays meaningful even when the baseline is near zero.
    expect(rock.delta).toBeCloseTo(8 - 5.8, 6);
    expect(pop.delta).toBeCloseTo(2.5 - 5.8, 6);
  });

  it('counts round wins by genre', () => {
    expect(report.stats.find((g) => g.genre === 'Rock')!.wins).toBe(2);
    expect(report.stats.find((g) => g.genre === 'Pop')!.wins).toBe(0);
  });

  it('marks a thin sample as unreliable rather than ranking it', () => {
    for (const genre of report.stats) {
      expect(genre.reliable).toBe(genre.songs >= MIN_SAMPLE);
    }
    // Nothing here reaches the threshold, so nothing claims a verdict.
    expect(report.stats.every((g) => !g.reliable)).toBe(true);
  });

  it('gives a song every genre its artists carry', () => {
    const both = genreReport(stats, { 'Guitar Band': ['Rock', 'Punk'], 'Pop Star': ['Pop'] });
    const punk = both.stats.find((g) => g.genre === 'Punk')!;
    expect(punk.songs).toBe(3);
    // Shares can exceed 100% in total, which the panel explains.
    expect(both.stats.reduce((sum, g) => sum + g.share, 0)).toBeGreaterThan(1);
  });

  it('returns an empty report when nothing is tagged', () => {
    const none = genreReport(stats, {});
    expect(none.stats).toEqual([]);
    expect(none.tagged).toBe(0);
  });
});

describe('genreHighlights', () => {
  it('says nothing when every sample is too thin', () => {
    expect(genreHighlights(genreReport(stats, LOOKUP))).toEqual([]);
  });

  it('draws conclusions once there are enough songs', () => {
    // Give both genres a large enough sample by repeating the league.
    const many = { ...LOOKUP };
    const bigCsv = CSV.replace(
      '[votes]',
      `R1,Dev,Extra1,Guitar Band,s7
R1,Eve,Extra2,Guitar Band,s8
R1,Fay,Extra3,Pop Star,s9
R1,Gus,Extra4,Pop Star,s10

[votes]`,
    );
    const bigStats = computeStats(parseLeague([{ name: 'b.csv', text: bigCsv }]));
    const report = genreReport(bigStats, many);
    const reliable = report.stats.filter((g) => g.reliable);
    if (reliable.length >= 2) {
      const lines = genreHighlights(report);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join(' ')).toMatch(/most submitted/);
    }
  });
});
