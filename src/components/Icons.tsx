import type { ReactElement } from 'react';

/**
 * Inline icons for the headline cards.
 *
 * Drawn as SVG paths rather than pulled from an icon font or CDN, so the
 * published page still fetches nothing. All are decorative: the label beside
 * them carries the meaning, so they are hidden from assistive tech.
 */

const paths: Record<string, ReactElement> = {
  trophy: (
    <>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1a4 4 0 0 0 3 3.9M17 6h3v1a4 4 0 0 1-3 3.9" />
      <path d="M12 13v4M9 20h6M10 17h4" />
    </>
  ),
  crown: (
    <>
      <path d="M3 8l3.5 3L12 5l5.5 6L21 8l-2 10H5L3 8Z" />
      <path d="M5 18h14" />
    </>
  ),
  star: <path d="M12 4l2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8L12 4Z" />,
  heart: <path d="M12 20s-7-4.4-7-9.3A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 7 2.7C19 15.6 12 20 12 20Z" />,
  heartBreak: (
    <>
      <path d="M12 20s-7-4.4-7-9.3A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 7 2.7C19 15.6 12 20 12 20Z" />
      <path d="M12 8l-2 3.5 3 1.5-1.5 3" />
    </>
  ),
  handshake: (
    <>
      <path d="M3 12l4-4 3 3 3-3 3 3 4-4" />
      <path d="M7 8v5a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V8" />
      <path d="M10 16v3M14 16v3" />
    </>
  ),
  snowflake: (
    <>
      <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />
      <path d="M9 5l3 2 3-2M9 19l3-2 3 2" />
    </>
  ),
  thumbsDown: (
    <>
      <path d="M7 4h9a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-3l-1.5 5a2 2 0 0 1-2.5-2l.5-3H7" />
      <path d="M4 4h3v10H4z" />
    </>
  ),
  swords: (
    <>
      <path d="M4 4l9 9M20 4l-9 9" />
      <path d="M4 4v3l3 3M20 4v3l-3 3" />
      <path d="M9 16l-4 4M15 16l4 4" />
    </>
  ),
  mute: (
    <>
      <path d="M5 10v4h3l4 3V7L8 10H5Z" />
      <path d="M16 9l5 6M21 9l-5 6" />
    </>
  ),
  explosion: (
    <>
      <path d="M12 3l1.8 4L18 5l-1 4.4 4 1.6-3.6 2.5L20 18l-4.5-1L14 21l-2-3.6L9 21l-1.2-4L3 18l2.6-4.5L2 11l4-1.6L5 5l4.2 2L12 3Z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 6.5a3 3 0 0 1 0 5.8M18 20a6 6 0 0 0-3-5.2" />
    </>
  ),
  split: (
    <>
      <path d="M12 4v6" />
      <path d="M12 10L6 16M12 10l6 6" />
      <path d="M4 20h4M16 20h4" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  trendUp: (
    <>
      <path d="M4 17l6-6 4 4 6-7" />
      <path d="M20 8h-4M20 8v4" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M15 9l-2 5-4 1 2-5 4-1Z" />
    </>
  ),
  layers: (
    <>
      <path d="M12 4l8 4-8 4-8-4 8-4Z" />
      <path d="M4 12l8 4 8-4M4 16l8 4 8-4" />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" />
    </>
  ),
  hourglass: (
    <>
      <path d="M7 3h10M7 21h10" />
      <path d="M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" />
    </>
  ),
  calendarX: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
      <path d="M10 14l4 4M14 14l-4 4" />
    </>
  ),
  ghost: (
    <>
      <path d="M5 20V11a7 7 0 0 1 14 0v9l-2.3-2-2.4 2-2.3-2-2.4 2L7 18l-2 2Z" />
      <path d="M10 10h.01M14 10h.01" />
    </>
  ),
  message: (
    <>
      <path d="M4 5h16v11H9l-5 4V5Z" />
      <path d="M8 9h8M8 12h5" />
    </>
  ),
  magnet: (
    <>
      <path d="M6 4v8a6 6 0 0 0 12 0V4" />
      <path d="M6 9h4M14 9h4" />
    </>
  ),
  gift: (
    <>
      <rect x="4" y="9" width="16" height="11" rx="1" />
      <path d="M4 13h16M12 9v11" />
      <path d="M9 9a2.5 2.5 0 1 1 3-3 2.5 2.5 0 1 1 3 3" />
    </>
  ),
  tag: (
    <>
      <path d="M4 10.5V5a1 1 0 0 1 1-1h5.5L20 13.5 13.5 20 4 10.5Z" />
      <circle cx="8" cy="8" r="1.2" />
    </>
  ),
  disc: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  play: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5l6 3.5-6 3.5v-7Z" />
    </>
  ),
  spotify: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M7.5 9.5c3-.8 6.2-.5 8.8 1M8.2 12.6c2.4-.6 5-.4 7.1.9M8.9 15.6c1.9-.5 3.9-.3 5.6.7" />
    </>
  ),
  youtube: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M11 10l4 2-4 2v-4Z" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3v5M12 16v5M3 12h5M16 12h5" />
      <path d="M6 6l3 3M18 6l-3 3M6 18l3-3M18 18l-3-3" />
    </>
  ),
};

/**
 * Chooses an icon from words in the label, so a new superlative gets something
 * sensible without a matching entry having to be added here.
 */
const RULES: [RegExp, keyof typeof paths][] = [
  [/never counted|nobody got credit|forfeit/i, 'ghost'],
  [/silence|skipped|not voting/i, 'mute'],
  [/destruction|assured/i, 'explosion'],
  [/runaway|winner|leader/i, 'crown'],
  [/mutual|admiration/i, 'handshake'],
  [/unrequited/i, 'heartBreak'],
  [/superfan|ride or die/i, 'heart'],
  [/cold|frozen|grudge|shoulder/i, 'snowflake'],
  [/nemesis/i, 'swords'],
  [/downvoted|hated/i, 'thumbsDown'],
  [/divisive|polarizing/i, 'split'],
  [/appeal|support base|widest/i, 'users'],
  [/narrowest|concentrat/i, 'target'],
  [/^genre$/i, 'tag'],
  [/mainstream/i, 'trendUp'],
  [/contrarian/i, 'compass'],
  [/stacker/i, 'layers'],
  [/spread|generous/i, 'share'],
  [/chattiest|comment/i, 'message'],
  [/one-sided/i, 'magnet'],
  [/points given/i, 'gift'],
  [/rounds/i, 'calendarX'],
  [/haul|single/i, 'trophy'],
  [/song|average|season|best/i, 'star'],
];

export function iconFor(label: string): keyof typeof paths {
  for (const [pattern, name] of RULES) if (pattern.test(label)) return name;
  return 'spark';
}

export function Icon({ name, size = 20 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

/** Icon chosen from a card's title. */
export function LabelIcon({ label, size }: { label: string; size?: number }) {
  return <Icon name={iconFor(label)} size={size} />;
}
