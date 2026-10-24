import { AUTH_RELEASE, BOOTSTRAP_CREDENTIALS } from "./auth-bootstrap.js";

const initialized = new WeakMap();

export const SESSION_COOKIES = {
  admin: "__Host-nfarinati_admin_v2",
  staff: "__Host-nfarinati_staff_v2",
};

// Trusted-device session:
// - the cookie survives browser/app restarts;
// - the server renews an active session before it gets close to expiry;
// - logout/revocation still invalidates the token immediately.
// 365 days is intentionally finite: a device not used for a full year must log in again.
export const SESSION_TTL_SECONDS = 365 * 24 * 60 * 60;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;
const SESSION_RENEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });

export async function sha256(value) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export function randomToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export function sessionToken(request, kind) {
  const cookieName = SESSION_COOKIES[kind];
  if (!cookieName) return null;
  const entry = (request.headers.get("Cookie") || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieName + "="));
  const token = entry?.slice(cookieName.length + 1) || "";
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export async function ensureAuth(env) {
  if (!env.DB) throw Error("Database non disponibile");
  if (initialized.has(env.DB)) return initialized.get(env.DB);

  const work = (async () => {
    await env.DB.batch([
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS security_credentials (kind TEXT NOT NULL, username TEXT NOT NULL, password_hash TEXT NOT NULL, PRIMARY KEY(kind,username))",
      ),
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS security_sessions (token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, username TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)",
      ),
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS security_migrations (name TEXT PRIMARY KEY)",
      ),
      env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS security_rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL)",
      ),
    ]);

    if (
      !(await env.DB.prepare(
        "SELECT name FROM security_migrations WHERE name=?",
      )
        .bind(AUTH_RELEASE)
        .first())
    ) {
      await env.DB.batch([
        ...BOOTSTRAP_CREDENTIALS.map((u) =>
          env.DB.prepare(
            "INSERT INTO security_credentials(kind,username,password_hash) VALUES(?,?,?) ON CONFLICT(kind,username) DO UPDATE SET password_hash=excluded.password_hash",
          ).bind(u.kind, u.username, u.hash),
        ),
        env.DB.prepare("DELETE FROM security_sessions"),
        env.DB.prepare(
          "INSERT OR IGNORE INTO security_migrations(name) VALUES(?)",
        ).bind(AUTH_RELEASE),
      ]);
    }
  })();

  initialized.set(env.DB, work);
  try {
    await work;
  } catch (e) {
    initialized.delete(env.DB);
    throw e;
  }
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || password.length > 256) return false;

  const [algorithm, rounds, salt, expected] = String(encoded || "").split("$");
  if (
    algorithm !== "pbkdf2-sha256" ||
    Number(rounds) !== 100000 ||
    !salt ||
    !/^[a-f0-9]{64}$/.test(expected || "")
  )
    return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: Number(rounds),
      salt: new TextEncoder().encode(salt),
    },
    key,
    256,
  );
  const actual = new Uint8Array(bits);
  const wanted = Uint8Array.from(expected.match(/../g), (x) => parseInt(x, 16));
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= actual[i] ^ wanted[i];
  return diff === 0;
}

export async function session(env, request, kind) {
  await ensureAuth(env);

  const token = sessionToken(request, kind);
  if (!token) return null;

  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT kind,username,expires_at FROM security_sessions WHERE token_hash=? AND kind=?",
  )
    .bind(tokenHash, kind)
    .first();

  if (!row) return null;

  const now = Date.now();
  if (Number(row.expires_at) <= now) {
    // Clean up an expired token instead of leaving dead rows in D1.
    await env.DB.prepare(
      "DELETE FROM security_sessions WHERE token_hash=? AND kind=?",
    )
      .bind(tokenHash, kind)
      .run();
    return null;
  }

  // Sliding renewal: devices that keep using the panel remain trusted.
  if (Number(row.expires_at) - now <= SESSION_RENEW_WINDOW_MS) {
    const renewedUntil = now + SESSION_TTL_MS;
    await env.DB.prepare(
      "UPDATE security_sessions SET expires_at=? WHERE token_hash=? AND kind=?",
    )
      .bind(renewedUntil, tokenHash, kind)
      .run();
    row.expires_at = renewedUntil;
  }

  if (kind === "admin") {
    return {
      role: "admin",
      username: row.username,
      kind,
      expires_at: Number(row.expires_at),
    };
  }

  const user = await env.DB.prepare(
    "SELECT id,username,display_name,role FROM staff_users WHERE username=? AND active=1",
  )
    .bind(row.username)
    .first();

  return user
    ? { ...user, kind, expires_at: Number(row.expires_at) }
    : null;
}

