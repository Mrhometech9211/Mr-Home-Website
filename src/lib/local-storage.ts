import "server-only";

/**
 * Local-disk object storage for development.
 *
 * Production stores media in R2. When R2 is not configured locally, the legacy
 * database path caps uploads at ~4 MB (Vercel's body limit) which made large
 * videos impossible to test. This backend streams bytes to `.uploads/` on disk
 * instead, with the same storage-key discipline, so development behaves like
 * production for any supported file size.
 *
 * It is only selected when R2 is absent AND NODE_ENV !== "production".
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), process.env.LOCAL_UPLOAD_DIR || ".uploads");

export function localStorageEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function localFilePath(key: string): string {
  const abs = path.resolve(ROOT, key);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) throw new Error("Unsafe storage key");
  return abs;
}

export async function writeLocalFromStream(key: string, body: ReadableStream<Uint8Array> | null): Promise<number> {
  if (!body) throw new Error("Empty upload body");
  const abs = localFilePath(key);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const handle = await fs.open(abs, "w");
  let total = 0;
  try {
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      await handle.write(value);
    }
  } finally {
    await handle.close();
  }
  return total;
}

export async function writeLocalBuffer(key: string, data: Uint8Array): Promise<number> {
  const abs = localFilePath(key);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return data.byteLength;
}

export async function readLocalFile(key: string): Promise<Buffer> {
  return fs.readFile(localFilePath(key));
}

export async function readLocalHead(key: string, length = 256 * 1024): Promise<Buffer> {
  const abs = localFilePath(key);
  const handle = await fs.open(abs, "r");
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buf, 0, length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function localFileStat(key: string): Promise<{ size: number } | null> {
  try {
    const s = await fs.stat(localFilePath(key));
    return { size: s.size };
  } catch {
    return null;
  }
}

export async function deleteLocalFile(key: string): Promise<void> {
  await fs.unlink(localFilePath(key)).catch(() => undefined);
}
