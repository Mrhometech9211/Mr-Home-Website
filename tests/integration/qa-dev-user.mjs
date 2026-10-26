/**
 * Local-dev QA helper: create/reset a dedicated QA super-admin directly in the
 * local PGlite database so authenticated admin-API smoke tests can run.
 * Local environment only — never production.
 */
import { PGlite } from "@electric-sql/pglite";
import { scryptSync, randomBytes } from "node:crypto";

const EMAIL = process.argv[2] || "qa@mrhome.dev";
const PASSWORD = process.argv[3] || "QaAdmin#2026x";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

const pg = new PGlite("./.pglite-data", { skipMigrations: true });
await pg.waitReady;
await pg.query(
  `insert into users (email, name, password_hash, role, active) values ($1,'QA Admin',$2,'SUPER_ADMIN',true)
   on conflict (email) do update set password_hash = excluded.password_hash, role = 'SUPER_ADMIN', active = true`,
  [EMAIL, hashPassword(PASSWORD)],
);
const r = await pg.query(`select id, email, role from users where email = $1`, [EMAIL]);
console.log("qa user ready:", JSON.stringify(r.rows[0]));
await pg.close();
