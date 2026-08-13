// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TimelineTooltip } from '../components/ScoreTimeline';

afterEach(cleanup);

/**
 * Recharts hands the payload over in series-key order, which comes out
 * alphabetical. These payloads are deliberately alphabetical so the component
 * has to do the reordering itself.
 */
const payload = [
  { name: 'Ada', value: 12, color: '#f00' },
  { name: 'Bo', value: 30, color: '#0f0' },
  { name: 'Cleo', value: 21, color: '#00f' },
];

const rankOrder = new Map([
  ['Bo', 0],
  ['Cleo', 1],
  ['Ada', 2],
]);

const names = () => [...document.querySelectorAll('.tip__name')].map((el) => el.textContent);
const values = () => [...document.querySelectorAll('.tip__value')].map((el) => el.textContent);

describe('TimelineTooltip', () => {
  it('lists players in final-standings order, not alphabetically', () => {
    render(
      <TimelineTooltip
        active
        payload={payload}
        label={3}
        mode="cumulative"
        rankOrder={rankOrder}
        roundNameOf={() => 'Guilty pleasures'}
      />,
    );
    expect(names()).toEqual(['Bo', 'Cleo', 'Ada']);
    expect(values()).toEqual(['30 pts', '21 pts', '12 pts']);
  });

  it('names the round alongside its number', () => {
    render(
      <TimelineTooltip
        active
        payload={payload}
        label={3}
        mode="cumulative"
        rankOrder={rankOrder}
        roundNameOf={() => 'Guilty pleasures'}
      />,
    );
    expect(document.querySelector('.tip__head')!.textContent).toBe('Round 3 — Guilty pleasures');
  });

  it('falls back to the round number when the name is unknown', () => {
    render(
      <TimelineTooltip
        active
        payload={payload}
        label={9}
        mode="cumulative"
        rankOrder={rankOrder}
        roundNameOf={() => undefined}
      />,
    );
    expect(document.querySelector('.tip__head')!.textContent).toBe('Round 9');
  });

  it('formats league position as a place rather than points', () => {
    render(
      <TimelineTooltip
        active
        payload={[{ name: 'Bo', value: 1, color: '#0f0' }]}
        label={1}
        mode="rank"
        rankOrder={rankOrder}
        roundNameOf={() => 'R1'}
      />,
    );
    expect(values()).toEqual(['#1']);
  });

  it('renders nothing when inactive or empty', () => {
    const { container } = render(
      <TimelineTooltip
        payload={payload}
        label={1}
        mode="cumulative"
        rankOrder={rankOrder}
        roundNameOf={() => undefined}
      />,
    );
    expect(container.innerHTML).toBe('');

    const empty = render(
      <TimelineTooltip
        active
        payload={[]}
        label={1}
        mode="cumulative"
        rankOrder={rankOrder}
        roundNameOf={() => undefined}
      />,
    );
    expect(empty.container.innerHTML).toBe('');
  });

  it('puts a player missing from the ranking last rather than first', () => {
    render(
      <TimelineTooltip
        active
        payload={[{ name: 'Ghost', value: 0, color: '#888' }, ...payload]}
        label={1}
        mode="cumulative"
        rankOrder={rankOrder}
        roundNameOf={() => undefined}
      />,
    );
    expect(names()).toEqual(['Bo', 'Cleo', 'Ada', 'Ghost']);
  });
});
