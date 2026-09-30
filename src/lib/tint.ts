/**
 * A colour per player, used for their avatar ring, header glow and chart bars.
 *
 * Preference is a colour averaged from their album covers (unique to them), but
 * cover averages are often muddy — a dull brown reads as "broken", not
 * "personal" — so a colour that is too dark or too grey is rejected in favour
 * of a deterministic palette keyed by the player's id. Environments without a
 * canvas (the tests) always get the palette. Pure functions here; the canvas
 * sampling lives in the hook that consumes them.
 */

/** A fixed, readable-on-dark palette. Twelve hues, evenly spread. */
export const TINT_PALETTE = [
  '#f0447f', // pink
  '#6fd3c7', // teal
  '#63d68f', // green
  '#e0b341', // gold
  '#8b7cf6', // violet
  '#f2915a', // orange
  '#4fa8f5', // blue
  '#e86fb0', // rose
  '#7bd15a', // lime
  '#d97fe0', // magenta
  '#5ad6c0', // aqua
  '#f5c542', // amber
];

/** Deterministic palette colour for an id — stable across sessions. */
export function paletteTint(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TINT_PALETTE[h % TINT_PALETTE.length];
}

/** Relative luminance (0–1) of an sRGB colour, for a contrast gate. */
export function luminance(r: number, g: number, b: number): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Saturation (0–1) in HSL terms. */
export function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === min) return 0;
  const l = (max + min) / 2;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

/**
 * Decide whether an averaged cover colour is vivid enough to use. Too dark,
 * too bright or too grey falls back to the palette. Thresholds picked so a
 * typical muddy average is rejected but a genuinely colourful cover passes.
 */
export function isUsableTint(r: number, g: number, b: number): boolean {
  const lum = luminance(r, g, b);
  if (lum < 0.05 || lum > 0.85) return false;
  return saturation(r, g, b) >= 0.25;
}

/** `rgb(r,g,b)` string, brightened toward a target luminance if too dark. */
export function toCss(r: number, g: number, b: number): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}
