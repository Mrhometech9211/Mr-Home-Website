import "server-only";

/**
 * Google Drive connector.
 *
 * OAuth 2.0 authorisation-code flow with offline access, so imports keep working
 * after the one-hour access token expires. Tokens live in `integration_tokens`
 * (one row per provider) and are never sent to the browser.
 *
 * Required env (set in .env locally, and in the hosting env for production):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 * Optional: GOOGLE_REDIRECT_URI when the public origin differs from req.url.
 *
 * Scope is read-only: this connector imports from Drive, it never writes or
 * deletes anything in the user's Drive.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { integrationTokens } from "@/db/schema";

const PROVIDER = "google_drive";
const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const API_KEY = process.env.GOOGLE_API_KEY?.trim();

const clientId = () => process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";

export function googleConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

/** The redirect URI must match the Google Cloud console exactly. */
export function googleRedirectUri(req: Request): string {
  const override = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (override) return override;
  return `${new URL(req.url).origin}/api/admin/integrations/google/callback`;
}

export function googleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: SCOPES.join(" "),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number };

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<void> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (HTTP ${res.status})`);
  const token = (await res.json()) as TokenResponse;

  let email: string | null = null;
  try {
    const me = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (me.ok) email = ((await me.json()) as { email?: string }).email ?? null;
  } catch {
    // Email is a nicety; authorisation still succeeded.
  }

  const expiresAt = new Date(Date.now() + (token.expires_in ?? 3600) * 1000);
  await db
    .insert(integrationTokens)
    .values({
      provider: PROVIDER,
      accountEmail: email,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: integrationTokens.provider,
      set: {
        accountEmail: email,
        accessToken: token.access_token,
        // Google only returns a refresh token on first consent; keep the old one.
        ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
        expiresAt,
        updatedAt: new Date(),
      },
    });
}

export async function googleStatus(): Promise<{ connected: boolean; email: string | null }> {
  const [row] = await db
    .select({ email: integrationTokens.accountEmail })
    .from(integrationTokens)
    .where(eq(integrationTokens.provider, PROVIDER))
    .limit(1);
  return { connected: Boolean(row), email: row?.email ?? null };
}

export async function getGoogleAccessToken(): Promise<string> {
  const [row] = await db.select().from(integrationTokens).where(eq(integrationTokens.provider, PROVIDER)).limit(1);
  if (!row) throw new Error("Google Drive is not connected");
  if (row.expiresAt && row.expiresAt.getTime() > Date.now() + 60_000) return row.accessToken;
  if (!row.refreshToken) throw new Error("Google session expired — reconnect Drive");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: row.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("Google session expired — reconnect Drive");
  const token = (await res.json()) as TokenResponse;
  await db
    .update(integrationTokens)
    .set({
      accessToken: token.access_token,
      expiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000),
      updatedAt: new Date(),
    })
    .where(eq(integrationTokens.provider, PROVIDER));
  return token.access_token;
}

export type DriveEntry = {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime?: string;
  isFolder: boolean;
};

export type DriveList = { entries: DriveEntry[]; nextPageToken?: string; folderId: string };

const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Google Drive query strings are single quoted; escape user text safely. */
function escapeQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Turn a Google API failure into something actionable. The most common cause is
 * that the Drive API was never enabled for the Cloud project, which otherwise
 * surfaces as a bare HTTP 403.
 */
async function driveFailure(res: Response): Promise<Error> {
  let message = "";
  let reason = "";
  try {
    const body = (await res.json()) as {
      error?: { message?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] };
    };
    message = body.error?.message ?? "";
    reason = body.error?.errors?.[0]?.reason ?? body.error?.details?.[0]?.reason ?? "";
  } catch {
    // Non-JSON error body.
  }
  if (
    reason === "SERVICE_DISABLED" ||
    reason === "accessNotConfigured" ||
    /has not been used in project|is disabled/i.test(message)
  ) {
    return new Error(
      "The Google Drive API is not enabled for this Google Cloud project. Open Google Cloud Console → APIs & Services → Library → ‘Google Drive API’ → Enable, wait a couple of minutes, then retry.",
    );
  }
  if (reason === "insufficientPermissions" || /insufficient permission|insufficient authentication scopes/i.test(message)) {
    return new Error(
      "Google granted this app too little access. Disconnect Drive and connect again, ticking the Drive permission on the consent screen.",
    );
  }
  if (res.status === 401) return new Error("Google session expired — reconnect Drive");
  return new Error(`Google Drive returned HTTP ${res.status}${message ? ` — ${message}` : ""}`);
}

type RawDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  shortcutDetails?: { targetId?: string; targetMimeType?: string };
};

/**
 * Drive shortcuts point at a file or folder that lives elsewhere. Follow them,
 * otherwise a shortcut to a folder looks like an unsupported file in both the
 * browser and the importer.
 */
function toEntry(f: RawDriveFile): DriveEntry {
  const targetId = f.shortcutDetails?.targetId;
  const mimeType = f.shortcutDetails?.targetMimeType ?? f.mimeType;
  return {
    id: targetId ?? f.id,
    name: f.name,
    mimeType,
    size: f.size ? Number(f.size) : undefined,
    modifiedTime: f.modifiedTime,
    isFolder: mimeType === FOLDER_MIME,
  };
}

/**
 * List one folder (default: Drive root), or search the whole Drive when `q` is
 * given. Folders are listed alongside files so the UI can be browsed.
 */
export async function listDriveEntries(
  opts: { folderId?: string; q?: string; pageToken?: string } = {},
): Promise<DriveList> {
  const token = await getGoogleAccessToken();
  const folderId = opts.folderId?.trim() || "root";
  const search = opts.q?.trim();
  const filters = ["trashed = false"];
  if (search) {
    filters.push(`name contains '${escapeQuery(search)}'`);
  } else {
    filters.push(`'${escapeQuery(folderId)}' in parents`);
  }
  const params = new URLSearchParams({
    pageSize: "100",
    fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,shortcutDetails(targetId,targetMimeType))",
    orderBy: "folder,name",
    q: filters.join(" and "),
    // Without corpora=allDrives, a name search only covers My Drive and misses
    // files that live in shared drives — which is where most folders here are.
    corpora: "allDrives",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (opts.pageToken) params.set("pageToken", opts.pageToken);
  const res = await fetch(`${DRIVE}?${params.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await driveFailure(res);
  const data = (await res.json()) as { files?: RawDriveFile[]; nextPageToken?: string };
  return {
    entries: (data.files ?? []).map(toEntry),
    nextPageToken: data.nextPageToken,
    folderId,
  };
}

