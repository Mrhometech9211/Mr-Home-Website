import "server-only";

/**
 * Shared Cloudflare R2 storage service (S3-compatible API).
 *
 * Every admin file upload (media library, logos, project galleries, page
 * sections, news covers, settings images and project brochures) stores its
 * binary payload in R2 through short-lived, server-generated presigned upload
 * URLs — the browser transfers the bytes directly to R2 so large files never
 * proxy through Vercel (which caps request bodies at ~4.5 MB and caused the
 * HTTP 413 brochure failures).
 *
 * Structured records, metadata and object keys stay in PostgreSQL as before;
 * R2 is pure object storage. Nothing here is used on the client.
 *
 * Configuration (all read from Vercel env; never logged, never echoed):
 *   R2_ACCOUNT_ID       – Cloudflare account id (endpoint host)
 *   R2_ACCESS_KEY_ID    – R2 API token access key id
 *   R2_SECRET_ACCESS_KEY– R2 API token secret (server-only)
 *   R2_BUCKET_NAME      – target bucket
 *   R2_ENDPOINT         – optional explicit S3 endpoint override; otherwise
 *                         https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
 *   R2_PUBLIC_URL       – optional public delivery base (R2 custom domain /
 *                         Cloudflare Worker). When set, /api/media/[id] and
 *                         /api/brochures/[id] 302 public reads to it so media
 *                         is served without burning Vercel bandwidth.
 */

import {
  S3Client,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** R2 supports PUT up to 5 GiB in a single request; uploadPart up to 5 GiB. */
export const R2_SINGLE_PUT_MAX = 5 * 1024 * 1024 * 1024;
/** Presigned PUT parts (multipart flows). Part uploads use the same 5 GiB cap. */
export const R2_MULTIPART_THRESHOLD = 100 * 1024 * 1024; // multipart only above 100 MB
export const R2_PART_SIZE = 60 * 1024 * 1024; // ~60 MB parts → well under 10 000-part limit

export type R2Config = {
  client: S3Client;
  bucket: string;
  publicUrl: string | null;
};

let cached: R2Config | null | undefined;

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

/** Returns the client-side-safe truth without touching secret values. */
export function r2IsConfigured(): boolean {
  return !!(readEnv("R2_BUCKET_NAME") && readEnv("R2_ACCESS_KEY_ID") && readEnv("R2_SECRET_ACCESS_KEY") && (readEnv("R2_ACCOUNT_ID") || readEnv("R2_ENDPOINT")));
}

/** Lazily builds (or caches) the client; null when env is incomplete. */
export function getR2(): R2Config | null {
  if (cached !== undefined) return cached;
  if (!r2IsConfigured()) {
    cached = null;
    return cached;
  }
  const accountId = readEnv("R2_ACCOUNT_ID");
  const endpoint = readEnv("R2_ENDPOINT") ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  const client = new S3Client({
    region: readEnv("R2_REGION") ?? "auto",
    endpoint,
    credentials: {
      accessKeyId: readEnv("R2_ACCESS_KEY_ID")!,
      secretAccessKey: readEnv("R2_SECRET_ACCESS_KEY")!,
    },
  });
  cached = { client, bucket: readEnv("R2_BUCKET_NAME")!, publicUrl: readEnv("R2_PUBLIC_URL") ?? null };
  return cached;
}

/** Test helper — drop the memoised config after env changes. */
export function resetR2Cache(): void {
  cached = undefined;
}

/** Safe, namespaced object key. Keys are validated against this shape before use. */
export function assertSafeKey(key: string): void {
  if (!/^[a-z0-9][a-z0-9/._-]{1,240}$/i.test(key) || key.includes("..")) {
    throw new Error("Unsafe storage key");
  }
}

/** Deterministic key for a media-library object. */
export function mediaKey(filename: string): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const base = filename.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(-120) || "file";
  return `media/${stamp}-${rand}-${base}`;
}

/** Brochure keys live in their own prefix so bucket lifecycles can differ. */
export function brochureKey(originalName: string): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const base = originalName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").replace(/\.pdf$/i, "").slice(-120) || "brochure";
  return `brochures/${stamp}-${rand}-${base}.pdf`;
}