export async function adminIdentity(env, request) {
  const admin = await session(env, request, "admin");
  if (admin) return admin;

  const staff = await session(env, request, "staff");
  return staff?.role === "admin" ? staff : null;
}

export async function login(env, request, kind) {
  await ensureAuth(env);

  if (!(await rateLimit(env, request, "login", 10, 900)))
    return json(
      { ok: false, error: "Troppi tentativi. Riprova tra 15 minuti." },
      429,
      { "Retry-After": "900" },
    );

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Richiesta non valida" }, 400);
  }

  const username =
    typeof body.username === "string" ? body.username.trim().toUpperCase() : "";

  if (
    !username ||
    username.length > 80 ||
    typeof body.password !== "string" ||
    body.password.length > 256
  )
    return json({ ok: false, error: "Credenziali errate" }, 401);

  let user = null;
  if (kind === "staff")
    user = await env.DB.prepare(
      "SELECT id,username,display_name,role,password_hash FROM staff_users WHERE username=? AND active=1",
    )
      .bind(username)
      .first();

  const row =
    kind === "admin"
      ? await env.DB.prepare(
          "SELECT password_hash FROM security_credentials WHERE kind=? AND username=?",
        )
          .bind(kind, username)
          .first()
      : user;

  const encoded = row?.password_hash || BOOTSTRAP_CREDENTIALS[0].hash;
  const legacy = kind === "staff" && /^[a-f0-9]{64}$/.test(encoded);
  const valid = legacy
    ? (await sha256(`nfarinati-staff:${username}:${body.password}`)) === encoded
    : await verifyPassword(body.password, encoded);

  if (!row || !valid)
    return json({ ok: false, error: "Credenziali errate" }, 401);

  if (legacy) {
    const salt = randomToken().slice(0, 32);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(body.password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: 100000,
        salt: new TextEncoder().encode(salt),
      },
      key,
      256,
    );
    const hash = [...new Uint8Array(bits)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");

    await env.DB.prepare(
      "UPDATE staff_users SET password_hash=? WHERE id=? AND password_hash=?",
    )
      .bind(`pbkdf2-sha256$100000$${salt}$${hash}`, user.id, encoded)
      .run();
  }

  if (user) delete user.password_hash;

  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO security_sessions(token_hash,kind,username,expires_at,created_at) VALUES(?,?,?,?,?)",
  )
    .bind(
      await sha256(token),
      kind,
      username,
      now + SESSION_TTL_MS,
      now,
    )
    .run();

  return { token, user };
}

export function sessionCookie(kind, token, age = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIES[kind]}=${token}; HttpOnly; Secure; Path=/; Max-Age=${age}; SameSite=Strict`;
}

export async function logout(env, request, kind) {
  await ensureAuth(env);

  const token = sessionToken(request, kind);
  if (token)
    await env.DB.prepare(
      "DELETE FROM security_sessions WHERE token_hash=? AND kind=?",
    )
      .bind(await sha256(token), kind)
      .run();

  return json(
    { ok: true },
    200,
    { "Set-Cookie": sessionCookie(kind, "", 0) },
  );
}

export async function rateLimit(env, request, scope, limit, seconds) {
  await ensureAuth(env);

  const now = Date.now();
  const window = Math.floor(now / (seconds * 1000));
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const key = await sha256(scope + ":" + ip + ":" + window);

  const result = await env.DB.prepare(
    "INSERT INTO security_rate_limits(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits",
  )
    .bind(key, (window + 1) * seconds * 1000)
    .first();

  await env.DB.prepare(
    "DELETE FROM security_rate_limits WHERE key IN (SELECT key FROM security_rate_limits WHERE expires_at<? LIMIT 100)",
  )
    .bind(now)
    .run();

  return result.hits <= limit;
}