/**
 * Recursive name search inside one folder. Google's global search only covers
 * My Drive and items shared directly with the user, so files that merely live
 * inside a shared folder never show up there. Walking the tree guarantees the
 * folder you are looking at is actually searched.
 */
export async function searchFolderTree(
  folderId: string,
  query: string,
  opts: { maxResults?: number; maxScanned?: number; budgetMs?: number } = {},
): Promise<{ entries: DriveEntry[]; truncated: boolean }> {
  const needle = query.trim().toLowerCase();
  if (!needle) return { entries: [], truncated: false };
  const maxResults = opts.maxResults ?? 200;
  const maxScanned = opts.maxScanned ?? 900;
  const deadline = Date.now() + (opts.budgetMs ?? 8_000);

  const out: DriveEntry[] = [];
  const queue: { id: string; depth: number }[] = [{ id: folderId, depth: 0 }];
  const scanned = { n: 0 };
  let truncated = false;

  // Three folders in flight at once: a 87-folder tree is otherwise minutes of
  // sequential round trips. The budget keeps the request responsive.
  const worker = async () => {
    for (;;) {
      if (!queue.length || out.length >= maxResults || scanned.n >= maxScanned || Date.now() > deadline) {
        if (queue.length || out.length >= maxResults || scanned.n >= maxScanned) truncated = true;
        return;
      }
      const next = queue.shift();
      if (!next) return;
      let children: DriveEntry[];
      try {
        children = await listAllChildren(next.id, 3);
      } catch {
        continue;
      }
      scanned.n += children.length;
      for (const child of children) {
        if (child.isFolder && next.depth < 6) queue.push({ id: child.id, depth: next.depth + 1 });
        if (child.name.toLowerCase().includes(needle)) out.push(child);
        if (out.length >= maxResults) {
          truncated = true;
          return;
        }
      }
    }
  };

  await Promise.all([worker(), worker(), worker()]);
  return { entries: out, truncated };
}

/** Every child of a folder, following pagination (bounded so a huge Drive can't hang a request). */
export async function listAllChildren(folderId: string, maxPages = 8): Promise<DriveEntry[]> {
  const out: DriveEntry[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const res = await listDriveEntries({ folderId, pageToken });
    out.push(...res.entries);
    if (!res.nextPageToken) break;
    pageToken = res.nextPageToken;
  }
  return out;
}

export type DriveFileMeta = { id: string; name: string; mimeType: string; size?: number };

export async function getDriveFileMeta(id: string): Promise<DriveFileMeta> {
  const token = await getGoogleAccessToken();
  const params = new URLSearchParams({
    fields: "id,name,mimeType,size,shortcutDetails(targetId,targetMimeType)",
    supportsAllDrives: "true",
  });
  const res = await fetch(`${DRIVE}/${encodeURIComponent(id)}?${params.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await driveFailure(res);
  const entry = toEntry((await res.json()) as RawDriveFile);
  return { id: entry.id, name: entry.name, mimeType: entry.mimeType, size: entry.size };
}

/**
 * Open the binary stream for a file so the importer can write straight to disk
 * instead of buffering a multi-gigabyte video in memory.
 */
export async function openDriveFile(
  id: string,
  range?: string,
): Promise<{
  meta: DriveFileMeta;
  body: ReadableStream<Uint8Array>;
  contentLength?: number;
  status: number;
  contentRange?: string;
}> {
  const meta = await getDriveFileMeta(id);
  const token = await getGoogleAccessToken();
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (range) headers.range = range;
  const res = await fetch(`${DRIVE}/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, {
    headers,
  });
  if (!res.ok && res.status !== 206) throw await driveFailure(res);
  if (!res.body) throw new Error("Google Drive returned an empty file");
  return {
    meta,
    body: res.body,
    contentLength: res.headers.get("content-length") ? Number(res.headers.get("content-length")) : meta.size,
    status: res.status === 206 ? 206 : 200,
    contentRange: res.headers.get("content-range") ?? undefined,
  };
}

/** Buffer download, used only for small files and the database-storage fallback. */
export async function downloadDriveFile(id: string): Promise<{ name: string; mimeType: string; buf: Buffer }> {
  const meta = await getDriveFileMeta(id);
  const { body } = await openDriveFile(id);
  const buf = Buffer.from(await new Response(body).arrayBuffer());
  return { name: meta.name, mimeType: meta.mimeType, buf };
}

export async function disconnectGoogle(): Promise<void> {
  await db.delete(integrationTokens).where(eq(integrationTokens.provider, PROVIDER));
}

/** Exposed for diagnostics only — never logged with a value. */
export function driveApiKeyConfigured(): boolean {
  return Boolean(API_KEY);
}
