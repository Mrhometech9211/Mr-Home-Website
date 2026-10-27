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
  HeadBucketCommand,
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

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

/**
 * Cloudflare account ids are 32 hex characters. Accept the common paste
 * variants (full endpoint URL, trailing slashes, `.r2.cloudflarestorage.com`
 * suffix) instead of emitting a malformed presigned URL — a malformed host
 * reaches the browser as an opaque "network error" during the PUT.
 */
function normalizeAccountId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const v = raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\.r2\.cloudflarestorage\.com.*$/i, "")
    .replace(/\/.*$/, "")
    .trim();
  return v || undefined;
}

type Resolved = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string | null;
  warnings: string[];
};

let cached: R2Config | null | undefined;
let resolved: Resolved | null | undefined;
let problems: string[] = [];

function resolveConfig(): { cfg: Resolved | null; problems: string[] } {
  if (resolved !== undefined) return { cfg: resolved, problems };
  const errs: string[] = [];
  const warnings: string[] = [];

  const explicitEndpoint = readEnv("R2_ENDPOINT");
  let endpoint: string | undefined;
  if (explicitEndpoint) {
    try {
      const u = new URL(explicitEndpoint);
      if (u.protocol !== "https:" && u.protocol !== "http:") errs.push("R2_ENDPOINT must be an http(s) URL");
      else endpoint = explicitEndpoint.replace(/\/+$/, "");
    } catch {
      errs.push("R2_ENDPOINT is not a valid URL");
    }
  } else {
    const account = normalizeAccountId(readEnv("R2_ACCOUNT_ID"));
    if (!account) errs.push("R2_ACCOUNT_ID (or R2_ENDPOINT) is missing");
    else if (!/^[a-f0-9]{32}$/i.test(account)) {
      errs.push("R2_ACCOUNT_ID does not look like a 32-character Cloudflare account id (paste the account id, not the endpoint URL)");
    } else endpoint = `https://${account}.r2.cloudflarestorage.com`;
  }

  const bucket = readEnv("R2_BUCKET_NAME");
  const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");
  if (!bucket) errs.push("R2_BUCKET_NAME is missing");
  if (!accessKeyId) errs.push("R2_ACCESS_KEY_ID is missing");
  if (!secretAccessKey) errs.push("R2_SECRET_ACCESS_KEY is missing");

  let publicUrl: string | null = null;
  const publicRaw = readEnv("R2_PUBLIC_URL");
  if (publicRaw) {
    try {
      const u = new URL(publicRaw);
      if (u.protocol !== "https:" && u.protocol !== "http:") warnings.push("R2_PUBLIC_URL must be an http(s) URL — public delivery stays disabled");
      else {
        publicUrl = publicRaw.replace(/\/+$/, "");
        if (u.hostname.endsWith(".r2.cloudflarestorage.com")) {
          warnings.push("R2_PUBLIC_URL points at the private S3 endpoint — use the public r2.dev domain or a custom domain; media is proxied server-side instead");
          publicUrl = null;
        }
      }
    } catch {
      warnings.push("R2_PUBLIC_URL is not a valid URL — public delivery stays disabled");
    }
  }

  if (errs.length || !endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    resolved = null;
    problems = errs;
    return { cfg: null, problems };
  }
  resolved = { endpoint, bucket, accessKeyId, secretAccessKey, publicUrl, warnings };
  problems = [];
  return { cfg: resolved, problems };
}

/** Returns the client-side-safe truth without touching secret values. */
export function r2IsConfigured(): boolean {
  return resolveConfig().cfg !== null;
}

/** Lazily builds (or caches) the client; null when env is incomplete/invalid. */
export function getR2(): R2Config | null {
  if (cached !== undefined) return cached;
  const { cfg } = resolveConfig();
  if (!cfg) {
    cached = null;
    return cached;
  }
  const client = new S3Client({
    region: readEnv("R2_REGION") ?? "auto",
    endpoint: cfg.endpoint,
    // R2 accepts both styles; the local emulator (127.0.0.1/localhost) only
    // implements path-style, so force it there and keep R2's default elsewhere.
    forcePathStyle: /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(cfg.endpoint),
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  cached = { client, bucket: cfg.bucket, publicUrl: cfg.publicUrl };
  return cached;
}

/**
 * Admin-only diagnostics: env names and validation outcomes only — never
 * values, keys, account ids or bucket names.
 */
export function r2Diagnostics(): { configured: boolean; problems: string[]; warnings: string[]; publicDelivery: boolean } {
  const { cfg, problems: errs } = resolveConfig();
  return { configured: !!cfg, problems: errs, warnings: cfg?.warnings ?? [], publicDelivery: !!cfg?.publicUrl };
}

/**
 * Server → R2 reachability/credential probe (HeadBucket). Distinguishes a
 * bad endpoint/credential from a browser-side CORS block on a presigned PUT.
 */
export async function probeR2(): Promise<{ ok: boolean; error?: string }> {
  const r2 = getR2();
  if (!r2) return { ok: false, error: "not-configured" };
  try {
    await r2.client.send(new HeadBucketCommand({ Bucket: r2.bucket }), { abortSignal: AbortSignal.timeout(5000) });
    return { ok: true };
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    return { ok: false, error: `${e.name ?? "RequestFailed"}${e.$metadata?.httpStatusCode ? ` (HTTP ${e.$metadata.httpStatusCode})` : ""}` };
  }
}

/** Test helper — drop the memoised config after env changes. */
export function resetR2Cache(): void {
  cached = undefined;
  resolved = undefined;
  problems = [];
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

/** Server-side upload (generated PDFs, server-produced artifacts). */
export async function putR2Object(key: string, body: Uint8Array, contentType: string): Promise<void> {
  const r2 = getR2();
  if (!r2) throw new Error("R2 is not configured");
  assertSafeKey(key);
  await r2.client.send(
    new PutObjectCommand({ Bucket: r2.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: "private, max-age=0" }),
    { abortSignal: AbortSignal.timeout(60_000) },
  );
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

/**
 * Short-lived presigned GET for gated downloads. Returning a redirect to R2
 * (instead of streaming the object through the function) avoids Vercel's
 * response-body cap — large brochures previously failed to download through
 * /api/brochures/[id] — and works with a private bucket.
 */
export async function presignGet(key: string, opts: { filename?: string; expiresSeconds?: number; inline?: boolean; contentType?: string } = {}): Promise<string> {
  const r2 = getR2();
  if (!r2) throw new Error("R2 is not configured");
  assertSafeKey(key);
  const name = (opts.filename ?? "document.pdf").replace(/[^\w.\- ]+/g, "_").slice(0, 180) || "document.pdf";
  return getSignedUrl(
    r2.client,
    new GetObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      ResponseContentDisposition: `${opts.inline ? "inline" : "attachment"}; filename="${name}"`,
      ResponseContentType: opts.contentType ?? "application/pdf",
    }),
    { expiresIn: opts.expiresSeconds ?? 300 },
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
