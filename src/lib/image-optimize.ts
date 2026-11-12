import "server-only";

import sharp from "sharp";

/**
 * Server-side optimisation for images imported from external sources.
 *
 * Two modes, because "smaller" and "not a single pixel changed" are different
 * promises:
 *
 *  - "lossless": recompress PNG bit-exactly (decoded pixels identical). JPEG
 *    and WebP are returned untouched, since any real JPEG saving requires
 *    re-encoding. Nothing is replaced unless it is at least 5 % smaller.
 *  - "balanced": re-encode to WebP quality 90 — visually indistinguishable at
 *    normal viewing sizes, typically 40–70 % smaller. Pixels are technically
 *    resampled, so it is opt-in, never the default.
 *  - "off": store the original bytes exactly as Drive has them.
 */
export type OptimizeMode = "off" | "lossless" | "balanced";

export type OptimizeResult = {
  data: Buffer;
  mimeType: string;
  ext: string;
  savedBytes: number;
  mode: Exclude<OptimizeMode, "off">;
};

const SKIP = new Set(["image/svg+xml", "image/gif", "image/avif"]);

export async function optimizeImage(
  buf: Buffer,
  mimeType: string,
  mode: OptimizeMode,
): Promise<OptimizeResult | null> {
  if (mode === "off" || !mimeType.startsWith("image/") || SKIP.has(mimeType)) return null;
  // Tiny files are already efficient; decoding them costs more than it saves.
  if (buf.length < 20 * 1024) return null;

  try {
    if (mode === "lossless") {
      if (mimeType !== "image/png") return null;
      const out = await sharp(buf, { limitInputPixels: false })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
      if (out.length >= buf.length * 0.95) return null;
      return { data: out, mimeType: "image/png", ext: "png", savedBytes: buf.length - out.length, mode };
    }

    const out = await sharp(buf, { limitInputPixels: false })
      .rotate() // honour EXIF orientation in the derivative
      .webp({ quality: 90, effort: 5 })
      .toBuffer();
    if (out.length >= buf.length * 0.9) return null;
    return { data: out, mimeType: "image/webp", ext: "webp", savedBytes: buf.length - out.length, mode };
  } catch {
    // optimisation is best-effort: a decode failure must never fail the import
    return null;
  }
}
