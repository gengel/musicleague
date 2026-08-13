/** Types for the build-time single-file inliner. */

export interface InlineAsset {
  fileName: string;
  code: string;
}

export function escapeForInlineScript(code: string): string;
export function escapeForInlineStyle(css: string): string;
export function inlineHtml(opts: {
  html: string;
  scripts: InlineAsset[];
  styles: InlineAsset[];
}): string;
