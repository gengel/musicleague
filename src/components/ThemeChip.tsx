import type { ThemeOutcome } from '../lib/theme';

/**
 * The ±3 themed-round adjustment, shown as a signed chip with its reason.
 *
 * The sign and the number are always rendered as text, not conveyed by colour
 * alone, so the chip is legible without colour vision. The reason travels with
 * the chip rather than hiding in a tooltip, because this bonus is applied by
 * the page and not by Music League — a reader must be able to see why.
 */
export function ThemeChip({
  points,
  reason,
  compact,
}: {
  points: number;
  reason?: string;
  compact?: boolean;
}) {
  if (!points) return <span className="dim">—</span>;
  const sign = points > 0 ? '+' : '−';
  const cls = points > 0 ? 'theme-chip theme-chip--win' : 'theme-chip theme-chip--lose';
  return (
    <span className={cls} title={reason}>
      <span className="theme-chip__val">
        {sign}
        {Math.abs(points)}
      </span>
      {!compact && <span className="theme-chip__tag">theme</span>}
    </span>
  );
}

/**
 * A banner naming the round's theme player and how the bonus fell out.
 * Shown at the top of a round view. Spells out that the round ranking below
 * is as voted and the bonus lands on the season total, so the two never look
 * as though they disagree.
 */
export function ThemeBanner({ outcome, themeName }: { outcome?: ThemeOutcome; themeName?: string }) {
  if (!outcome) {
    if (!themeName) return null;
    return (
      <p className="theme-banner">
        <strong>Theme: {themeName}.</strong> This round has not finished, so no theme bonus has
        been decided yet.
      </p>
    );
  }
  const verb =
    outcome.outcome === 'won'
      ? 'won their own round'
      : outcome.outcome === 'skipped'
        ? 'submitted nothing to their own round'
        : 'did not win their own round';
  return (
    <p className={`theme-banner theme-banner--${outcome.outcome}`}>
      <strong>Theme: {outcome.playerName}.</strong> {outcome.playerName} {verb}, so{' '}
      <ThemeChip points={outcome.points} reason={outcome.reason} compact /> on the season total.{' '}
      <span className="dim">
        The round ranking below is as the room voted; the bonus applies to the standings.
      </span>
    </p>
  );
}
