import { describe, expect, it } from 'vitest';
import {
  escapeForInlineScript,
  escapeForInlineStyle,
  inlineHtml,
} from '../../scripts/inline.mjs';
import { artworkTargets, describeLeague } from '../lib/inspect';
import { buildDemoCsv } from '../lib/demo';

const HTML = `<!doctype html>
<html>
  <head>
    <script type="module" crossorigin src="/assets/index-abc123.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/style-def456.css">
  </head>
  <body><div id="root"></div></body>
</html>
`;

describe('inlineHtml', () => {
  it('replaces the script and style references with their contents', () => {
    const out = inlineHtml({
      html: HTML,
      scripts: [{ fileName: 'index-abc123.js', code: 'console.log(1)' }],
      styles: [{ fileName: 'style-def456.css', code: 'body{color:red}' }],
    });
    expect(out).toContain('<script>\nconsole.log(1)\n</script>');
    expect(out).toContain('<style>\nbody{color:red}\n</style>');
    expect(out).not.toContain('src="/assets/index-abc123.js"');
    expect(out).not.toContain('href="/assets/style-def456.css"');
  });

  it('moves the script after #root so it cannot run before its mount point', () => {
    // Vite emits a deferred module script; an inlined classic script is not
    // deferred, so left in <head> it would execute before the div exists.
    const out = inlineHtml({
      html: HTML,
      scripts: [{ fileName: 'index-abc123.js', code: 'console.log(1)' }],
      styles: [{ fileName: 'style-def456.css', code: 'body{}' }],
    });
    expect(out.indexOf('console.log(1)')).toBeGreaterThan(out.indexOf('id="root"'));
    expect(out.indexOf('console.log(1)')).toBeLessThan(out.indexOf('</body>'));
    expect(out).not.toMatch(/<head>[\s\S]*console\.log\(1\)[\s\S]*<\/head>/);
  });

  it('does not treat $ sequences in the bundle as replacement patterns', () => {
    // Minified output really does contain these; String.replace would expand
    // `$&` into the matched <script> tag and corrupt the bundle.
    const code = 'const a="$&";const b="$`";const c="$\'";const d="$$";const e="$1"';
    const out = inlineHtml({
      html: HTML,
      scripts: [{ fileName: 'index-abc123.js', code }],
      styles: [{ fileName: 'style-def456.css', code: 'a{content:"$&"}' }],
    });
    expect(out).toContain(code);
    expect(out).toContain('a{content:"$&"}');
    expect(out).not.toContain('<script type="module"');
  });

  it('breaks a closing script tag hidden inside the bundle', () => {
    const out = inlineHtml({
      html: HTML,
      scripts: [{ fileName: 'index-abc123.js', code: 'const s="</script>"' }],
      styles: [{ fileName: 'style-def456.css', code: 'body{}' }],
    });
    // Exactly one real closing tag: the one we emit.
    expect(out.match(/<\/script>/g)).toHaveLength(1);
    expect(out).toContain('<\\/script>');
  });

  it('escapes closing tags case-insensitively and with stray whitespace', () => {
    expect(escapeForInlineScript('a</SCRIPT >b')).toBe('a<\\/SCRIPT >b');
    expect(escapeForInlineScript('a</script>b')).toBe('a<\\/script>b');
    expect(escapeForInlineStyle('a</STYLE>b')).toBe('a<\\/STYLE>b');
  });

  it('throws rather than silently emitting a page with missing assets', () => {
    expect(() =>
      inlineHtml({ html: HTML, scripts: [{ fileName: 'nope.js', code: 'x' }], styles: [] }),
    ).toThrow(/Could not find a <script>/);
    expect(() => inlineHtml({ html: HTML, scripts: [], styles: [] })).toThrow(
      /Unlined assets remain/,
    );
  });
});

describe('artwork targets', () => {
  /** Real-format Spotify ids: 22 characters of base62. */
  const withIds = (count: number) => {
    const rows = Array.from({ length: count }, (_, i) => {
      const id = `2SHTKB8YYlawTGIuJ2b2${String(i).padStart(2, '0')}`;
      return `R1,P${i},Song ${i},Artist,${id}`;
    });
    return `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
${rows.join('\n')}

[votes]
Round,Voter,Submitter,Song Title,Points
${rows.map((_, i) => `R1,P${(i + 1) % count},P${i},Song ${i},${count - i}`).join('\n')}
`;
  };

  it('asks for a cover per track and the hero variant only where needed', () => {
    const targets = artworkTargets([{ name: 'x.csv', text: withIds(12) }], 3);
    expect(targets).toHaveLength(12);
    // Every track needs the table cover.
    for (const t of targets) expect(t.sizes).toContain('lg');
    // The 640px variant is ~70x the weight, so only a few get it: the top
    // three asked for, plus the round winner (already among them here).
    const hero = targets.filter((t) => t.sizes.includes('xl'));
    expect(hero.length).toBeGreaterThanOrEqual(3);
    expect(hero.length).toBeLessThanOrEqual(4);
    // Every id appears once, however many rounds it turns up in.
    expect(new Set(targets.map((t) => t.id)).size).toBe(targets.length);
  });

  it('gives the hero variant to the highest scorers', () => {
    const targets = artworkTargets([{ name: 'x.csv', text: withIds(6) }], 2);
    // Song 0 drew the most points in the fixture, so it leads.
    expect(targets[0].sizes).toContain('xl');
    expect(targets.at(-1)!.sizes).not.toContain('xl');
  });

  it('skips songs with no Spotify id rather than inventing one', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist
R1,Ada,No Id Here,Someone
`;
    expect(artworkTargets([{ name: 'x.csv', text: csv }])).toEqual([]);
  });

  it('reads ids from the classic export URI form', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify URI
R1,Ada,Song,Someone,spotify:track:2SHTKB8YYlawTGIuJ2b2ok
`;
    expect(artworkTargets([{ name: 'x.csv', text: csv }])).toEqual([
      { id: '2SHTKB8YYlawTGIuJ2b2ok', sizes: ['lg', 'xl'] },
    ]);
  });
});

describe('describeLeague', () => {
  it('summarises a valid export', () => {
    const summary = describeLeague([
      { name: 'My League.csv', text: buildDemoCsv() },
    ]);
    expect(summary.errors).toEqual([]);
    expect(summary.players).toHaveLength(7);
    expect(summary.rounds).toHaveLength(6);
    expect(summary.songs).toBe(41);
    expect(summary.voteRows).toBeGreaterThan(100);
    expect(summary.hasVotes).toBe(true);
    expect(summary.roundsWithResults).toBe(6);
    expect(summary.leagueName).toBe('My League');
  });

  it('reports an error for a file that is not an export, rather than throwing', () => {
    const summary = describeLeague([{ name: 'budget.csv', text: 'a,b\n1,2\n' }]);
    expect(summary.errors.length).toBeGreaterThan(0);
    expect(summary.errors[0]).toMatch(/No submissions found/);
  });

  it('flags an export whose vote breakdown is withheld', () => {
    const csv = `[submissions]
Round,Submitter,Song Title,Artist
R1,Ada,Song,Artist

[votes]
Round,Voter,Submitter,Song Title,Points
`;
    const summary = describeLeague([{ name: 'x.csv', text: csv }]);
    expect(summary.errors).toEqual([]);
    expect(summary.hasVotes).toBe(false);
    expect(summary.warnings.some((w) => w.includes('No vote rows'))).toBe(true);
  });
});
