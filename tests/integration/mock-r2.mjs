/**
 * Minimal S3-compatible R2 emulator for LOCAL QA ONLY (never production).
 * Supports the operations src/lib/r2.ts issues: PutObject, UploadPart,
 * HeadObject, GetObject (+Range), DeleteObject, CreateMultipartUpload,
 * CompleteMultipartUpload, AbortMultipartUpload. Auth headers are ignored —
 * real R2 verifies SigV4; this emulator deliberately trusts the loopback.
 * Storage: on-disk folder ./tmp-mr2 (objects) + in-memory multipart sessions.
 *
 * Run:  node tests/integration/mock-r2.mjs  (listens on 127.0.0.1:9876)
 * Point the app at it with:
 *   R2_ACCOUNT_ID=mock R2_ACCESS_KEY_ID=mockkey R2_SECRET_ACCESS_KEY=mocksecret
 *   R2_BUCKET_NAME=qa-bucket R2_ENDPOINT=http://127.0.0.1:9876
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PORT = Number(process.env.MOCK_R2_PORT || 9876);
const ROOT = path.resolve(process.cwd(), "tmp-mr2");
fs.mkdirSync(ROOT, { recursive: true });

const objects = new Map(); // key -> { etag }
const parts = new Map(); // `${uploadId}:${partNumber}` -> path
const sessions = new Map(); // uploadId -> { key }

function objPath(key) {
  const safe = key.replace(/[^a-zA-Z0-9._/-]/g, "_").replace(/\.\./g, "__");
  const p = path.join(ROOT, safe);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

function xml(res, code, body) {
  res.writeHead(code, { "content-type": "application/xml" });
  res.end(body);
}

const server = http.createServer((req, res) => {
  // Browser (fetch/XHR) CORS support: the admin panel PUTs presigned objects
  // cross-origin from localhost. Loopback QA tool — reflect the origin.
  res.setHeader("access-control-allow-origin", req.headers.origin || "*");
  res.setHeader("access-control-allow-methods", "GET, PUT, POST, DELETE, OPTIONS, HEAD");
  res.setHeader("access-control-allow-headers", req.headers["access-control-request-headers"] || "*");
  res.setHeader("access-control-expose-headers", "ETag");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url, "http://127.0.0.1");
  const q = url.searchParams;
  // path-style: /{bucket}/{key...}
  const [, bucket, ...keyParts] = url.pathname.split("/");
  const key = keyParts.join("/");
  const chunks = [];
  let logging = `${req.method} ${url.pathname}${url.search}`;

  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const objFile = key ? objPath(`${bucket}/${key}`) : null;
    const etag = crypto.randomBytes(16).toString("hex");

    // CreateMultipartUpload  → POST /{bucket}/{key}?uploads
    if (req.method === "POST" && q.has("uploads")) {
      const uploadId = crypto.randomBytes(12).toString("hex");
      sessions.set(uploadId, { key });
      xml(res, 200, `<CreateMultipartUploadResult><Bucket>${bucket}</Bucket><Key>${key}</Key><UploadId>${uploadId}</UploadId></CreateMultipartUploadResult>`);
      return;
    }
    // UploadPart → PUT /{bucket}/{key}?partNumber=N&uploadId=U
    if (req.method === "PUT" && q.has("partNumber") && q.has("uploadId")) {
      const p = objPath(`_parts/${q.get("uploadId")}/${q.get("partNumber")}`);
      fs.writeFileSync(p, body);
      parts.set(`${q.get("uploadId")}:${q.get("partNumber")}`, p);
      res.writeHead(200, { etag: `"${etag}"` });
      res.end();
      return;
    }
    // CompleteMultipartUpload → POST /{bucket}/{key}?uploadId=U
    if (req.method === "POST" && q.has("uploadId")) {
      const data = body.toString();
      const partNums = [...data.matchAll(/<PartNumber>(\d+)<\/PartNumber>/g)].map((m) => Number(m[1]));
      const uploadId = q.get("uploadId");
      const dest = objFile;
      const out = fs.createWriteStream(dest, { flags: "w" });
      let i = 0;
      const next = () => {
        if (i >= partNums.length) {
          fs.rmSync(path.dirname(objPath(`_parts/${uploadId}/x`)), { recursive: true, force: true });
          objects.set(key, { etag: "complete" });
          xml(res, 200, `<CompleteMultipartUploadResult><Location>http://127.0.0.1:9876/${bucket}/${key}</Location><Bucket>${bucket}</Bucket><Key>${key}</Key><ETag>"${etag}"</ETag></CompleteMultipartUploadResult>`);
          return;
        }
        const rs = fs.createReadStream(parts.get(`${uploadId}:${partNums[i]}`));
        rs.on("error", () => xml(res, 400, "<Error><Code>InvalidPart</Code></Error>"));
        rs.pipe(out, { end: false });
        rs.on("finish", () => { i++; next(); });
      };
      next();
      return;
    }
    // AbortMultipartUpload → DELETE /{bucket}/{key}?uploadId=U
    if (req.method === "DELETE" && q.has("uploadId")) {
      parts.delete(`${q.get("uploadId")}`);
      sessions.delete(q.get("uploadId"));
      res.writeHead(204);
      res.end();
      return;
    }

    switch (req.method) {
      case "PUT": { // PutObject (presigned)
        if (!key) return xml(res, 400, "<Error><Code>KeyRequired</Code></Error>");
        fs.writeFileSync(objFile, body);
        objects.set(key, { etag });
        res.writeHead(200, { etag: `"${etag}"`, "content-length": "0" });
        res.end();
        return;
      }
      case "HEAD": {
        if (!objects.has(key) || !fs.existsSync(objFile)) { res.writeHead(404); res.end(); return; }
        const st = fs.statSync(objFile);
        res.writeHead(200, { "content-length": String(st.size), etag: `"${objects.get(key).etag}"` });
        res.end();
        return;
      }
      case "GET": {
        if (!objects.has(key) || !fs.existsSync(objFile)) { res.writeHead(404); res.end(); return; }
        const buf = fs.readFileSync(objFile);
        // Presigned GET response-override params (real R2 sets these headers).
        if (q.get("response-content-disposition")) res.setHeader("content-disposition", q.get("response-content-disposition"));
        if (q.get("response-content-type")) res.setHeader("content-type", q.get("response-content-type"));
        const range = req.headers.range;
        const m = range && /^bytes=(\d+)-(\d+)?/.exec(range);
        if (m) {
          const start = Number(m[1]);
          const end = m[2] ? Number(m[2]) : Math.min(start + 1024 * 1024, buf.length - 1);
          const slice = buf.subarray(start, end + 1);
          res.writeHead(206, { "content-range": `bytes ${start}-${end}/${buf.length}`, "content-length": String(slice.length) });
          res.end(slice);
          return;
        }
        res.writeHead(200, { "content-length": String(buf.length), etag: `"${objects.get(key).etag}"` });
        res.end(buf);
        return;
      }
      case "DELETE": {
        objects.delete(key);
        fs.rmSync(objFile, { force: true });
        res.writeHead(204);
        res.end();
        return;
      }
      default:
        xml(res, 405, "<Error><Code>MethodNotAllowed</Code></Error>");
    }
  });
  res.on("finish", () => console.log(logging, "→", res.statusCode));
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock-r2 listening on http://127.0.0.1:${PORT} (bucket store: ${ROOT})`));
