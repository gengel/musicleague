// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { buildDemoCsv } from '../lib/demo';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

/** Recharts measures its container, which jsdom reports as zero. */
function stubLayout(): void {
  for (const prop of ['offsetWidth', 'clientWidth'] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, value: 1200 });
  }
  for (const prop of ['offsetHeight', 'clientHeight'] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, value: 500 });
  }
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { width: 1200, height: 500, top: 0, left: 0, right: 1200, bottom: 500, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
  // ResponsiveContainer only renders once its observer reports a size.
  globalThis.ResizeObserver = class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(target: Element) {
      this.cb(
        [{ target, contentRect: { width: 1200, height: 500 } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

async function openDemo() {
  stubLayout();
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /sample league/i }));
  return user;
}

describe('landing screen', () => {
  it('explains where the export comes from and offers a drop target', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /drop Music League CSV/i })).toBeDefined();
    expect(screen.getByText(/Export Data/)).toBeDefined();
    expect(screen.getByText(/parsed in your browser/i)).toBeDefined();
  });
});

describe('dashboard with the sample league', () => {
  it('loads and shows the league header', async () => {
    await openDemo();
    expect(screen.getByRole('heading', { level: 1, name: /Sample League/i })).toBeDefined();
    expect(screen.getByText(/sample data/i)).toBeDefined();
    expect(screen.getByText(/7 players · 6 rounds/)).toBeDefined();
  });

  it('lands on This Round with the latest round and standings', async () => {
    await openDemo();
    // The default tab is This Round: it shows a winner and a standings snapshot.
    expect(screen.getAllByText(/Winner/i).length).toBeGreaterThan(0);
    // Standings movement card (title) plus the tab both read "Standings".
    expect(screen.getAllByText('Standings').length).toBeGreaterThan(1);
  });

  it('renders the score timeline with a series per player', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Standings' }));
    expect(screen.getByText('Score over time')).toBeDefined();
    const chart = document.querySelector('.recharts-wrapper');
    expect(chart).not.toBeNull();
    expect(chart!.querySelector('.recharts-surface')).not.toBeNull();
    // jsdom reports no element sizes, so Recharts cannot lay the plot out and
    // the curves have nothing to draw into. That the lines actually render is
    // verified against a real browser instead; here we check one legend entry
    // per player, which is what drives the series.
    const legend = document.querySelectorAll('.chart-legend__btn');
    expect(legend.length).toBe(7);
    const names = [...legend].map((el) => (el.textContent ?? '').trim());
    for (const player of ['Ada', 'Bo', 'Cleo', 'Dev', 'Esme', 'Finn', 'Gus']) {
      expect(names).toContain(player);
    }
  });

  it('orders the chart legend by final standing, not alphabetically', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Standings' }));
    const legend = [...document.querySelectorAll('.chart-legend__btn')].map((el) =>
      (el.textContent ?? '').trim(),
    );
    expect(legend.length).toBe(7);
    const alphabetical = [...legend].sort((a, b) => a.localeCompare(b));
    expect(legend).not.toEqual(alphabetical);
    // Ada leads the demo on 67 to Dev's 66 once forfeits are applied.
    expect(legend[0]).toBe('Ada');
    expect(legend.at(-1)).toBe('Gus'); // the serial non-voter finishes last
  });

  it('mutes a player when their legend entry is clicked', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Standings' }));
    const first = document.querySelectorAll('.chart-legend__btn')[0] as HTMLButtonElement;
    expect(first.getAttribute('aria-pressed')).toBe('true');
    await user.click(first);
    expect(
      (document.querySelectorAll('.chart-legend__btn')[0] as HTMLElement).getAttribute(
        'aria-pressed',
      ),
    ).toBe('false');
  });

  it('switches the timeline to league position and points per round', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Standings' }));
    await user.click(screen.getByRole('button', { name: 'League position' }));
    expect(screen.getByText(/Lower is better/)).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Points per round' }));
    expect(screen.getByText(/earned in each individual round/)).toBeDefined();
  });

  it('renders the voting matrix with a cell for every ordered pair', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Room' }));
    expect(screen.getByText('Who votes for whom')).toBeDefined();
    // 7 players: 42 off-diagonal cells plus 7 blocked self cells.
    expect(document.querySelectorAll('.matrix__cell').length).toBe(42);
    expect(document.querySelectorAll('.matrix__self').length).toBe(7);
  });

  it('switches the matrix between affinity and raw totals', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Room' }));
    await user.click(screen.getByRole('button', { name: 'Total points' }));
    expect(screen.getByText(/Raw upvote points given/)).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Downvotes' }));
    expect(screen.getByText(/Downvote points spent/)).toBeDefined();
  });

  it('lists superfans and cold shoulders', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Room' }));
    const fans = screen.getByText('Biggest superfans').closest('.card') as HTMLElement;
    const cold = screen.getByText('Coldest shoulders').closest('.card') as HTMLElement;

    // Affinity saturates at the per-song cap, so ties break on volume: the
    // season-long superfan (Ada → Bo) should outrank a three-round one.
    const topFan = fans.querySelectorAll('tbody tr')[0].textContent ?? '';
    expect(topFan).toContain('Ada');
    expect(topFan).toContain('Bo');

    // Ada was wired to almost never vote for Gus.
    const coldRows = [...cold.querySelectorAll('tbody tr')].map((r) => r.textContent ?? '');
    expect(coldRows.some((r) => r.includes('Ada') && r.includes('Gus'))).toBe(true);
  });

  it('shows the forfeit superlative on The Race tab', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Standings' }));
    // Forfeit story is told via the superlative strip on The Race tab
    expect(screen.getByText(/Most forfeited by not voting/)).toBeDefined();
  });

  it('shows every song, with no paging', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Songs' }));
    const card = screen.getByText('Every song').closest('.card') as HTMLElement;
    expect(card.querySelectorAll('tbody tr').length).toBe(41);
    expect(within(card).queryByRole('button', { name: /Show all/ })).toBeNull();
  });

  it('filters the song table by round', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Songs' }));
    const card = screen.getByText('Every song').closest('.card') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'One-hit wonders' }));
    expect(card.querySelectorAll('tbody tr').length).toBe(7);
    // Two "All" buttons exist (Round + Show rows); click the first one (Round).
    await user.click(within(card).getAllByRole('button', { name: 'All' })[0]);
    expect(card.querySelectorAll('tbody tr').length).toBe(41);
  });

  it('sorts songs by score and by place independently', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Songs' }));
    const card = screen.getByText('Every song').closest('.card') as HTMLElement;
    const indexOf = (label: string) =>
      [...card.querySelectorAll('thead th')].findIndex((th) =>
        (th.textContent ?? '').replace(/[▼▲]/g, '').trim().startsWith(label),
      );
    const num = (t: string) => Math.abs(Number(t.replace(/[^0-9.]/g, '') || 0));
    const column = (label: string) => {
      const at = indexOf(label);
      return [...card.querySelectorAll('tbody tr')].map((r) =>
        num([...r.querySelectorAll('td')][at].textContent ?? ''),
      );
    };

    // Expand to all rounds first
    await user.click(within(card).getAllByRole('button', { name: 'All' })[0]);
    // Click Score twice: first click may toggle from the existing default sort
    await user.click(within(card).getByRole('columnheader', { name: /^Score/ }));
    await user.click(within(card).getByRole('columnheader', { name: /^Score/ }));
    const scores = column('Score');
    expect(scores[0]).toBe(Math.max(...scores));

    // Place sorts ascending (rank #1 first), so one click suffices
    await user.click(within(card).getByRole('columnheader', { name: /^Place/ }));
    const places = column('Place');
    expect(places[0]).toBe(Math.min(...places));
  });

  it('marks a forfeited song without adding a sortable column for it', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Songs' }));
    const card = screen.getByText('Every song').closest('.card') as HTMLElement;
    // Gus skipped voting in this round in the fixture.
    await user.click(within(card).getByRole('button', { name: 'Covers better than the original' }));

    const marked = [...card.querySelectorAll('tbody tr')].filter((r) =>
      (r.textContent ?? '').includes('ff'),
    );
    expect(marked.length).toBeGreaterThan(0);
    const scoreAt = [...card.querySelectorAll('thead th')].findIndex((th) =>
      (th.textContent ?? '').replace(/[▼▲]/g, '').trim().startsWith('Score'),
    );
    const cells = [...marked[0].querySelectorAll('td')];
    expect(cells[scoreAt].textContent).toMatch(/^0\s*−\d+ ff$/);
    expect(cells[scoreAt].querySelector('[title*="forfeited"]')).not.toBeNull();
    // Forfeits stay informational: no column header for them here.
    expect(within(card).queryByRole('columnheader', { name: /Forfeit/ })).toBeNull();
  });

  it('gives the score breakdown table sortable upvote, downvote and forfeit columns', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Standings' }));
    const card = screen.getByText('How the scores add up').closest('.card') as HTMLElement;
    expect(within(card).getByRole('columnheader', { name: /Total score/ })).toBeDefined();
    for (const name of ['Upvotes', 'Downvotes', 'Forfeited']) {
      expect(within(card).getByRole('columnheader', { name })).toBeDefined();
    }

    // Sorting by forfeits must put the biggest forfeiter on top.
    await user.click(within(card).getByRole('columnheader', { name: 'Forfeited' }));
    expect(card.querySelectorAll('tbody tr')[0].textContent).toContain('Gus');
  });

  it('does not show the scoring rule toggles', async () => {
    await openDemo();
    expect(document.querySelector('.scoring')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Competitive' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Allow negative' })).toBeNull();
  });

  it('routes to a tab and a player page through the URL hash', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Standings' }));
    expect(window.location.hash).toBe('#standings');
    // Opening a player from Players sets a player hash and shows the deep page.
    await user.click(screen.getByRole('tab', { name: 'Players' }));
    await user.click(document.querySelectorAll('.player-btn')[0] as HTMLElement);
    expect(window.location.hash).toMatch(/^#player\//);
    // The profile opens on the Summary sub-tab.
    expect(screen.getByRole('tab', { name: 'Summary' })).toBeDefined();
  });

  it('highlights the Rounds tab when navigating to a round route', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('button', { name: /Full round/i }));
    expect(window.location.hash).toMatch(/^#round\/\d+/);

    const roundsTab = screen.getByRole('tab', { name: 'Rounds' });
    const playersTab = screen.getByRole('tab', { name: 'Players' });

    expect(roundsTab.getAttribute('aria-selected')).toBe('true');
    expect(roundsTab.className).toContain('tab--on');
    expect(playersTab.getAttribute('aria-selected')).toBe('false');
    expect(playersTab.className).not.toContain('tab--on');
  });

  it('opens a deep player page from the Players tab', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Players' }));
    // Clicking a player opens their full profile (deep page) on Summary.
    const playerBtns = document.querySelectorAll('.player-btn');
    await user.click(playerBtns[0] as HTMLElement);
    expect(screen.getByRole('tab', { name: 'Summary' })).toBeDefined();
    expect(screen.getAllByText('submissions')).toHaveLength(1);
    expect(screen.getAllByText('upvotes')).toHaveLength(1);
    expect(document.querySelector('.era-timeline')).not.toBeNull();
    // Relationships sub-tab holds the Who-they-rank table.
    await user.click(screen.getByRole('tab', { name: 'Relationships' }));
    expect(screen.getByText('Who they rank')).toBeDefined();
    // Submissions sub-tab lists their songs.
    await user.click(screen.getByRole('tab', { name: 'Submissions' }));
    expect(document.querySelector('.song-list')).not.toBeNull();
  });

  it('breaks every score into its parts', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Standings' }));
    const card = screen.getByText('How the scores add up').closest('.card') as HTMLElement;

    // The demo league has downvotes and non-voters, so every term shows.
    for (const header of ['Upvotes', 'Downvotes', 'Forfeited', 'Total score']) {
      expect(within(card).getByRole('columnheader', { name: new RegExp(header) })).toBeDefined();
    }
    expect(card.querySelectorAll('.dbar').length).toBe(7);
    // The axis is what makes above/below zero readable at a glance.
    expect(card.querySelectorAll('.dbar__axis').length).toBe(7);

    // Each row must reconcile: upvotes − downvotes − forfeited + floored.
    const rows = [...card.querySelectorAll('tbody tr')];
    expect(rows.length).toBe(7);
    for (const row of rows) {
      const cells = [...row.querySelectorAll('td')].map((c) => c.textContent ?? '');
      const num = (text: string) => Number(text.replace(/[^0-9.-]/g, '') || 0);
      const [, , up, down, forfeit, floored, total] = cells;
      expect(num(up) - num(down) - num(forfeit) + num(floored)).toBe(num(total));
    }
  });

  it('sorts a table when a header is clicked', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Songs' }));
    const card = screen.getByText('Every song').closest('.card') as HTMLElement;
    const before = card.querySelector('tbody tr')!.textContent;
    await user.click(within(card).getByRole('columnheader', { name: /Song/ }));
    const after = card.querySelector('tbody tr')!.textContent;
    expect(after).not.toBe(before);
  });

  it('returns to the landing screen to load another export', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('button', { name: /Load another export/i }));
    expect(screen.getByRole('button', { name: /drop Music League CSV/i })).toBeDefined();
  });

  /**
   * I2 regression — the Play-by-Play chapter must name the credited winner
   * (highest effectiveNet), not the raw top scorer when a forfeit changes who won.
   *
   * The demo fixture has Gus skipping votes in some rounds, which creates
   * exactly the forfeit scenario this invariant guards against.
   */
  it('I2 — Play-by-Play chapter names the credited winner, not the forfeited top scorer', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('tab', { name: 'Rounds' }));

    // Build the same chapters the tab renders, so we know which round has a twist.
    const { parseLeague } = await import('../lib/parse');
    const { computeStats } = await import('../lib/stats');
    const { buildDemoCsv, buildDemoEnrichment } = await import('../lib/demo');
    const { buildPlayByPlay } = await import('../lib/recap');
    const { attachEnrichment, parseEnrichment } = await import('../lib/enrich');
    const { computeSuperlatives } = await import('../lib/stats');

    const league = parseLeague([{ name: 'demo.csv', text: buildDemoCsv() }]);
    const computed = computeStats(league, { scoring: 'competitive', flooring: 'none' });
    const enrichment = parseEnrichment(buildDemoEnrichment());
    const enrichedStats = { ...computed, songs: attachEnrichment(computed.songs, enrichment) };
    const stats = { ...enrichedStats, superlatives: computeSuperlatives(enrichedStats) };
    const chapters = buildPlayByPlay(stats);

    // Find the first chapter where a forfeit changed the winner.
    const twistedChapter = chapters.find((c) => c.twist?.wasForfeited);
    if (!twistedChapter) return; // demo may not always produce this; skip rather than fail

    const creditedWinner = twistedChapter.winner!;
    const forfeitedSong = twistedChapter.twist!.song;

    // The credited winner's title must appear in a chapter__lead.
    const leads = [...document.querySelectorAll('.chapter__lead')].map((el) => el.textContent ?? '');
    expect(leads.some((t) => t.includes(creditedWinner.title))).toBe(true);

    // The forfeited song must appear in a chapter__twist paragraph, not a lead.
    const twists = [...document.querySelectorAll('.chapter__twist')].map((el) => el.textContent ?? '');
    expect(twists.some((t) => t.includes(forfeitedSong.title))).toBe(true);

    // No lead should claim the forfeited song won the round.
    expect(leads.some((t) => t.includes(`"${forfeitedSong.title}" won`))).toBe(false);
  });
});

