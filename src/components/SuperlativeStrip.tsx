import type { Stats } from '../lib/stats';
import { LabelIcon } from './Icons';

/**
 * A horizontal strip of up to four superlative cards, each looked up from
 * `stats.superlatives` by label. Missing labels are silently omitted so the
 * strip degrades when optional data (obscurity, covering) is absent (I6).
 * Pass fewer than 4 to leave trailing slots empty.
 */
export function SuperlativeStrip({ stats, labels }: { stats: Stats; labels: string[] }) {
  const byLabel = new Map(stats.superlatives.map((s) => [s.label, s]));
  const cards = labels.map((l) => byLabel.get(l)).filter(Boolean);
  if (!cards.length) return null;

  return (
    <div className="sup-strip">
      {cards.map((s) => (
        <article className="sup" key={s!.label}>
          <header className="sup__head">
            <span className="sup__icon">
              <LabelIcon label={s!.label} size={14} />
            </span>
            <span className="sup__label">{s!.label}</span>
          </header>
          <strong className="sup__value">{s!.value}</strong>
          {s!.subject && <p className="sup__subject">{s!.subject}</p>}
          {s!.meta && s!.meta.length > 0 && (
            <p className="sup__meta">{s!.meta.join(' · ')}</p>
          )}
          {s!.runnersUp && s!.runnersUp.length > 0 && (
            <p className="sup__runners">
              {s!.runnersUp.map((r) => `${r.value}${r.subject ? ` ${r.subject}` : ''}`).join(' · ')}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
