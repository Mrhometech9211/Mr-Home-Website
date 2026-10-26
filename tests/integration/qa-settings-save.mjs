/**
 * Local repro/regression check for Admin → Settings saves.
 * Mirrors the SettingsForm behaviour: sends the WHOLE settings object back on
 * every save (Notifications tab included). Run against a local dev server only.
 *
 *   node scripts/qa-settings-save.mjs [base]
 */
const BASE = process.argv[2] || process.env.QA_BASE || "http://localhost:3344";
const EMAIL = process.env.QA_EMAIL || "qa@mrhome.dev";
const PASSWORD = process.env.QA_PASSWORD || "QaAdmin#2026x";

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const cookie = (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""])
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
  return cookie;
}

function report(label, res, body) {
  console.log(label.padEnd(38), res.status, JSON.stringify(body).slice(0, 420));
}

const cookie = await login();
const get = await fetch(`${BASE}/api/admin/settings`, { headers: { cookie } });
const payload = await get.json();
report("GET /api/admin/settings", get, { ok: get.ok, lypFields: payload?.data?.listYourProperty?.contactFields });

const put = await fetch(`${BASE}/api/admin/settings`, {
  method: "PUT",
  headers: { "content-type": "application/json", origin: BASE, cookie },
  body: JSON.stringify(payload.data),
});
const b = await put.json().catch(() => ({}));
report("PUT (full settings, as the form)", put, b);

// Simulate the admin toggling one List Your Property field off and saving.
const next = { ...payload.data, listYourProperty: { ...payload.data.listYourProperty } };
next.listYourProperty.contactFields = next.listYourProperty.contactFields.filter((f) => f !== "bedrooms");
const put2 = await fetch(`${BASE}/api/admin/settings`, {
  method: "PUT",
  headers: { "content-type": "application/json", origin: BASE, cookie },
  body: JSON.stringify(next),
});
const b2 = await put2.json().catch(() => ({}));
report("PUT (toggle bedrooms off)", put2, b2);

// And back on again.
const put3 = await fetch(`${BASE}/api/admin/settings`, {
  method: "PUT",
  headers: { "content-type": "application/json", origin: BASE, cookie },
  body: JSON.stringify(payload.data),
});
report("PUT (restore all fields)", put3, await put3.json().catch(() => ({})));
