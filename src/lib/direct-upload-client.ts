"use client";

/**
 * Browser-side direct-to-R2 upload helper used by every admin upload surface.
 *
 * Flow per file:
 *   1. POST /api/admin/{media|brochures}/upload          → presigned URL(s)
 *   2. PUT the bytes straight to R2 (XHR, so we get real progress events)
 *   3. POST .../upload/complete                          → row flips to `ready`
 *      (cancels the pending row automatically on failure)
 *
 * If R2 is not configured on the server, small files fall back to the legacy
 * multipart POST that stores the file in Postgres. Vercel caps request bodies
 * at ~4.5 MB, so a large file is NEVER retried through that fallback — doing so
 * produced an opaque browser "network error" instead of a usable message.
 */

type DirectInit = {
  id: number;
  key: string;
  mode: "direct" | "multipart";
  putUrl?: string;
  parts?: { uploadId: string; partSize: number; partUrls: string[] };
};

export type UploadProgress = { loadedPct: number | null };

/** Conservative ceiling for the legacy in-band upload path (Vercel ~4.5 MB). */
const IN_BAND_MAX = 4 * 1024 * 1024;

let r2ModePromise: Promise<"r2" | "legacy" | "unknown"> | null = null;

async function r2Mode(): Promise<"r2" | "legacy" | "unknown"> {
  if (!r2ModePromise) {
    r2ModePromise = fetch("/api/admin/upload/status", { credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) return "unknown" as const;
        const d = (await r.json().catch(() => null)) as { data?: { mode?: string } } | null;
        return d?.data?.mode === "r2" ? ("r2" as const) : ("legacy" as const);
      })
      .catch(() => "unknown" as const);
  }
  return r2ModePromise;
}

/** PUT a single blob to a presigned URL with progress reporting. */
function presignedPut(url: string, file: File, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage rejected the upload (HTTP ${xhr.status}). Check the R2 bucket permissions and CORS policy.`));
    };
    xhr.onerror = () =>
      reject(
        new Error(
          `Could not upload directly to object storage from this browser. This is usually a missing CORS rule on the R2 bucket — allow PUT from ${window.location.origin}.`,
        ),
      );
    xhr.ontimeout = () => {
      xhr.abort();
      reject(new Error("Upload timed out — please try again"));
    };
    xhr.timeout = 10 * 60 * 1000; // large brochures over slow links
    xhr.send(file);
  });
}

function putPartOnce(url: string, chunk: Blob, contentType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.onload = () => {
      const etag = xhr.getResponseHeader("ETag") ?? xhr.getResponseHeader("etag");
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag.replace(/"/g, ""));
      else reject(new Error(`Part upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading a part"));
    xhr.timeout = 10 * 60 * 1000;
    xhr.send(chunk);
  });
}

/** One retry for transient part failures; large uploads should not die on a blip. */
async function putPart(url: string, chunk: Blob, contentType: string): Promise<string> {
  try {
    return await putPartOnce(url, chunk, contentType);
  } catch (err) {
    if (/HTTP 4\d\d/.test((err as Error).message)) throw err;
    await new Promise((r) => setTimeout(r, 750));
    return putPartOnce(url, chunk, contentType);
  }
}

