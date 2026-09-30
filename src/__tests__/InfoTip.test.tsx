// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InfoTip, MethodDrawer } from '../components/InfoTip';

afterEach(cleanup);

describe('InfoTip', () => {
  it('is closed until activated, and toggles on click', async () => {
    const user = userEvent.setup();
    render(<InfoTip label="How X">the method</InfoTip>);
    const btn = screen.getByRole('button', { name: 'How X' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('tooltip')).toBeNull();

    await user.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('tooltip').textContent).toContain('the method');

    await user.click(btn);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens on activation and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<InfoTip>detail</InfoTip>);
    const btn = screen.getByRole('button');
    await user.click(btn);
    expect(screen.getByRole('tooltip')).toBeDefined();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('wires aria-controls to the popover id', async () => {
    const user = userEvent.setup();
    render(<InfoTip>detail</InfoTip>);
    const btn = screen.getByRole('button');
    await user.click(btn);
    expect(btn.getAttribute('aria-controls')).toBe(screen.getByRole('tooltip').id);
  });
});

describe('MethodDrawer', () => {
  it('renders collapsed content behind a summary', () => {
    render(<MethodDrawer>the workings</MethodDrawer>);
    expect(screen.getByText('How this is worked out')).toBeDefined();
    expect(screen.getByText('the workings')).toBeDefined();
    expect((document.querySelector('details') as HTMLDetailsElement)?.open).toBe(false);
  });
});
