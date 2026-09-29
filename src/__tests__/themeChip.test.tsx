// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ThemeChip, ThemeBanner } from '../components/ThemeChip';
import type { ThemeOutcome } from '../lib/theme';

afterEach(cleanup);

const won: ThemeOutcome = {
  roundId: 'r1',
  roundSequence: 1,
  roundName: 'All About Bob',
  playerId: 'bob',
  playerName: 'Bob',
  outcome: 'won',
  points: 3,
  reason: 'Won their own round, All About Bob (14 pts, 1st of 12)',
  score: 14,
  rank: 1,
};

describe('ThemeChip', () => {
  it('shows a signed value, not colour alone', () => {
    const { container } = render(<ThemeChip points={3} reason="won" />);
    expect(container.textContent).toContain('+3');
    expect(container.textContent).toContain('theme');
  });

  it('renders a minus for a penalty', () => {
    const { container } = render(<ThemeChip points={-3} reason="lost" />);
    expect(container.textContent).toContain('−3');
  });

  it('shows a dash for no bonus', () => {
    const { container } = render(<ThemeChip points={0} />);
    expect(container.textContent).toBe('—');
  });

  it('carries the reason as a title', () => {
    const { container } = render(<ThemeChip points={3} reason="because" />);
    expect(container.querySelector('.theme-chip')?.getAttribute('title')).toBe('because');
  });
});

describe('ThemeBanner', () => {
  it('states the winner, the bonus and the reason, and that ranking is as voted', () => {
    render(<ThemeBanner outcome={won} />);
    expect(screen.getByText(/Theme: Bob/)).toBeTruthy();
    // The reason text is present (visible, not only a tooltip).
    expect(document.body.textContent).toContain('won their own round');
    expect(document.body.textContent).toContain('+3');
    expect(document.body.textContent).toContain('as the room voted');
  });

  it('handles a round that has not finished', () => {
    render(<ThemeBanner themeName="Cleo" />);
    expect(document.body.textContent).toContain('Theme: Cleo');
    expect(document.body.textContent).toContain('not finished');
  });

  it('renders nothing without a theme', () => {
    const { container } = render(<ThemeBanner />);
    expect(container.firstChild).toBeNull();
  });
});