async function cancelUpload(base: string, id: number, uploadId?: string): Promise<void> {
  await fetch(`${base}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ id, ...(uploadId ? { multipart: { uploadId } } : {}) }),
  }).catch(() => undefined);
}

/**
 * Upload one file. Returns the id of the finalized row (media or brochure).
 * `onProgress` receives 0–100 for direct/multipart PUTs (approximate: the
 * completion request is a tiny JSON call).
 */
export async function directUpload(
  kind: "media" | "brochure",
  file: File,
  opts: { projectId?: number; allowDownload?: boolean; initialUrl?: File | null; onProgress?: (pct: number | null) => void } = {},
): Promise<{ id: number }> {
  const base = kind === "media" ? "/api/admin/media/upload" : "/api/admin/brochures/upload";
  const mode = await r2Mode();

  if (mode !== "legacy") {
    let initRes: Response;
    try {
      initRes = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          ...(kind === "brochure" ? { projectId: opts.projectId, allowDownload: opts.allowDownload ?? true } : {}),
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
        }),
      });
    } catch {
      throw new Error("Could not reach the upload service — check your connection and try again.");
    }

    if (initRes.ok) {
      const init = ((await initRes.json()) as { data: DirectInit }).data;
      try {
        if (init.mode === "direct" && init.putUrl) {
          await presignedPut(init.putUrl, file, (p) => opts.onProgress?.(Math.min(95, p * 0.95)));
        } else if (init.mode === "multipart" && init.parts) {
          // Chunk the file client-side and PUT each part — memory stays flat.
          opts.onProgress?.(0);
          const parts: { partNumber: number; etag: string }[] = [];
          for (let i = 0; i < init.parts.partUrls.length; i++) {
            const start = i * init.parts.partSize;
            const chunk = file.slice(start, Math.min(file.size, start + init.parts.partSize));
            const etag = await putPart(init.parts.partUrls[i], chunk, file.type || "application/octet-stream");
            parts.push({ partNumber: i + 1, etag });
            opts.onProgress?.(Math.round(((i + 1) / init.parts.partUrls.length) * 95));
          }
          const completeRes = await fetch(`${base}/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ id: init.id, multipart: { uploadId: init.parts.uploadId, parts } }),
          });
          if (!completeRes.ok) {
            const err = (await completeRes.json().catch(() => ({}))) as { error?: string };
            await cancelUpload(base, init.id, init.parts.uploadId);
            throw new Error(err.error || "Upload could not be finalized — please try again");
          }
          opts.onProgress?.(100);
          return { id: init.id };
        } else {
          await cancelUpload(base, init.id);
          throw new Error("Storage returned an unexpected upload mode — please try again");
        }

        const completeRes = await fetch(`${base}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ id: init.id }),
        });
        if (!completeRes.ok) {
          const err = (await completeRes.json().catch(() => ({}))) as { error?: string };
          await cancelUpload(base, init.id);
          throw new Error(err.error || "Upload could not be finalized");
        }
        opts.onProgress?.(100);
        return { id: init.id };
      } catch (err) {
        // A failed PUT left a pending row behind; best-effort cleanup.
        if (init.mode === "direct") await cancelUpload(base, init.id);
        throw err;
      }
    }

    const err = (await initRes.json().catch(() => ({}))) as { error?: string };
    const message = err.error || `Upload could not start (HTTP ${initRes.status})`;
    // 4xx are deterministic (auth, type, size) — never retried. 5xx may mean R2
    // is unavailable: only small files may use the in-band fallback.
    if (initRes.status < 500) throw new Error(message);
    if (file.size > IN_BAND_MAX) {
      throw new Error(
        `${message} This file is too large for the server fallback (${Math.round(file.size / 1024 / 1024)} MB), so it was not retried.`,
      );
    }
  } else if (file.size > IN_BAND_MAX) {
    throw new Error(
      "Object storage (R2) is not configured on this deployment — files over 4 MB cannot be uploaded through the fallback path. Set the R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME environment variables for this environment.",
    );
  }

  // Legacy path — small files only, unchanged behaviour when R2 is not configured.
  const fd = new FormData();
  fd.append("file", file);
  if (kind === "brochure") fd.append("projectId", String(opts.projectId));
  const endpoint = kind === "media" ? "/api/admin/media" : "/api/admin/brochures";
  const res = await fetch(endpoint, { method: "POST", body: fd, credentials: "same-origin" });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Upload failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { data?: { id?: number } };
  opts.onProgress?.(null);
  return { id: data.data?.id ?? 0 };
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
