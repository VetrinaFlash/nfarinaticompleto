import { ensureAuth, sha256, sessionCookie } from "../functions/_lib/auth.js";
export async function adminCookie(env) {
  await ensureAuth(env);
  const token = "a".repeat(64);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO security_sessions(token_hash,kind,username,expires_at,created_at) VALUES(?,?,?,?,?)",
  )
    .bind(
      await sha256(token),
      "admin",
      "TESTADMIN",
      Date.now() + 3600000,
      Date.now(),
    )
    .run();
  return sessionCookie("admin", token).split(";")[0];
}
export function d1(db) {
  return {
    prepare(sql) {
      let args = [];
      return {
        sql,
        bind(...a) {
          args = a;
          return this;
        },
        async first() {
          return db.prepare(sql).get(...args) || null;
        },
        async all() {
          return { results: db.prepare(sql).all(...args) };
        },
        async run() {
          const r = db.prepare(sql).run(...args);
          return {
            meta: {
              last_row_id: Number(r.lastInsertRowid),
              changes: Number(r.changes),
            },
          };
        },
      };
    },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const stmt of statements) out.push(await stmt.run());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
