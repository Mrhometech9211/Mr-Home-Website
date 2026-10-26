/**
 * Local QA: replacing an existing project brochure must keep ONE live row,
 * move it to the new object, and delete the old object without orphaning the
 * new one. Mock R2 only.
 */
const BASE = process.env.QA_BASE || "http://localhost:3344";
const SLUG = process.argv[2] || "serene-hills-villas";

const res = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({ email: "qa@mrhome.dev", password: "QaAdmin#2026x" }),
});
const cookie = (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")])
  .map((c) => c.split(";")[0]).filter(Boolean).join("; ");
const authHeaders = { cookie, "content-type": "application/json", origin: BASE };

const projects = (await (await fetch(`${BASE}/api/admin/projects?pageSize=100`, { headers: { cookie } })).json()).data;
const project = projects.find((p) => p.slug === SLUG);
if (!project) throw new Error("project not found");

const existing = ((await (await fetch(`${BASE}/api/admin/brochures?pageSize=100`, { headers: { cookie } })).json()).data ?? []).find((b) => b.projectId === project.id);

async function uploadPdf(tag, size) {
  const pdf = Buffer.concat([Buffer.from(`%PDF-1.4\n${tag}\n`), Buffer.alloc(size, 0x20), Buffer.from("\n%%EOF\n")]);
  const init = (await (await fetch(`${BASE}/api/admin/brochures/upload`, {
    method: "POST", headers: authHeaders,
    body: JSON.stringify({ projectId: project.id, filename: `${tag}.pdf`, contentType: "application/pdf", size: pdf.length }),
  })).json()).data;
  await fetch(init.putUrl, { method: "PUT", headers: { "content-type": "application/pdf" }, body: pdf });
  await fetch(`${BASE}/api/admin/brochures/upload/complete`, { method: "POST", headers: authHeaders, body: JSON.stringify({ id: init.id }) });
  return { id: init.id, size: pdf.length, pdf };
}

let baseId = existing?.id;
if (!baseId) {
  const a = await uploadPdf("qa-base", 2048);
  baseId = a.id;
  console.log(`created base brochure row ${baseId}`);
} else {
  console.log(`using existing brochure row ${baseId}`);
}

const b = await uploadPdf("qa-replacement", 4096);
const patch = await fetch(`${BASE}/api/admin/brochures/${baseId}`, {
  method: "PATCH", headers: authHeaders, body: JSON.stringify({ newBrochureId: b.id }),
});
console.log("PATCH", patch.status);

const list = ((await (await fetch(`${BASE}/api/admin/brochures?pageSize=100`, { headers: { cookie } })).json()).data ?? []);
const forProject = list.filter((r) => r.projectId === project.id);
const row = list.find((r) => r.id === baseId);
const tempStillListed = list.some((r) => r.id === b.id);
console.log(JSON.stringify({ rowsForProject: forProject.length, rowSize: row?.size, expectedSize: b.size, tempStillListed }, null, 0));

const lead = await (await fetch(`${BASE}/api/brochures/lead`, {
  method: "POST", headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({ projectSlug: project.slug, name: "QA Replace Bot", phone: "+971 50 555 4433", city: "Dubai", country: "UAE" }),
})).json();
const dl = await fetch(BASE + lead.url, { redirect: "manual" });
const location = dl.headers.get("location");
const bytes = location ? Buffer.from(await (await fetch(location)).arrayBuffer()) : Buffer.alloc(0);
console.log(JSON.stringify({ download: dl.status, bytes: bytes.length, expected: b.size, replaced: bytes.includes("qa-replacement") }));

const ok =
  patch.status === 200 &&
  forProject.length === 1 &&
  row?.size === b.size &&
  !tempStillListed &&
  bytes.length === b.size &&
  bytes.includes("qa-replacement");
console.log(ok ? "REPLACE_FLOW_OK" : "REPLACE_FLOW_FAILED");

// Leave the project with no brochure (restores the pristine seeded state).
await fetch(`${BASE}/api/admin/brochures/${baseId}`, { method: "DELETE", headers: { cookie } });
process.exit(ok ? 0 : 1);
