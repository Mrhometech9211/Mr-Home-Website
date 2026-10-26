/**
 * Local end-to-end QA for the direct-to-R2 upload pipeline (mock R2 only).
 * Requires the dev server to run with:
 *   R2_BUCKET_NAME=qa-bucket R2_ENDPOINT=http://127.0.0.1:9876
 *   R2_ACCESS_KEY_ID=mockkey R2_SECRET_ACCESS_KEY=mocksecret R2_ACCOUNT_ID=mock
 * and scripts/mock-r2.mjs listening on 9876. Never points at production.
 */
const BASE = process.env.QA_BASE || "http://localhost:3344";
const EMAIL = process.env.QA_EMAIL || "qa@mrhome.dev";
const PASSWORD = process.env.QA_PASSWORD || "QaAdmin#2026x";

let pass = 0;
let fail = 0;
function ok(label, cond, detail = "") {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  return (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""])
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

function makePdf(bytes) {
  const head = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n");
  const tail = Buffer.from("\n%%EOF\n");
  const pad = Buffer.alloc(Math.max(0, bytes - head.length - tail.length), 0x20);
  return Buffer.concat([head, pad, tail]);
}

const cookie = await login();
const auth = { "content-type": "application/json", origin: BASE, cookie };

// --- pick a published project without a brochure ---------------------------
const projectsRes = await fetch(`${BASE}/api/admin/projects?pageSize=100`, { headers: { cookie } });
const projects = (await projectsRes.json()).data ?? [];
const brochuresRes = await fetch(`${BASE}/api/admin/brochures?pageSize=100`, { headers: { cookie } });
const brochures = (await brochuresRes.json()).data ?? [];
const taken = new Set(brochures.map((b) => b.projectId));
const withBrochure = projects.find((p) => taken.has(p.id) && p.published);
const target = projects.find((p) => !taken.has(p.id) && p.published) ?? projects.find((p) => !taken.has(p.id));
if (!target) throw new Error("no project available for the upload test");
console.log(`target project: #${target.id} ${target.slug} (published=${target.published})`);

const pdf = makePdf(6 * 1024 * 1024);
console.log(`file: ${(pdf.length / 1024 / 1024).toFixed(1)} MB`);

// --- unauthorized ----------------------------------------------------------
const unauth = await fetch(`${BASE}/api/admin/brochures/upload`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({ projectId: target.id, filename: "qa.pdf", contentType: "application/pdf", size: pdf.length }),
});
ok("unauthenticated init is rejected", unauth.status === 401, `HTTP ${unauth.status}`);

// --- invalid type ----------------------------------------------------------
const badType = await fetch(`${BASE}/api/admin/brochures/upload`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ projectId: target.id, filename: "qa.txt", contentType: "text/plain", size: 10 }),
});
ok("non-PDF init is rejected", badType.status === 400, `HTTP ${badType.status}`);

// --- valid init → PUT → complete -------------------------------------------
const initRes = await fetch(`${BASE}/api/admin/brochures/upload`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ projectId: target.id, filename: "qa-6mb.pdf", contentType: "application/pdf", size: pdf.length }),
});
const init = (await initRes.json()).data;
ok("6 MB init returns a presigned direct PUT", initRes.status === 201 && init.mode === "direct" && !!init.putUrl, `HTTP ${initRes.status} mode=${init?.mode}`);
const put = await fetch(init.putUrl, { method: "PUT", headers: { "content-type": "application/pdf" }, body: pdf });
ok("presigned PUT stores the object", put.status === 200, `HTTP ${put.status}`);

const complete = await fetch(`${BASE}/api/admin/brochures/upload/complete`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ id: init.id }),
});
ok("completion verifies and finalises the row", complete.status === 200, `HTTP ${complete.status} ${(await complete.clone().text()).slice(0, 160)}`);

const listAfter = await fetch(`${BASE}/api/admin/brochures?pageSize=100`, { headers: { cookie } });
const listed = ((await listAfter.json()).data ?? []).find((b) => b.id === init.id);
ok("row metadata persisted (Postgres) with exact size", !!listed && listed.size === pdf.length, listed ? `size=${listed.size}` : "row missing");

// --- gated public download -------------------------------------------------
const leadRes = await fetch(`${BASE}/api/brochures/lead`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({ projectSlug: target.slug, name: "QA Brochure Bot", phone: "+971 50 999 8877", city: "QA City", country: "QA Land" }),
});
const lead = await leadRes.json();
ok("download gate issues a signed URL", leadRes.status === 201 && typeof lead.url === "string", `HTTP ${leadRes.status}`);
const dl = await fetch(BASE + lead.url, { redirect: "manual" });
const location = dl.headers.get("location");
ok("brochure download redirects to short-lived storage URL", dl.status === 302 && !!location, `HTTP ${dl.status}`);
if (location) {
  const obj = await fetch(location);
  const bytes = Buffer.from(await obj.arrayBuffer());
  ok("storage URL returns the exact PDF bytes", obj.status === 200 && bytes.length === pdf.length && bytes.subarray(0, 5).toString() === "%PDF-", `HTTP ${obj.status} bytes=${bytes.length}`);
  ok("download filename header is preserved", /attachment/i.test(obj.headers.get("content-disposition") ?? ""), obj.headers.get("content-disposition") ?? "none");
}

// --- invalid contents rejected --------------------------------------------
const badInitRes = await fetch(`${BASE}/api/admin/brochures/upload`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ projectId: target.id, filename: "fake.pdf", contentType: "application/pdf", size: 12 }),
});
const badInit = (await badInitRes.json()).data;
if (badInit?.putUrl) {
  await fetch(badInit.putUrl, { method: "PUT", headers: { "content-type": "application/pdf" }, body: Buffer.from("not a pdf at all") });
  const badComplete = await fetch(`${BASE}/api/admin/brochures/upload/complete`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ id: badInit.id }),
  });
  ok("non-PDF bytes are rejected at completion", badComplete.status === 400, `HTTP ${badComplete.status}`);
  const after = await fetch(`${BASE}/api/admin/brochures?pageSize=100`, { headers: { cookie } });
  const stillListed = ((await after.json()).data ?? []).some((b) => b.id === badInit.id);
  ok("rejected upload leaves no brochure row", !stillListed);
} else {
  ok("non-PDF bytes are rejected at completion", false, "init unexpectedly failed");
}

// --- project without a brochure gets a graceful 404 ------------------------
const other = projects.find((p) => !taken.has(p.id) && p.id !== target.id && p.published);
if (withBrochure && other) {
  const none = await fetch(`${BASE}/api/brochures/lead`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ projectSlug: other.slug, name: "QA No Brochure", phone: "+971 50 111 0000", city: "QA", country: "QA" }),
  });
  const body = await none.json();
  ok("project without a brochure returns a guidance message", none.status === 404 && /not available yet/i.test(body.error ?? ""), `HTTP ${none.status} ${body.error ?? ""}`);
}

// --- cleanup ---------------------------------------------------------------
const del = await fetch(`${BASE}/api/admin/brochures/${init.id}`, { method: "DELETE", headers: { cookie } });
ok("cleanup removes the QA brochure", del.ok, `HTTP ${del.status}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
