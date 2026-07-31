/**
 * Marker splicing.
 *
 * Publishing rewrites only the text between a matched pair of marker comments,
 * leaving the rest of the file byte-for-byte identical. That containment is the
 * whole safety story of this design, so the functions here are deliberately
 * strict: an unmatched, duplicated, or inverted marker pair throws rather than
 * guessing, because a wrong guess would corrupt the live website.
 */

export const MARKER_PREFIX = 'cms:';

export function startMarker(key: string): string {
  return `<!-- ${MARKER_PREFIX}start ${key} -->`;
}

export function endMarker(key: string): string {
  return `<!-- ${MARKER_PREFIX}end ${key} -->`;
}

export class MarkerError extends Error {
  constructor(message: string, readonly regionKey: string, readonly file: string) {
    super(message);
    this.name = 'MarkerError';
  }
}

interface MarkerBounds {
  /** Index just after the start marker. */
  contentStart: number;
  /** Index of the first character of the end marker line. */
  contentEnd: number;
  /** Indentation of the start marker, reused for generated content. */
  indent: string;
}

function locate(html: string, key: string, file: string): MarkerBounds {
  const start = startMarker(key);
  const end = endMarker(key);

  const startIdx = html.indexOf(start);
  if (startIdx === -1) {
    throw new MarkerError(
      `Could not find "${start}" in ${file}. The public site may need re-running ` +
        `through "npm run migrate:public-site", or someone removed the marker by hand.`,
      key,
      file
    );
  }

  // A duplicated marker means we cannot tell which block to replace.
  if (html.indexOf(start, startIdx + start.length) !== -1) {
    throw new MarkerError(
      `Found more than one "${start}" in ${file}. Remove the duplicate before publishing.`,
      key,
      file
    );
  }

  const endIdx = html.indexOf(end, startIdx);
  if (endIdx === -1) {
    throw new MarkerError(
      `Found "${start}" in ${file} but no matching "${end}".`,
      key,
      file
    );
  }

  // Preserve the start marker's indentation so generated blocks line up with
  // the surrounding hand-written HTML.
  const lineStart = html.lastIndexOf('\n', startIdx) + 1;
  const indent = html.slice(lineStart, startIdx).match(/^[ \t]*/)?.[0] ?? '';

  // The end marker's own indentation is part of the untouched tail.
  const endLineStart = html.lastIndexOf('\n', endIdx) + 1;

  return {
    contentStart: startIdx + start.length,
    contentEnd: endLineStart,
    indent,
  };
}

/** True when the file contains a usable marker pair for this region. */
export function hasRegion(html: string, key: string): boolean {
  return html.includes(startMarker(key)) && html.includes(endMarker(key));
}

/** Returns the current content between markers, without the markers themselves. */
export function readRegion(html: string, key: string, file = 'file'): string {
  const { contentStart, contentEnd } = locate(html, key, file);
  return html.slice(contentStart, contentEnd).replace(/^\r?\n/, '').replace(/\s+$/, '');
}

/**
 * Replaces the content between markers. `content` should already be rendered
 * and sanitized; it is indented to match the start marker.
 */
export function replaceRegion(
  html: string,
  key: string,
  content: string,
  file = 'file'
): string {
  const { contentStart, contentEnd, indent } = locate(html, key, file);

  // Match the file's existing line endings. The site is authored on Windows
  // with CRLF, and emitting LF here would leave every published page with
  // mixed endings and noisy diffs.
  const eol = html.includes('\r\n') ? '\r\n' : '\n';

  // Renderers emit unindented HTML; it is positioned here to match the start
  // marker. The migration script indents identically, which is what makes the
  // first publish after migration a genuine no-op rather than a whitespace diff.
  const trimmed = content.trim();
  const body = trimmed ? indentLines(trimmed, indent).replace(/\r?\n/g, eol) : '';

  // `contentEnd` is the start of the end-marker's LINE, so the untouched tail
  // already supplies that marker's indentation — adding `indent` here again
  // would double it.
  // An empty region (no sponsors yet, no upcoming events) collapses to just a
  // blank line rather than leaving stray whitespace behind.
  const rendered = body ? `${eol}${body}${eol}` : eol;

  return html.slice(0, contentStart) + rendered + html.slice(contentEnd);
}

/** Applies several region replacements to one file in a single pass. */
export function replaceRegions(
  html: string,
  replacements: Array<{ key: string; content: string }>,
  file = 'file'
): string {
  return replacements.reduce(
    (acc, { key, content }) => replaceRegion(acc, key, content, file),
    html
  );
}

/**
 * Wraps an existing block of HTML in markers. Used once, by the migration
 * script, to convert the hand-written site into a CMS-managed one.
 */
export function wrapWithMarkers(block: string, key: string, indent: string): string {
  return `${indent}${startMarker(key)}\n${block}\n${indent}${endMarker(key)}`;
}

/** Lists every region key present in a file. */
export function findRegionKeys(html: string): string[] {
  const pattern = new RegExp(`<!--\\s*${MARKER_PREFIX}start\\s+([a-z0-9-]+)\\s*-->`, 'gi');
  return [...html.matchAll(pattern)].map((m) => m[1]);
}

/**
 * Indents each line of a block. Generated content is authored without leading
 * whitespace and positioned here, so renderers stay readable.
 */
export function indentLines(content: string, indent: string): string {
  if (!indent) return content;
  return content
    .split('\n')
    .map((line) => (line.trim() ? indent + line : line))
    .join('\n');
}

export function indentBlock(content: string, spaces: number): string {
  return indentLines(content, ' '.repeat(spaces));
}
