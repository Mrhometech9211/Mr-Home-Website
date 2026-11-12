"use client";

/**
 * In-browser image compression.
 *
 * Runs before the upload starts so the bytes sent to storage are already small.
 * Strategy, in order:
 *   1. Re-encode to WebP at q0.9 — typically 40–80 % smaller for photos and
 *      screenshots alike (PNG re-encoded as PNG often grows, which is why the
 *      first version appeared not to compress).
 *   2. Otherwise re-encode in the original format and keep it only when ≥5 %
 *      smaller.
 *   3. Otherwise upload the original untouched.
 *
 * The long edge is capped at 3200 px; smaller images are only re-encoded.
 */

export type CompressOutcome = { file: File; originalSize: number; savedBytes: number };

const COMPRESSIBLE = new Set(["image/jpeg", "image/png", "image/webp"]);

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressImage(
  file: File,
  opts: { maxEdge?: number; quality?: number; minBytes?: number } = {},
): Promise<CompressOutcome> {
  const unchanged: CompressOutcome = { file, originalSize: file.size, savedBytes: 0 };
  const maxEdge = opts.maxEdge ?? 3200;
  const quality = opts.quality ?? 0.9;
  const minBytes = opts.minBytes ?? 150 * 1024;

  if (!COMPRESSIBLE.has(file.type) || file.size < minBytes) return unchanged;
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return unchanged;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close?.(); return unchanged; }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    // 1. WebP — the big win. A canvas that cannot encode WebP silently returns
    // PNG, so the MIME type is checked rather than assumed.
    const webp = await toBlob(canvas, "image/webp", quality);
    if (webp && webp.type === "image/webp" && webp.size < file.size * 0.9) {
      const base = file.name.replace(/\.[a-z0-9]{2,5}$/i, "");
      return {
        file: new File([webp], `${base}.webp`, { type: "image/webp", lastModified: file.lastModified }),
        originalSize: file.size,
        savedBytes: file.size - webp.size,
      };
    }

    // 2. Same-format re-encode (helps large JPEGs when WebP is unavailable).
    const same = await toBlob(canvas, file.type, quality);
    if (same && same.type === file.type && same.size < file.size * 0.95) {
      return {
        file: new File([same], file.name, { type: file.type, lastModified: file.lastModified }),
        originalSize: file.size,
        savedBytes: file.size - same.size,
      };
    }

    return unchanged;
  } catch {
    // Any decode/canvas failure simply uploads the original.
    return unchanged;
  }
}
