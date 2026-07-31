import 'server-only';

/**
 * Upload validation.
 *
 * A browser-supplied MIME type is just a string the client chose, and an
 * extension is just characters in a filename. Neither tells you what the bytes
 * actually are. So every upload is checked against its real file signature
 * before it is stored — and images destined for the public website are held to
 * a strict allowlist, because they end up committed to a public repo.
 */

export interface FileKind {
  mime: string;
  extension: string;
  label: string;
}

/**
 * Magic-byte signatures. `offset` handles containers like WebP where the
 * identifying bytes are not at position 0.
 */
interface Signature {
  kind: FileKind;
  offset: number;
  bytes: number[];
  /** Extra predicate for container formats that share a prefix. */
  verify?: (buf: Uint8Array) => boolean;
}

const SIGNATURES: Signature[] = [
  {
    kind: { mime: 'image/png', extension: 'png', label: 'PNG image' },
    offset: 0,
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  {
    kind: { mime: 'image/jpeg', extension: 'jpg', label: 'JPEG image' },
    offset: 0,
    bytes: [0xff, 0xd8, 0xff],
  },
  {
    kind: { mime: 'image/gif', extension: 'gif', label: 'GIF image' },
    offset: 0,
    bytes: [0x47, 0x49, 0x46, 0x38],
  },
  {
    // RIFF....WEBP — the "WEBP" tag at offset 8 distinguishes it from other
    // RIFF containers such as WAV or AVI.
    kind: { mime: 'image/webp', extension: 'webp', label: 'WebP image' },
    offset: 0,
    bytes: [0x52, 0x49, 0x46, 0x46],
    verify: (buf) =>
      buf.length > 12 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50,
  },
  {
    kind: { mime: 'application/pdf', extension: 'pdf', label: 'PDF document' },
    offset: 0,
    bytes: [0x25, 0x50, 0x44, 0x46],
  },
  {
    // ZIP container — modern Office formats (.docx/.xlsx) are zip archives.
    kind: { mime: 'application/zip', extension: 'zip', label: 'Office document' },
    offset: 0,
    bytes: [0x50, 0x4b, 0x03, 0x04],
  },
  {
    kind: { mime: 'application/msword', extension: 'doc', label: 'Word 97 document' },
    offset: 0,
    bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  },
];

export const IMAGE_MIME_ALLOWLIST = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export const DOCUMENT_MIME_ALLOWLIST = [
  'application/pdf',
  'application/zip', // .docx / .xlsx detected by container signature
  'application/msword',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024; // 20 MB

export interface ValidationResult {
  ok: boolean;
  error?: string;
  kind?: FileKind;
}

/** Identifies a file by its actual bytes, ignoring the declared MIME type. */
export function sniffFileKind(buffer: Uint8Array): FileKind | null {
  for (const sig of SIGNATURES) {
    if (buffer.length < sig.offset + sig.bytes.length) continue;

    const matches = sig.bytes.every((byte, i) => buffer[sig.offset + i] === byte);
    if (!matches) continue;
    if (sig.verify && !sig.verify(buffer)) continue;

    return sig.kind;
  }
  return null;
}

/**
 * Validates an image upload. SVG is intentionally rejected: it can carry
 * script, and these files are published to a public site where that would
 * become stored XSS against visitors.
 */
export async function validateImageUpload(file: File): Promise<ValidationResult> {
  if (file.size === 0) return { ok: false, error: 'That file is empty.' };

  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `Images must be under ${formatBytes(MAX_IMAGE_BYTES)}. This one is ${formatBytes(file.size)}.`,
    };
  }

  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const kind = sniffFileKind(header);

  if (!kind) {
    return {
      ok: false,
      error: 'That file is not a recognised image. Use a PNG, JPG, GIF, or WebP.',
    };
  }

  if (!IMAGE_MIME_ALLOWLIST.includes(kind.mime)) {
    return {
      ok: false,
      error: `That file is a ${kind.label}, which is not allowed here. Use a PNG, JPG, GIF, or WebP image.`,
    };
  }

  // A mismatch means the extension is lying about the contents. Not fatal —
  // we store by sniffed type — but worth refusing so nothing surprising is
  // committed to the public repo.
  const declaredExt = file.name.split('.').pop()?.toLowerCase();
  if (declaredExt && !extensionMatchesKind(declaredExt, kind)) {
    return {
      ok: false,
      error: `This file is named ".${declaredExt}" but its contents are a ${kind.label}. Rename it or re-export it.`,
    };
  }

  return { ok: true, kind };
}

/** Validates a document upload for the private documents bucket. */
export async function validateDocumentUpload(file: File): Promise<ValidationResult> {
  if (file.size === 0) return { ok: false, error: 'That file is empty.' };

  if (file.size > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      error: `Documents must be under ${formatBytes(MAX_DOCUMENT_BYTES)}. This one is ${formatBytes(file.size)}.`,
    };
  }

  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const kind = sniffFileKind(header);

  // Plain text and CSV have no signature; accept them only when the declared
  // type and extension agree, and never let them masquerade as anything else.
  if (!kind) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if ((ext === 'txt' || ext === 'csv') && file.type.startsWith('text/')) {
      return {
        ok: true,
        kind: { mime: file.type, extension: ext, label: 'Text file' },
      };
    }
    return {
      ok: false,
      error: 'That file type is not supported. Use a PDF, Word, Excel, text, or image file.',
    };
  }

  if (!DOCUMENT_MIME_ALLOWLIST.includes(kind.mime)) {
    return { ok: false, error: `${kind.label} files are not allowed.` };
  }

  return { ok: true, kind };
}

function extensionMatchesKind(ext: string, kind: FileKind): boolean {
  if (kind.extension === ext) return true;
  // JPEG has several conventional spellings.
  if (kind.mime === 'image/jpeg') return ['jpg', 'jpeg', 'jpe'].includes(ext);
  return false;
}

/**
 * Builds a safe, predictable storage path. The slug is stripped of anything
 * that could traverse directories or confuse the GitHub commit that follows.
 */
export function buildMediaPath(folder: string, name: string, extension: string): string {
  const slug = slugify(name) || 'file';
  // A short random suffix avoids collisions and makes paths unguessable
  // without needing to query existing objects first.
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${folder}/${slug}-${suffix}.${extension}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics after NFKD
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
