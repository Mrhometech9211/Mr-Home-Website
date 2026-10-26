import { BROCHURE_MAX_BYTES } from "@/lib/upload-limits";

export const ALLOWED: Record<string, { ext: string[]; kind: "image" | "video" | "document"; max: number }> = {
  "image/jpeg": { ext: ["jpg", "jpeg"], kind: "image", max: 10 * 1024 * 1024 },
  "image/png": { ext: ["png"], kind: "image", max: 10 * 1024 * 1024 },
  "image/webp": { ext: ["webp"], kind: "image", max: 10 * 1024 * 1024 },
  "image/avif": { ext: ["avif"], kind: "image", max: 10 * 1024 * 1024 },
  "image/gif": { ext: ["gif"], kind: "image", max: 8 * 1024 * 1024 },
  "image/svg+xml": { ext: ["svg"], kind: "image", max: 1 * 1024 * 1024 },
  "video/mp4": { ext: ["mp4", "m4v"], kind: "video", max: 80 * 1024 * 1024 },
  "video/webm": { ext: ["webm"], kind: "video", max: 80 * 1024 * 1024 },
  // Brochures are PDFs and share this ceiling; both upload through R2 direct.
  "application/pdf": { ext: ["pdf"], kind: "document", max: BROCHURE_MAX_BYTES },
};

const MAX_DIM = 8000;

/** Byte-signature probe. Exported so the direct-R2 finalize flow can reuse it. */
export function sniff(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.subarray(0, 3).toString("ascii") === "GIF") return "image/gif";
  if (buf.subarray(0, 4).toString("ascii") === "%PDF") return "application/pdf";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (brand.startsWith("avif") || brand.startsWith("avis")) return "image/avif";
    return "video/mp4";
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "video/webm";
  const head = buf.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

export function imageDimensions(buf: Buffer, mime: string): { width: number; height: number } | null {
  try {
    if (mime === "image/png") return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (mime === "image/gif") return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    if (mime === "image/webp") {
      const chunk = buf.subarray(12, 16).toString("ascii");
      if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L") { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
      if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
    if (mime === "image/jpeg") {
      let off = 2;
      while (off < buf.length) {
        if (buf[off] !== 0xff) { off++; continue; }
        const marker = buf[off + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
        off += 2 + buf.readUInt16BE(off + 2);
      }
    }
  } catch { return null; }
  return null;
}

/** Active-content scan shared by the legacy upload path and the R2 finalizer. */
export function svgHasActiveContent(txt: string): boolean {
  const singleQuote = String.fromCharCode(0x27);
  return new RegExp(
    "<script|on\\w+\\s*=|javascript:|<foreignObject|<iframe|xlink:href\\s*=\\s*[" + JSON.stringify(singleQuote) + "\\s]*(?!#|data:image)",
    "i",
  ).test(txt);
}

export function validateUpload(file: { name: string; type: string; size: number }, buf: Buffer) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const declared = file.type.toLowerCase();
  const rule = ALLOWED[declared];
  if (!rule) return { ok: false as const, error: `File type "${declared || ext}" is not allowed.` };
  if (!rule.ext.includes(ext)) return { ok: false as const, error: `Extension .${ext} does not match type ${declared}.` };
  if (file.size > rule.max) return { ok: false as const, error: `File exceeds the ${(rule.max / 1024 / 1024).toFixed(0)}MB limit.` };
  const sniffed = sniff(buf);
  if (sniffed !== declared && !(declared === "image/avif" && sniffed === "video/mp4")) return { ok: false as const, error: "File contents do not match the declared type." };
  if (declared === "image/svg+xml" && svgHasActiveContent(buf.toString("utf8"))) {
    return { ok: false as const, error: "SVG contains disallowed active content." };
  }
  let dims: { width: number; height: number } | null = null;
  if (rule.kind === "image" && declared !== "image/svg+xml" && declared !== "image/avif") {
    dims = imageDimensions(buf, declared);
    if (dims && (dims.width > MAX_DIM || dims.height > MAX_DIM)) return { ok: false as const, error: `Image dimensions exceed ${MAX_DIM}px.` };
  }
  return { ok: true as const, kind: rule.kind, dims };
}

export function safeFilename(name: string) {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(-120);
  return base || `file-${Date.now()}`;
}
