import { adminIdentity, session, json, rateLimit } from "./_lib/auth.js";
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://applepay.cdn-apple.com https://pay.google.com https://cdn.jsdelivr.net https://gateway.sumup.com https://*.sumup.com https://*.sumup.io; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; img-src 'self' https: data: blob:; connect-src 'self' https://pay.google.com https://applepay.cdn-apple.com https://*.sumup.com https://*.sumup.io; frame-src https://pay.google.com https://*.sumup.com https://*.sumup.io https://www.google.com https://maps.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
};
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url),
    path = url.pathname;
  let response;
  try {
    if (
      /\.(?:sql|md|toml|patch|test\.mjs)$/.test(path) ||
      /^\/(?:functions|tests|scripts|\.git|\.env)(?:\/|$)/.test(path)
    )
      response = new Response("Not found", { status: 404 });
    else if (
      !["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"].includes(
        request.method,
      )
    )
      response = json({ error: "Metodo non consentito" }, 405);
    else if (["POST", "PUT", "DELETE"].includes(request.method)) {
      const origin = request.headers.get("Origin");
      if (
        path !== "/api/payment-notification" &&
        origin &&
        origin !== url.origin
      )
        response = json({ error: "Origine non autorizzata" }, 403);
      else if (Number(request.headers.get("Content-Length") || 0) > 65536)
        response = json({ error: "Richiesta troppo grande" }, 413);
      else {
        const bytes = await boundedBody(request);
        if (bytes === null)
          response = json({ error: "Richiesta troppo grande" }, 413);
        else if (
          bytes.length ||
          (!["DELETE"].includes(request.method) &&
            ![
              "/admin/logout",
              "/staff/logout",
              "/admin/setup-magazzino",
              "/admin/upgrade-warehouse",
              "/admin/repair-menu-options",
            ].includes(path))
        ) {
          if (
            !/^application\/json(?:;|$)/i.test(
              request.headers.get("Content-Type") || "",
            )
          )
            response = json({ error: "Richiesto application/json" }, 415);
          else {
            try {
              const data = JSON.parse(new TextDecoder().decode(bytes));
              if (
                !data ||
                typeof data !== "object" ||
                Array.isArray(data) ||
                !validShape(data)
              )
                response = json({ error: "Richiesta JSON non valida" }, 400);
            } catch {
              response = json({ error: "Richiesta JSON non valida" }, 400);
            }
          }
        }
      }
    }
    if (
      !response &&
      path.startsWith("/admin/") &&
      !["/admin/login", "/admin/check", "/admin/logout"].includes(path)
    ) {
      if (!(await adminIdentity(env, request)))
        response = json({ error: "Non autorizzato" }, 401);
    }
    if (
      !response &&
      path.startsWith("/staff/") &&
      !["/staff/login", "/staff/check", "/staff/logout"].includes(path)
    ) {
      if (!(await session(env, request, "staff")))
        response = json({ error: "Non autorizzato" }, 401);
    }
    if (
      !response &&
      request.method === "POST" &&
      [
        "/api/checkout",
        "/paga",
        "/api/orders",
        "/api/validate-promo",
        "/api/payment-notification",
      ].includes(path)
    ) {
      if (
        !(await rateLimit(
          env,
          request,
          path,
          path === "/api/checkout" ? 15 : 60,
          300,
        ))
      )
        response = json(
          { error: "Troppe richieste. Riprova tra qualche minuto." },
          429,
          { "Retry-After": "300" },
        );
    }
    if (!response) response = await context.next();
  } catch (error) {
    console.error("Request failed", path, error?.name);
    response = json({ error: "Errore temporaneo del servizio. Riprova." }, 500);
  }
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders))
    headers.set(key, value);
  headers.delete("Access-Control-Allow-Origin");
  headers.delete("Access-Control-Allow-Credentials");
  if (/^\/(?:admin|staff)\//.test(path))
    headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function boundedBody(request) {
  if (!request.body) return new Uint8Array();
  const reader = request.clone().body.getReader(),
    chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) {
      reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
function validShape(value, depth = 0) {
  if (depth > 15) return false;
  if (value === null || typeof value !== "object") return true;
  if (Array.isArray(value))
    return value.length <= 500 && value.every((v) => validShape(v, depth + 1));
  return Object.entries(value).every(
    ([key, v]) =>
      !["__proto__", "prototype", "constructor"].includes(key) &&
      validShape(v, depth + 1),
  );
}
