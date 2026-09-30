import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * A small ⓘ button that reveals an explanatory popover.
 *
 * Opens on hover, focus or tap; closes on Esc, blur, or a click outside. The
 * meaning it carries is the "how this was worked out" detail, kept out of the
 * main flow so the numbers can breathe. Announced to assistive tech via
 * aria-expanded / aria-controls rather than a title attribute (which never
 * reaches touch or keyboard users).
 */
export function InfoTip({ label, children }: { label?: string; children: ReactNode }) {
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!pinned) return;
    const onDoc = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [pinned]);

  return (
    <span className={`infotip${pinned ? ' infotip--pinned' : ''}`} ref={root}>
      <button
        type="button"
        className="infotip__btn"
        aria-label={label ?? 'How this is worked out'}
        aria-expanded={pinned}
        aria-controls={id}
        onClick={() => setPinned((v) => !v)}
      >
        i
      </button>
      {/* Rendered always so CSS :hover can reveal it; ARIA reflects the pinned
          (click/keyboard) state, which is what non-hover users control. */}
      <span className="infotip__pop" id={id} role="tooltip" hidden={!pinned}>
        {children}
      </span>
    </span>
  );
}

/**
 * A collapsed "How this is worked out" section built on native <details>, so
 * it works without JS and is keyboard- and screen-reader-friendly for free.
 */
export function MethodDrawer({ children, summary = 'How this is worked out' }: { children: ReactNode; summary?: string }) {
  return (
    <details className="method">
      <summary className="method__summary">{summary}</summary>
      <div className="method__body dim small">{children}</div>
    </details>
  );
}
