'use client';

import { useRef, useState } from 'react';
import { Input } from '@/components/ui';
import { formatBytes } from '@/lib/utils';

/**
 * File input that resizes images in the browser before they are submitted.
 *
 * Three reasons this happens client-side rather than on the server:
 *
 *   1. Vercel rejects request bodies over 4.5 MB at the edge, before any of our
 *      code runs — so a 6 MB phone photo produces an uncatchable 413 and a
 *      client-side crash. Shrinking first keeps every upload comfortably under
 *      that ceiling.
 *   2. Officer photos are displayed a few hundred pixels wide. Committing a
 *      4000px original to the website repo makes the public site slower and
 *      bloats git history permanently.
 *   3. Re-encoding through a canvas DROPS EXIF METADATA. Phone photos carry GPS
 *      coordinates, and these files are published to a public website — so
 *      stripping location data from photos of students matters.
 *
 * The server still validates magic bytes and size. This is a usability and
 * privacy measure, not the security boundary.
 */

/** Longest edge, in pixels, after resizing. */
const MAX_DIMENSION = 1600;

/** Files below this are passed through untouched — no point re-encoding. */
const PASSTHROUGH_BYTES = 1_000_000;

/** Hard ceiling after processing; well under Vercel's 4.5 MB request limit. */
const MAX_UPLOAD_BYTES = 3_500_000;

const JPEG_QUALITY = 0.85;

async function shrinkImage(file: File): Promise<File> {
  // GIFs would lose their animation through a canvas, and anything already
  // small is not worth re-encoding.
  if (file.size <= PASSTHROUGH_BYTES || file.type === 'image/gif') return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));

  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Keep PNG/WebP as-is so logos with transparent backgrounds do not gain a
  // black box; photographs go to JPEG, which is far smaller.
  const keepsAlpha = file.type === 'image/png' || file.type === 'image/webp';
  const outputType = keepsAlpha ? file.type : 'image/jpeg';

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outputType, keepsAlpha ? undefined : JPEG_QUALITY)
  );

  if (!blob || blob.size >= file.size) return file; // no benefit — keep original

  const extension = outputType === 'image/jpeg' ? 'jpg' : outputType.split('/')[1];
  const baseName = file.name.replace(/\.[^.]+$/, '');

  return new File([blob], `${baseName}.${extension}`, { type: outputType });
}

export function ImageInput({
  name,
  hint,
}: {
  name: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    setStatus(null);

    if (!file) return;

    setBusy(true);
    try {
      const processed = await shrinkImage(file);

      if (processed.size > MAX_UPLOAD_BYTES) {
        setError(
          `That image is ${formatBytes(processed.size)} even after resizing, which is too large to upload. Try saving it as a JPG first.`
        );
        if (inputRef.current) inputRef.current.value = '';
        return;
      }

      // Swap the processed file into the input so the form submits it.
      if (processed !== file && inputRef.current) {
        const transfer = new DataTransfer();
        transfer.items.add(processed);
        inputRef.current.files = transfer.files;
        setStatus(
          `Resized from ${formatBytes(file.size)} to ${formatBytes(processed.size)} — ready to save.`
        );
      } else {
        setStatus(`${formatBytes(file.size)} — ready to save.`);
      }
    } catch {
      setError('That image could not be read. Try a different file.');
      if (inputRef.current) inputRef.current.value = '';
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <Input
        ref={inputRef}
        type="file"
        name={name}
        accept="image/png,image/jpeg,image/webp"
        onChange={handleChange}
      />
      {busy && <p className="text-xs text-ink-500">Preparing image…</p>}
      {status && !busy && <p className="text-xs text-emerald-700">{status}</p>}
      {error && <p className="text-xs font-medium text-flag-600">{error}</p>}
      {hint && !status && !error && <p className="text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
