import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { d1, adminCookie } from "./helpers.mjs";
import {
  SESSION_TTL_SECONDS,
  sessionCookie,
  session,
  sha256,
} from "../functions/_lib/auth.js";
import { onRequestGet as checkAdmin } from "../functions/admin/check.js";

function request(cookie = "") {
  return new Request("https://example.com/admin/check", {
    headers: { Cookie: cookie },
  });
}

test("trusted-device cookie is persistent and admin check refreshes it", async () => {
  const db = new DatabaseSync(":memory:");
  const env = { DB: d1(db) };
  const cookie = await adminCookie(env);

  assert.equal(SESSION_TTL_SECONDS, 365 * 24 * 60 * 60);
  assert.match(sessionCookie("admin", "a".repeat(64)), /Max-Age=31536000/);

  // helpers.mjs intentionally creates a short test session. session() must renew it.
  const identity = await session(env, request(cookie), "admin");
  assert.ok(identity);
  const row = db.prepare(
    "SELECT expires_at FROM security_sessions WHERE token_hash=?"
  ).get(await sha256("a".repeat(64)));
  assert.ok(row.expires_at > Date.now() + 300 * 24 * 60 * 60 * 1000);

  const checked = await checkAdmin({ env, request: request(cookie) });
  assert.equal((await checked.clone().json()).authenticated, true);
  assert.match(checked.headers.get("set-cookie") || "", /Max-Age=31536000/);

  db.prepare("UPDATE security_sessions SET expires_at=1").run();
  const expired = await checkAdmin({ env, request: request(cookie) });
  assert.equal((await expired.json()).authenticated, false);
});