/** Presigned, short-lived single-PUT URL for direct browser → R2 transfer. */
export async function presignPut(key: string, contentType: string, expiresSeconds = 3600): Promise<string> {
  const r2 = getR2();
  if (!r2) throw new Error("R2 is not configured");
  assertSafeKey(key);
  return getSignedUrl(
    r2.client,
    new PutObjectCommand({ Bucket: r2.bucket, Key: key, ContentType: contentType }),
    { expiresIn: expiresSeconds },
  );
}

/** Head an object; null when absent. Verifies upload completion at finalize. */
export async function headR2Object(key: string): Promise<{ size: number; contentType: string | null } | null> {
  const r2 = getR2();
  if (!r2) return null;
  assertSafeKey(key);
  try {
    const head = await r2.client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: key }));
    return { size: Number(head.ContentLength ?? 0), contentType: head.ContentType ?? null };
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "NotFound" || name === "NoSuchKey") return null;
    throw err;
  }
}

/** Read the whole object (transformed to a Buffer) for secure server-side delivery. */
export async function getR2Buffer(key: string): Promise<Buffer | null> {
  const r2 = getR2();
  if (!r2) return null;
  assertSafeKey(key);
  try {
    const res = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
    if (!res.Body) return null;
    return Buffer.from(await res.Body.transformToByteArray());
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "NotFound" || name === "NoSuchKey") return null;
    throw err;
  }
}

/** Read the first `length` bytes — used to sniff file signatures before finalize. */
export async function getR2HeadBytes(key: string, length = 128): Promise<Buffer> {
  const r2 = getR2();
  if (!r2) throw new Error("R2 is not configured");
  assertSafeKey(key);
  const res = await r2.client.send(
    new GetObjectCommand({ Bucket: r2.bucket, Key: key, Range: `bytes=0-${length - 1}` }),
  );
  const buf = res.Body ? await res.Body.transformToByteArray() : new Uint8Array(0);
  return Buffer.from(buf);
}

/** Fetch the first `length` bytes straight from R2 (no DB involvement). */
export async function getR2Range(key: string, length: number): Promise<Buffer> {
  return getR2HeadBytes(key, length);
}

export async function deleteR2Object(key: string): Promise<void> {
  const r2 = getR2();
  if (!r2) return;
  assertSafeKey(key);
  await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key })).catch(() => undefined);
}

/** Const for downstream callers that check delivery mode. */
export function r2PublicUrlBase(): string | null {
  return getR2()?.publicUrl ?? null;
}

/* ------------------------- multipart upload support ------------------------- */

export type MultipartSession = { key: string; uploadId: string; partCount: number; partUrls: string[] };

/** Start a multipart upload session; presignes every part URL up front. */
export async function startMultipart(key: string, contentType: string, size: number): Promise<MultipartSession> {
  const r2 = getR2();
  if (!r2) throw new Error("R2 is not configured");
  assertSafeKey(key);
  const partCount = Math.max(2, Math.ceil(size / R2_PART_SIZE));
  if (partCount > 10000) throw new Error("File too large for multipart session");
  const session = await r2.client.send(new CreateMultipartUploadCommand({ Bucket: r2.bucket, Key: key, ContentType: contentType }));
  if (!session.UploadId) throw new Error("R2 refused multipart session");
  const partUrls = await Promise.all(
    Array.from({ length: partCount }, (_, i) =>
      getSignedUrl(r2.client, new UploadPartCommand({ Bucket: r2.bucket, Key: key, UploadId: session.UploadId, PartNumber: i + 1 }), { expiresIn: 3600 * 24 }),
    ),
  );
  return { key, uploadId: session.UploadId, partCount, partUrls };
}

export async function completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void> {
  const r2 = getR2();
  if (!r2) throw new Error("R2 is not configured");
  assertSafeKey(key);
  await r2.client.send(
    new CompleteMultipartUploadCommand({
      Bucket: r2.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts.slice().sort((a, b) => a.partNumber - b.partNumber).map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
    }),
  );
}

/** Abandon an in-progress multipart session (kept abandoned parts from accruing). */
export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  const r2 = getR2();
  if (!r2) return;
  await r2.client.send(new AbortMultipartUploadCommand({ Bucket: r2.bucket, Key: key, UploadId: uploadId })).catch(() => undefined);
}
