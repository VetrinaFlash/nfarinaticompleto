# Security release — October 2026

Existing account usernames and passwords are retained at the owner's request. They are not rotated by this release. Passwords previously exposed in repository history remain a residual risk; this release must not be described as eliminating that risk.

## Authentication

Legacy HMAC cookies and the public development signing key are no longer accepted. Sessions now use 256-bit random tokens, stored only as SHA-256 digests in D1, with a server-enforced 12-hour lifetime. Logout deletes the server session. Staff status and role are read on every request. All administrative APIs use the same authorization helper; middleware also protects the route families.

The existing administrator password is represented by a salted PBKDF2 verifier. Staff passwords migrate from the legacy format to salted PBKDF2 after a successful login, preserving the password. Web Crypto uses 100,000 PBKDF2-SHA256 iterations, compatible with the deployed Workers runtime. This is a runtime-compatible improvement, not a claim of meeting the higher current OWASP password-work-factor recommendation. Credential changes and MFA remain recommended separately.

The migration creates `security_credentials`, `security_sessions`, `security_migrations`, and `security_rate_limits`. It does not delete products, orders, drafts or staff visibility settings. Old cookies require users to log in again with their existing credentials. Do not roll back authentication to the legacy password verifier after staff hashes have migrated; roll forward with a tested fix.

## Orders and payments

`POST /api/checkout` accepts product IDs, quantities, format selections and options. It calculates all prices from active products in D1, including the existing 10% online discount, optional active promotion and delivery fee. It stores an immutable order intent and returns a random receipt token. Browser-supplied prices and totals are ignored.

`POST /api/orders` requires that receipt token. Card orders are saved only after an authenticated SumUp lookup verifies checkout identity, reference, EUR amount, PAID status and a matching SUCCESSFUL transaction. Cash orders are saved as cash, without claiming payment. D1 batches atomically save orders, CRM totals and finalization; repeated confirmation and provider notifications do not duplicate orders or spending.

`POST /api/payment-notification` is a SumUp callback. The notification itself is not trusted as payment proof; the server retrieves the checkout. Unknown events are ignored. Provider failures are returned as errors so notifications can be retried. The success page also retries verification when the customer reloads it.

Existing `SUMUP_SECRET_KEY` and `SUMUP_EMAIL` bindings are retained. `SUMUP_MERCHANT_CODE` and `GOOGLE_PAY_MERCHANT_ID` are optional supported bindings. No payment credentials appear in browser responses or source. Real card charging is not part of automated verification; provider responses are simulated in the payment regression tests.

## Request and rendering protection

Same-origin state-changing browser requests, JSON content types, a 64 KiB body limit, persistent login and order rate limits, bounded pagination, safe error messages and security headers are enforced by middleware. Source/schema/test paths are not served as website assets. Dynamic customer/order/catalog content is escaped, string IDs are passed through data attributes rather than interpolated JavaScript, and CSV exports neutralize formula prefixes.

The CSP retains `unsafe-inline` for the existing inline UI handlers; removing it requires a separate migration of those handlers. CSP is defense in depth, not a replacement for output escaping.

## Verification

Run `node --test tests/*.test.mjs`. Tests cover legacy token rejection across administrative endpoints, staff/admin separation, expiry, logout, password preservation and migration, rate limiting, request guards, tampered carts, product formats/options, provider payment checks, atomic order confirmation, warehouse migrations and per-account visibility. Build using `wrangler pages functions build functions`.

Additional local checks exercise the compiled Worker in Miniflare with actual D1, catalog pricing across all current formats, and the existing admin/staff/menu/confirmation DOM flows. Before merging, verify the complete preview tree matches the tested source; after deployment verify legacy access is rejected, existing credentials still work, and unauthorized API requests cannot read customer or warehouse data.
