// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { buildDemoCsv } from '../lib/demo';

afterEach(cleanup);

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

  it('shows at-a-glance tiles and the superlatives wall', async () => {
    await openDemo();
    expect(screen.getByText('At a glance')).toBeDefined();
    expect(screen.getByText('Superlatives')).toBeDefined();
    for (const label of [
      'Biggest single haul',
      'Widest appeal',
      'Biggest superfan',
      'Coldest shoulder',
      'Most forfeited by not voting',
      'Arch-nemesis',
      'Biggest contrarian',
    ]) {
      expect(screen.getByRole('heading', { name: label })).toBeDefined();
    }
  });

  it('renders the score timeline with a series per player', async () => {
    await openDemo();
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
    await openDemo();
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
    await user.click(screen.getByRole('button', { name: 'League position' }));
    expect(screen.getByText(/Lower is better/)).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Points per round' }));
    expect(screen.getByText(/earned in each individual round/)).toBeDefined();
  });

  it('renders the voting matrix with a cell for every ordered pair', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('button', { name: 'Voting' }));
    expect(screen.getByText('Who votes for whom')).toBeDefined();
    // 7 players: 42 off-diagonal cells plus 7 blocked self cells.
    expect(document.querySelectorAll('.matrix__cell').length).toBe(42);
    expect(document.querySelectorAll('.matrix__self').length).toBe(7);
  });

  it('switches the matrix between affinity and raw totals', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('button', { name: 'Voting' }));
    await user.click(screen.getByRole('button', { name: 'Total points' }));
    expect(screen.getByText(/Raw upvote points given/)).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Downvotes' }));
    expect(screen.getByText(/Downvote points spent/)).toBeDefined();
  });

  it('lists superfans and cold shoulders', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('button', { name: 'Voting' }));
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

  it('reports the non-voting forfeit and names the worst offender', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('button', { name: 'Participation' }));
    expect(screen.getByText(/no point penalty for skipping a vote/)).toBeDefined();
    const card = screen.getByText('The cost of not voting').closest('.card') as HTMLElement;
    // Sorted by points forfeited, Gus skipped three rounds in the fixture.
    expect(card.querySelectorAll('tbody tr')[0].textContent).toContain('Gus');
  });

  it('shows every song, with no paging', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('button', { name: 'Songs' }));
    const card = screen.getByText('Every song').closest('.card') as HTMLElement;
    expect(card.querySelectorAll('tbody tr').length).toBe(41);
    expect(within(card).queryByRole('button', { name: /Show all/ })).toBeNull();
  });

  it('filters the song table by round', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('button', { name: 'Songs' }));
    const card = screen.getByText('Every song').closest('.card') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'One-hit wonders' }));
    expect(card.querySelectorAll('tbody tr').length).toBe(7);
    await user.click(within(card).getByRole('button', { name: 'All rounds' }));
    expect(card.querySelectorAll('tbody tr').length).toBe(41);
  });

  it('sorts songs by upvotes and by downvotes independently', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('button', { name: 'Songs' }));
    const card = screen.getByText('Every song').closest('.card') as HTMLElement;
    // Resolve columns by their header, so inserting one cannot break this.
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

    await user.click(within(card).getByRole('columnheader', { name: /Downvotes/ }));
    const down = column('Downvotes');
    expect(down[0]).toBe(Math.max(...down));

    await user.click(within(card).getByRole('columnheader', { name: /Upvotes/ }));
    const up = column('Upvotes');
    expect(up[0]).toBe(Math.max(...up));
  });

  it('marks a forfeited song without adding a sortable column for it', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('button', { name: 'Songs' }));
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

  it('gives the player table sortable upvote, downvote and forfeit columns', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('button', { name: 'Players' }));
    const card = screen.getByText('Players, end to end').closest('.card') as HTMLElement;
    expect(within(card).getByRole('columnheader', { name: /Total score/ })).toBeDefined();
    // Exact names: the table also has a "Downvotes cast" column for votes given.
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

  it('leads the first page with a few headline facts', async () => {
    await openDemo();
    const hero = document.querySelector('.headlines') as HTMLElement;
    expect(hero).not.toBeNull();
    const facts = hero.querySelectorAll('.headline');
    expect(facts.length).toBeGreaterThanOrEqual(3);
    expect(facts.length).toBeLessThanOrEqual(4);
    for (const fact of facts) {
      expect(fact.querySelector('.headline__label')!.textContent).toBeTruthy();
      expect((fact.querySelector('.headline__lead')!.textContent ?? '').length).toBeGreaterThan(15);
    }
  });

  it('shows the full player table and profile cards', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('button', { name: 'Players' }));
    expect(screen.getByText('Players, end to end')).toBeDefined();
    expect(screen.getByText('Player profiles')).toBeDefined();
    expect(document.querySelectorAll('.profile').length).toBe(7);
    expect(screen.getAllByText('Biggest fan').length).toBe(7);
  });

  it('breaks every score into its parts', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('button', { name: 'Standings' }));
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
    await user.click(screen.getByRole('button', { name: 'Players' }));
    const before = document.querySelector('tbody tr')!.textContent;
    await user.click(screen.getByRole('columnheader', { name: /Player/ }));
    const after = document.querySelector('tbody tr')!.textContent;
    expect(after).not.toBe(before);
  });

  it('shows round-by-round detail on the standings tab', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('button', { name: 'Standings' }));
    const card = screen.getByText('Round by round').closest('.card') as HTMLElement;
    expect(within(card).getByText('Songs that open with a scream')).toBeDefined();
    expect(card.querySelectorAll('tbody tr').length).toBe(6);
  });

  it('returns to the landing screen to load another export', async () => {
    const user = await openDemo();
    await user.click(screen.getByRole('button', { name: /Load another export/i }));
    expect(screen.getByRole('button', { name: /drop Music League CSV/i })).toBeDefined();
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
