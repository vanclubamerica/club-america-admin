import sanitizeHtml from 'sanitize-html';

/**
 * Output sanitization.
 *
 * This is the highest-risk boundary in the whole system. Content typed into
 * the dashboard is committed to a public repository and served from tpvan.com,
 * so anything that slips through here becomes stored XSS against every visitor
 * — including students and parents — and it persists in git history.
 *
 * Two rules, applied without exception:
 *   1. Plain-text fields (names, titles, locations) are HTML-ESCAPED. They are
 *      never allowed to contain markup at all.
 *   2. Rich text goes through a strict tag/attribute ALLOWLIST. Anything not
 *      explicitly permitted is dropped.
 */

/** Escapes a value for safe interpolation into HTML text or an attribute. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Only http(s) and mailto links survive. Blocks `javascript:`, `data:`, and
 * protocol-relative URLs that could redirect visitors off-site.
 */
export function sanitizeUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Reject control characters and whitespace used to smuggle scheme prefixes
  // past naive checks (e.g. "java\tscript:alert(1)").
  if (/[\s\u0000-\u001f]/.test(trimmed)) return null;

  // Site-relative links are fine and common (about.html, media/...).
  if (/^[a-z0-9._~-]+(\/[^\s]*)?$/i.test(trimmed) && !trimmed.includes(':')) {
    return trimmed;
  }
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  if (trimmed.startsWith('#')) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * The allowlist for editor content. Deliberately narrow: enough for the kind
 * of writing officers actually do (paragraphs, emphasis, lists, links,
 * subheadings) and nothing that can execute, embed, or restyle the page.
 */
const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub',
    'h2', 'h3', 'h4',
    'ul', 'ol', 'li',
    'blockquote', 'a', 'span',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    // `class` is allowlisted per-value below, so editor content cannot
    // impersonate site chrome or break the layout.
    span: ['class'],
    p: ['class'],
  },
  allowedClasses: {
    span: ['record-label', 'badge'],
    p: ['form-note', 'mx-auto'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  // Prevents `<a href="//evil.com">` from resolving against the visitor's protocol.
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  enforceHtmlBoundary: true,
  transformTags: {
    // Any link leaving the site opens safely: noopener stops the new tab from
    // reaching back into window.opener.
    a: (tagName, attribs) => {
      const href = sanitizeUrl(attribs.href);
      if (!href) {
        return { tagName: 'span', attribs: {} };
      }
      const isExternal = /^https?:\/\//i.test(href);
      return {
        tagName: 'a',
        attribs: {
          href,
          ...(attribs.title ? { title: attribs.title } : {}),
          ...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
        },
      };
    },
    // Normalise editor output to the tags the site's CSS actually styles.
    b: 'strong',
    i: 'em',
  },
};

/** Sanitizes rich text produced by the editor. */
export function sanitizeRichText(html: unknown): string {
  if (typeof html !== 'string' || !html.trim()) return '';
  return sanitizeHtml(html, RICH_TEXT_OPTIONS).trim();
}

/**
 * Strips all markup, leaving readable text. Used for excerpts, previews, and
 * anywhere rich content is shown inside a plain-text context.
 */
export function stripHtml(html: unknown): string {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Theme CSS is authored by admins but written into a public stylesheet, so it
 * gets its own narrow filter: no imports, no url() references, no braces that
 * could break out of the scoped selector, no behaviour hooks.
 */
export function sanitizeThemeCss(css: unknown): string {
  if (typeof css !== 'string') return '';
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/behaviou?r\s*:/gi, '')
    .replace(/url\s*\(\s*['"]?\s*(?!\/|media\/|https:\/\/)[^)]*\)/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .slice(0, 8000)
    .trim();
}

/**
 * Validates a CSS color value before it is written into theme.css.
 * Accepts hex, rgb(a), hsl(a), and plain keywords only.
 */
export function sanitizeCssColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const patterns = [
    /^#[0-9a-f]{3}$/i,
    /^#[0-9a-f]{4}$/i,
    /^#[0-9a-f]{6}$/i,
    /^#[0-9a-f]{8}$/i,
    /^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+\s*)?\)$/i,
    /^hsla?\(\s*[\d.]+(deg)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(,\s*[\d.]+\s*)?\)$/i,
    /^[a-z]{3,20}$/i,
  ];

  return patterns.some((p) => p.test(trimmed)) ? trimmed : null;
}

/**
 * Repo-relative asset paths only. Blocks directory traversal and absolute
 * URLs so a publish can never point the site at an attacker-controlled host
 * or write outside the media folder.
 */
export function sanitizeAssetPath(path: unknown): string | null {
  if (typeof path !== 'string') return null;
  const trimmed = path.trim().replace(/^\/+/, '');
  if (!trimmed) return null;
  if (trimmed.includes('..')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (!/^media\/[a-z0-9/_.-]+$/i.test(trimmed)) return null;
  return trimmed;
}
