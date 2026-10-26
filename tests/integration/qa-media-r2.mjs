/** Local QA (mock R2): pending media rows stay private; SVG active content is rejected. */
const BASE = process.env.QA_BASE || "http://localhost:3344";

const res = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({ email: "qa@mrhome.dev", password: "QaAdmin#2026x" }),
});
const cookie = (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")])
  .map((c) => c.split(";")[0]).filter(Boolean).join("; ");
const auth = { cookie, "content-type": "application/json", origin: BASE };
let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); };

async function init(filename, contentType, size) {
  const r = await fetch(`${BASE}/api/admin/media/upload`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ filename, contentType, size }),
  });
  return { status: r.status, data: (await r.json()).data };
}

// --- pending rows are invisible ------------------------------------------
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
  0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0]);
const pending = await init("qa-pending.png", "image/png", png.length);
ok("media init returns a presigned URL", pending.status === 201 && !!pending.data.putUrl, `HTTP ${pending.status}`);
const served = await fetch(`${BASE}/api/media/${pending.data.id}`);
ok("pending media bytes are NOT served", served.status === 404, `HTTP ${served.status}`);
const adminList = await (await fetch(`${BASE}/api/admin/media?pageSize=100`, { headers: { cookie } })).json();
ok("pending media is hidden from the library", !(adminList.data ?? []).some((m) => m.id === pending.data.id));
await fetch(pending.data.putUrl, { method: "PUT", headers: { "content-type": "image/png" }, body: png });
await fetch(`${BASE}/api/admin/media/upload/cancel`, { method: "POST", headers: auth, body: JSON.stringify({ id: pending.data.id }) });

// --- malicious SVG rejected after upload ---------------------------------
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const bad = await init("qa-bad.svg", "image/svg+xml", svg.length);
ok("SVG init reaches storage", bad.status === 201 && !!bad.data.putUrl, `HTTP ${bad.status}`);
await fetch(bad.data.putUrl, { method: "PUT", headers: { "content-type": "image/svg+xml" }, body: svg });
const done = await fetch(`${BASE}/api/admin/media/upload/complete`, {
  method: "POST", headers: auth, body: JSON.stringify({ id: bad.data.id }),
});
ok("active-content SVG is rejected at finalize", done.status === 400, `HTTP ${done.status}`);
const after = await (await fetch(`${BASE}/api/admin/media?pageSize=100`, { headers: { cookie } })).json();
ok("rejected SVG leaves no media row", !(after.data ?? []).some((m) => m.id === bad.data.id));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
