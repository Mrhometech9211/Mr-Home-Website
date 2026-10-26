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
 * If R2 is not configured on the server, step 1 returns 503 and the helper
 * transparently falls back to the legacy multipart POST that stores the file
 * in Postgres — the admin UX stays identical either way.
 */

type DirectInit = {
  id: number;
  key: string;
  mode: "direct" | "multipart";
  putUrl?: string;
  parts?: { uploadId: string; partSize: number; partUrls: string[] };
};

export type UploadProgress = { loadedPct: number | null };

let r2ModePromise: Promise<"r2" | "legacy" | null> | null = null;

async function r2Mode(): Promise<"r2" | "legacy" | null> {
  if (!r2ModePromise) {
    r2ModePromise = fetch("/api/admin/upload/status", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => ((d?.data?.mode as string) === "r2" ? "r2" : "legacy"))
      .catch(() => "legacy" as const);
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
      else reject(new Error(`Storage rejected the upload (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading to storage"));
    xhr.ontimeout = () => {
      xhr.abort();
      reject(new Error("Upload timed out — please try again"));
    };
    xhr.timeout = 10 * 60 * 1000; // large brochures over slow links
    xhr.send(file);
  });
}

function putPart(url: string, chunk: Blob, contentType: string): Promise<string> {
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
    xhr.send(chunk);
  });
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
  const mode = await r2Mode();
  if (mode === "r2") {
    const base = kind === "media" ? "/api/admin/media/upload" : "/api/admin/brochures/upload";
    try {
      const initRes = await fetch(base, {
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
      if (!initRes.ok) {
        // Fallback if R2 was disabled between status probe and init.
        const err = await initRes.json().catch(() => ({}));
        if (initRes.status >= 400 && initRes.status < 500) throw new Error(err.error || "Upload refused");
        throw Object.assign(new Error(err.error || "Upload refused"), { fallback: true });
      }
      const init = ((await initRes.json()) as { data: DirectInit }).data;

      let progressPct: number | null = 0;
      if (init.mode === "direct" && init.putUrl) {
        await presignedPut(init.putUrl, file, (p) => {
          progressPct = Math.min(95, p * 0.95);
          opts.onProgress?.(progressPct);
        });
      } else if (init.mode === "multipart" && init.parts) {
        // Chunk the file client-side and PUT each part — memory stays flat.
        progressPct = 0;
        opts.onProgress?.(0);
        const parts: { partNumber: number; etag: string }[] = [];
        for (let i = 0; i < init.parts.partUrls.length; i++) {
          const start = i * init.parts.partSize;
          const chunk = file.slice(start, Math.min(file.size, start + init.parts.partSize));
          const etag = await putPart(init.parts.partUrls[i], chunk, file.type || "application/octet-stream");
          parts.push({ partNumber: i + 1, etag });
          opts.onProgress?.(Math.round(((i + 1) / init.parts.partUrls.length) * 95));
        }
        await fetch(`${base}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ id: init.id, multipart: { uploadId: init.parts.uploadId, parts } }),
        });
        opts.onProgress?.(100);
        return { id: init.id };
      }

      const completeRes = await fetch(`${base}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id: init.id }),
      });
      if (!completeRes.ok) {
        const err = await completeRes.json().catch(() => ({}));
        void fetch(`${base}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ id: init.id }),
        }).catch(() => undefined);
        throw new Error((err as { error?: string }).error || "Upload could not be finalized");
      }
      opts.onProgress?.(100);
      return { id: init.id };
    } catch (err) {
      const e = err as Error & { fallback?: boolean };
      if (!e.fallback) throw err ?? e;
      // fall through to the legacy path
    }
  }

  // Legacy path — unchanged behaviour when R2 is not configured.
  const fd = new FormData();
  fd.append("file", file);
  if (kind === "brochure") fd.append("projectId", String(opts.projectId));
  const endpoint = kind === "media" ? "/api/admin/media" : "/api/admin/brochures";
  const res = await fetch(endpoint, { method: "POST", body: fd, credentials: "same-origin" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Upload failed (HTTP ${res.status})`);
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
