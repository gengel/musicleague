/**
 * Folds a Vite build into one self-contained HTML file.
 *
 * Kept pure and separate from the CLI so it can be unit tested: getting the
 * `</script>` escaping wrong produces a file that silently renders nothing.
 */

/**
 * A `</script>` sequence anywhere inside inlined JS or CSS would end the
 * enclosing element early. The HTML parser is case-insensitive and tolerates
 * whitespace before the tag name, so match loosely and break the sequence.
 */
export function escapeForInlineScript(code) {
  return code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

/** CSS is inlined into <style>, which only terminates on a literal </style>. */
export function escapeForInlineStyle(css) {
  return css.replace(/<\/(style)/gi, '<\\/$1');
}

/**
 * Replaces the built asset references in an index.html with inline content.
 *
 * Styles are inlined where they sit. Scripts are moved to the end of <body>:
 * Vite emits `<script type="module">`, which browsers defer, but an inlined
 * classic script runs the moment it is parsed. Left in <head> it would
 * execute before #root exists.
 *
 * @param {object} opts
 * @param {string} opts.html   the built index.html
 * @param {{fileName: string, code: string}[]} opts.scripts
 * @param {{fileName: string, code: string}[]} opts.styles
 * @returns {string} single-file HTML
 */
export function inlineHtml({ html, scripts, styles }) {
  let out = html;

  // Replacements are passed as functions, never strings: minified bundles
  // contain `$&`, `$'` and similar, which String.replace would expand into
  // the matched <script> tag and corrupt the code.
  for (const { fileName, code } of styles) {
    // <link rel="stylesheet" ... href="/assets/x.css"> in any attribute order.
    const linkPattern = new RegExp(
      `[ \\t]*<link[^>]*href="[^"]*${escapeRegExp(fileName)}"[^>]*>\\s*`,
      'g',
    );
    if (!linkPattern.test(out)) {
      throw new Error(`Could not find a <link> for ${fileName} to inline`);
    }
    linkPattern.lastIndex = 0;
    const inlined = `<style>\n${escapeForInlineStyle(code)}\n</style>\n`;
    out = out.replace(linkPattern, () => inlined);
  }

  const bodyScripts = [];
  for (const { fileName, code } of scripts) {
    const scriptPattern = new RegExp(
      `[ \\t]*<script[^>]*src="[^"]*${escapeRegExp(fileName)}"[^>]*>\\s*</script>\\s*`,
      'g',
    );
    if (!scriptPattern.test(out)) {
      throw new Error(`Could not find a <script> for ${fileName} to inline`);
    }
    scriptPattern.lastIndex = 0;
    out = out.replace(scriptPattern, () => '');
    bodyScripts.push(`<script>\n${escapeForInlineScript(code)}\n</script>`);
  }

  if (bodyScripts.length) {
    const block = `${bodyScripts.join('\n')}\n`;
    if (!/<\/body>/i.test(out)) {
      throw new Error('No </body> to place the inlined script before');
    }
    out = out.replace(/<\/body>/i, () => `${block}</body>`);
  }

  const leftover = out.match(/(?:src|href)="[^"]*\/assets\/[^"]*"/g);
  if (leftover) {
    throw new Error(`Unlined assets remain in the HTML: ${leftover.join(', ')}`);
  }

  return out;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
