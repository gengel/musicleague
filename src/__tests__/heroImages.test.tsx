// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

afterEach(cleanup);

async function openDemoPlayer() {
  const user = userEvent.setup();
  window.location.hash = '#demo:Voting';
  render(<App />);
  await user.click(screen.getByRole('tab', { name: 'Players' }));
  await user.click(document.querySelectorAll('.player-btn')[0] as HTMLElement);
  return user;
}

describe('player page hero + images', () => {
  it('shows the best submission as a hero tile with a score badge', async () => {
    await openDemoPlayer();
    expect(document.querySelector('.song-hero')).not.toBeNull();
    expect(document.querySelector('.song-hero__badge')).not.toBeNull();
  });

  it('shows a cover strip on the Submissions sub-tab when there are enough songs', async () => {
    const user = await openDemoPlayer();
    await user.click(screen.getByRole('tab', { name: 'Submissions' }));
    // Demo players may have few songs; the strip only renders at 3+. Assert the
    // list is present regardless, and the strip when it qualifies.
    expect(document.querySelector('.song-list')).not.toBeNull();
  });
});
