// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, within } from '@testing-library/react';
import { parseLeague } from '../lib/parse';
import { computeStats } from '../lib/stats';
import { buildDemoCsv } from '../lib/demo';
import { RacePredictionPanel } from '../components/RacePredictionPanel';

afterEach(cleanup);

// The demo league is a finished season. Telling computeStats the season runs
// longer than the rounds it contains makes it in-progress, so the projection
// (and its explanations) render.
function statsInProgress(scoring: 'competitive' | 'friendly') {
  return computeStats(parseLeague([{ name: 'demo.csv', text: buildDemoCsv() }]), {
    scoring,
    flooring: 'none',
    totalRounds: 30,
  });
}

describe('RacePredictionPanel (the title race)', () => {
  it('shows a win-% bar chart and named win-probability bands', () => {
    const { container } = render(<RacePredictionPanel stats={statsInProgress('competitive')} />);
    // The bar chart: a labelled fill per contender.
    expect(container.querySelectorAll('.race-forecast__fill').length).toBeGreaterThan(0);
    // The named bands beneath.
    expect(container.querySelectorAll('.band').length).toBeGreaterThan(0);
  });

  it('explains the projected range', () => {
    const { container } = render(<RacePredictionPanel stats={statsInProgress('competitive')} />);
    const tips = within(container).getAllByRole('button', { name: /projected range/i });
    expect(tips.length).toBe(1);
  });

  it('spells out the method, including the resampling, the maths and the fixed seed', () => {
    const { container } = render(<RacePredictionPanel stats={statsInProgress('competitive')} />);

    expect(within(container).getByText(/from how the league has actually voted/i)).toBeDefined();

    // MethodDrawer keeps its body in the DOM while collapsed, so the content is
    // assertable without a click (native <details> toggling is unreliable in jsdom).
    expect(within(container).getByText('How the simulation works')).toBeDefined();
    const body = container.querySelector('.method__body') as HTMLElement;
    expect(body.textContent).toMatch(/every real ballot/i);
    expect(body.textContent).toMatch(/fixed random seed/i);
    // The maths behind the certainty bands is spelled out.
    expect(body.textContent).toMatch(/clinched/i);
    // Competitive league, so the forfeit paragraph is included.
    expect(body.textContent).toMatch(/forfeit/i);
  });

  it('drops the forfeit paragraph for a friendly league', () => {
    const { container } = render(<RacePredictionPanel stats={statsInProgress('friendly')} />);
    const body = container.querySelector('.method__body') as HTMLElement;
    expect(body.textContent).not.toMatch(/forfeit/i);
  });
});