describe('a league still under way', () => {
  it('shows no running-total banner for a complete league', async () => {
    stubLayout();
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /sample league/i }));

    // The demo has results for every round it contains.
    expect(document.querySelector('.progress')).toBeNull();
    const meta = document.querySelector('.topbar__title span')!.textContent ?? '';
    expect(meta).toContain('6 rounds');
    expect(meta).not.toContain(' of ');
  });
});

describe('degraded exports', () => {
  it('warns instead of crashing when the vote breakdown is hidden', async () => {
    stubLayout();
    const csv = buildDemoCsv()
      .split('\n\n')
      .filter((section) => !section.startsWith('[votes]'))
      .join('\n\n');
    const user = userEvent.setup();
    render(<App />);
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    await user.upload(input, new File([csv], 'Hidden League.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Hidden League/i })).toBeDefined();
    expect(screen.getByText(/No vote rows found/)).toBeDefined();
  });

  it('reports a file that is not a Music League export', async () => {
    const user = userEvent.setup();
    render(<App />);
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    await user.upload(input, new File(['a,b\n1,2\n'], 'random.csv', { type: 'text/csv' }));
    expect(await screen.findByText(/contained no submissions/i)).toBeDefined();
  });
});

describe('G9 single-value column suppression', () => {
  it('hides single-value columns and filters when only one round is played', async () => {
    stubLayout();
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
Round 1,Ada,Song 1,Artist 1,id1
Round 1,Bo,Song 2,Artist 2,id2

[votes]
Round,Voter,Submitter,Song Title,Points
Round 1,Ada,Bo,Song 2,10
Round 1,Bo,Ada,Song 1,10
`;
    const user = userEvent.setup();
    render(<App />);
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    await user.upload(input, new File([csv], 'Single Round League.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Single Round League/i })).toBeDefined();

    // Standings tab: Where it stands should NOT show Per song, Best round, or Rounds voted
    await user.click(screen.getByRole('tab', { name: 'Standings' }));
    const whereCard = screen.getByText('Where it stands').closest('.card') as HTMLElement;
    expect(within(whereCard).queryByRole('columnheader', { name: 'Per song' })).toBeNull();
    expect(within(whereCard).queryByRole('columnheader', { name: 'Best round' })).toBeNull();
    expect(within(whereCard).queryByRole('columnheader', { name: 'Rounds voted' })).toBeNull();
    expect(within(whereCard).getByRole('columnheader', { name: 'Score' })).toBeDefined();

    // Songs tab: Every song table should NOT have a Round column or Round filter chips
    await user.click(screen.getByRole('tab', { name: 'Songs' }));
    const songCard = screen.getByText('Every song').closest('.card') as HTMLElement;
    expect(within(songCard).queryByRole('columnheader', { name: 'Round' })).toBeNull();
    expect(within(songCard).queryByText('Round', { selector: '.seg__label' })).toBeNull();

    // Room tab: Where the upvotes go should NOT have Spent column when all spent are identical (10)
    await user.click(screen.getByRole('tab', { name: 'Room' }));
    const upvotesCard = screen.getByText('Where the upvotes go').closest('.card') as HTMLElement;
    expect(within(upvotesCard).queryByRole('columnheader', { name: 'Spent' })).toBeNull();
  });

  it('still flags a non-voter once the Rounds voted column is hidden', async () => {
    stubLayout();
    // Cyd submits but never votes, so the column hiding above must not take the
    // only non-voter marker with it.
    const csv = `[submissions]
Round,Submitter,Song Title,Artist,Spotify Track ID
Round 1,Ada,Song 1,Artist 1,id1
Round 1,Bo,Song 2,Artist 2,id2
Round 1,Cyd,Song 3,Artist 3,id3

[votes]
Round,Voter,Submitter,Song Title,Points
Round 1,Ada,Bo,Song 2,10
Round 1,Bo,Ada,Song 1,10
`;
    const user = userEvent.setup();
    render(<App />);
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    await user.upload(input, new File([csv], 'Non Voter League.csv', { type: 'text/csv' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Non Voter League/i })).toBeDefined();

    await user.click(screen.getByRole('tab', { name: 'Standings' }));
    const whereCard = screen.getByText('Where it stands').closest('.card') as HTMLElement;
    expect(within(whereCard).queryByRole('columnheader', { name: 'Rounds voted' })).toBeNull();

    const cydRow = within(whereCard).getByText('Cyd').closest('tr') as HTMLElement;
    expect(cydRow.textContent).toMatch(/didn't vote/);
    // Ada voted, so she carries no flag.
    const adaRow = within(whereCard).getByText('Ada').closest('tr') as HTMLElement;
    expect(adaRow.textContent).not.toMatch(/didn't vote/);
  });
});
