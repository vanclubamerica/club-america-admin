/**
 * HTML surgery helpers for the one-time site migration.
 *
 * These operate on raw text rather than a parsed DOM on purpose: re-serializing
 * the site through a parser would reformat attributes, entities and whitespace
 * across all eight pages, producing an enormous diff and destroying the
 * hand-written formatting. Locating byte offsets and splicing markers in leaves
 * every other character exactly as the officers wrote it.
 */

export class AnchorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnchorError';
  }
}

/** Finds an anchor string that must appear exactly once. */
function findUnique(html: string, anchor: string, file: string): number {
  const first = html.indexOf(anchor);
  if (first === -1) {
    throw new AnchorError(`Anchor not found in ${file}: ${anchor}`);
  }
  if (html.indexOf(anchor, first + anchor.length) !== -1) {
    throw new AnchorError(
      `Anchor appears more than once in ${file}, so it is ambiguous: ${anchor}`
    );
  }
  return first;
}

/** Tag name from an opening tag string such as `<div class="x">`. */
function tagNameOf(openTag: string): string {
  const match = openTag.match(/^<\s*([a-z0-9]+)/i);
  if (!match) throw new AnchorError(`Not a valid opening tag: ${openTag}`);
  return match[1].toLowerCase();
}

/**
 * Given the index of an element's opening tag, returns the index just past its
 * closing tag, accounting for nesting of the same tag name.
 */
function findElementEnd(html: string, openIdx: number, tag: string): number {
  const openPattern = new RegExp(`<${tag}\\b`, 'gi');
  const closePattern = new RegExp(`</${tag}\\s*>`, 'gi');

  let depth = 0;
  let cursor = openIdx;

  while (cursor < html.length) {
    openPattern.lastIndex = cursor;
    closePattern.lastIndex = cursor;

    const nextOpen = openPattern.exec(html);
    const nextClose = closePattern.exec(html);

    if (!nextClose) {
      throw new AnchorError(`Unclosed <${tag}> starting at offset ${openIdx}`);
    }

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + nextOpen[0].length;
      continue;
    }

    depth -= 1;
    cursor = nextClose.index + nextClose[0].length;
    if (depth === 0) return cursor;
  }

  throw new AnchorError(`Unclosed <${tag}> starting at offset ${openIdx}`);
}

/** Leading whitespace of the line containing `index`. */
function indentAt(html: string, index: number): string {
  const lineStart = html.lastIndexOf('\n', index - 1) + 1;
  return html.slice(lineStart, index).match(/^[ \t]*/)?.[0] ?? '';
}

export interface Splice {
  /** Text that will sit between the markers. */
  inner: string;
  /** Indentation used for the marker comments themselves. */
  indent: string;
  start: number;
  end: number;
}

/** Locates an entire element, markers to be placed around it. */
export function locateElement(html: string, openTag: string, file: string): Splice {
  const openIdx = findUnique(html, openTag, file);
  const tag = tagNameOf(openTag);
  const endIdx = findElementEnd(html, openIdx, tag);

  return {
    inner: html.slice(openIdx, endIdx),
    indent: indentAt(html, openIdx),
    start: openIdx,
    end: endIdx,
  };
}

/** Locates an element's children, markers to be placed just inside it. */
export function locateInner(html: string, openTag: string, file: string): Splice {
  const openIdx = findUnique(html, openTag, file);
  const tag = tagNameOf(openTag);
  const elementEnd = findElementEnd(html, openIdx, tag);

  const innerStart = openIdx + openTag.length;
  const closeTag = `</${tag}`;
  const innerEnd = html.lastIndexOf(closeTag, elementEnd);

  // Trim the newline after the opening tag and the indentation before the
  // closing tag, so markers land on their own tidy lines.
  const raw = html.slice(innerStart, innerEnd);
  const trimmedStart = raw.replace(/^\r?\n/, '');
  const leadingOffset = raw.length - trimmedStart.length;
  const inner = trimmedStart.replace(/[ \t]*$/, '').replace(/\r?\n$/, '');

  return {
    inner,
    indent: indentAt(html, innerEnd),
    start: innerStart + leadingOffset,
    end: innerStart + leadingOffset + inner.length,
  };
}

/**
 * Locates a run of consecutive sibling elements that share an opening tag,
 * e.g. every `<div class="event-row">` in a list.
 */
export function locateRun(html: string, openTag: string, file: string): Splice {
  const firstIdx = html.indexOf(openTag);
  if (firstIdx === -1) {
    throw new AnchorError(`Anchor not found in ${file}: ${openTag}`);
  }

  const tag = tagNameOf(openTag);
  let end = findElementEnd(html, firstIdx, tag);

  // Keep absorbing siblings while the only thing between them is whitespace.
  for (;;) {
    const gap = html.slice(end);
    const match = gap.match(/^\s*/);
    const whitespace = match ? match[0] : '';
    const nextIdx = end + whitespace.length;

    if (!html.startsWith(openTag, nextIdx)) break;
    end = findElementEnd(html, nextIdx, tag);
  }

  return {
    inner: html.slice(firstIdx, end),
    indent: indentAt(html, firstIdx),
    start: firstIdx,
    end,
  };
}

/**
 * Locates a span from the start of one anchor line to the end of another.
 * Used where the managed content is a couple of sibling tags rather than a
 * single element.
 */
export function locateSpan(
  html: string,
  startAnchor: string,
  endAnchor: string,
  file: string
): Splice {
  const startIdx = findUnique(html, startAnchor, file);
  const endAnchorIdx = html.indexOf(endAnchor, startIdx);

  if (endAnchorIdx === -1) {
    throw new AnchorError(`End anchor not found after start anchor in ${file}: ${endAnchor}`);
  }

  const end = endAnchorIdx + endAnchor.length;

  return {
    inner: html.slice(startIdx, end),
    indent: indentAt(html, startIdx),
    start: startIdx,
    end,
  };
}

/**
 * Locates a span covering two sibling elements: from the opening tag of the
 * first through the closing tag of the second. Used for the Officers page,
 * where one logical region is rendered as two adjacent grids.
 *
 * Anchored on opening tags rather than raw text so it is not sensitive to
 * line endings or indentation.
 */
export function locateSpanElements(
  html: string,
  startOpenTag: string,
  endOpenTag: string,
  file: string
): Splice {
  const startIdx = findUnique(html, startOpenTag, file);
  const endIdx = html.indexOf(endOpenTag, startIdx);

  if (endIdx === -1) {
    throw new AnchorError(
      `Second anchor not found after the first in ${file}: ${endOpenTag}`
    );
  }

  const end = findElementEnd(html, endIdx, tagNameOf(endOpenTag));

  return {
    inner: html.slice(startIdx, end),
    indent: indentAt(html, startIdx),
    start: startIdx,
    end,
  };
}

/**
 * Replaces a located span with marker comments wrapping `content`.
 * Splices are applied back-to-front by the caller so earlier offsets stay valid.
 */
export function applySplice(html: string, splice: Splice, key: string, content: string): string {
  const { indent } = splice;

  // `content` arrives UNINDENTED and is positioned here — matching exactly what
  // replaceRegion() does at publish time, so the two paths produce identical
  // bytes and the first publish after migration changes nothing.
  // Preserve the file's line endings so the migrated page does not end up with
  // a mix of CRLF and LF.
  const eol = html.includes('\r\n') ? '\r\n' : '\n';

  const trimmed = content.trim();
  const body = trimmed ? reindent(trimmed, indent).replace(/\r?\n/g, eol) : '';

  const block = body
    ? `${indent}<!-- cms:start ${key} -->${eol}${body}${eol}${indent}<!-- cms:end ${key} -->`
    : `${indent}<!-- cms:start ${key} -->${eol}${indent}<!-- cms:end ${key} -->`;

  // The splice starts at the anchor itself, which sits after its own
  // indentation — remove that duplicated indent from the original line.
  const lineStart = html.lastIndexOf('\n', splice.start - 1) + 1;
  const prefixIsWhitespace = html.slice(lineStart, splice.start).trim() === '';
  const replaceFrom = prefixIsWhitespace ? lineStart : splice.start;

  return html.slice(0, replaceFrom) + block + html.slice(splice.end);
}

/** Re-indents a rendered block to sit correctly inside its markers. */
export function reindent(content: string, indent: string): string {
  return content
    .split('\n')
    .map((line) => (line.trim() ? indent + line : line))
    .join('\n');
}
