# E-Read

Design requirements and future card defaults: [AGENTS.md](AGENTS.md).


An academic bookstore demo with a searchable catalog, customer accounts, Midtrans sandbox checkout, purchased-library records, transaction history, and administrator catalog management. All titles share a public sample reader; buying a title does not deliver a private ebook.

## Status and structure

Browser presentation has been reviewed and accepted by the project owner, including desktop and phone screenshots. The owner reported zero vulnerabilities in both packages. Run the checks below for fresh verification; screenshots do not establish payment or security correctness.

| Directory | Purpose |
| --- | --- |
| `frontend/` | Next.js 15 App Router, React 19, Tailwind CSS 4, native dialog/CSS animation, dnd-kit and Lucide |
| `backend/` | Express 4, MongoDB/Mongoose, JWT, bcrypt and the Midtrans SDK |
| `tests/` | Node assert regression checks and isolated database integration suites |

Use Node.js 24 (`.nvmrc`, supported range >=24 <25) and local MongoDB or a dedicated development database. The original black/neutral/yellow design and Cal Sans typography are retained.

## Local setup

From this application's root:

```powershell
cd backend
npm ci
Copy-Item .env.example .env
```

Copy environment examples only for a new installation; keep existing local values when updating. Configure the ignored `backend/.env`:

| Variable | Value/purpose |
| --- | --- |
| `PORT` | `5000` by default |
| `MONGODB_URI` | Local MongoDB URI or dedicated development database |
| `JWT_SECRET` | Random secret of at least 32 bytes |
| `FRONTEND_URL` | `http://localhost:3001`, without a trailing slash |
| `MIDTRANS_SERVER_KEY` | Sandbox Server Key used for all outbound API calls |
| `MIDTRANS_CLIENT_KEY` | Sandbox Client Key from the same account |
| `MIDTRANS_SIGNATURE_KEY` | Explicit webhook SHA512 signing secret; standard Snap uses the merchant Server Key here too |
| `MIDTRANS_WEBHOOK_DEBUG` | `false` normally; `true` temporarily enables detailed signature-mismatch diagnostics |

Generate a JWT secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and put it only in the ignored environment file. Never commit or share actual secrets. No fallback between API and signature keys is implemented; do not replace the API Server Key with a different signing secret.

```powershell
npm start
```

The API starts after MongoDB connects. New databases start with an empty catalog; add books through the administrator interface. The former dummy-book seed command has been removed.

In another terminal, from this application's root:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3001. Set `NEXT_PUBLIC_API_URL` to the backend origin (normally `http://localhost:5000`); changes require rebuilding a production frontend. The portfolio can continue on port 3000. To serve production output, stop the frontend, run `npm run build`, then `npm start -- -p 3001`; never rebuild over a running production server's `.next` directory.

For a local administrator, temporarily add `ADMIN_USERNAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` to the ignored backend environment, run `npm run create-admin`, then remove those setup values. Passwords require at least eight characters and at most 72 UTF-8 bytes. The script creates an administrator; it does not promote an existing customer.

## Accounts, catalog and administration

Account screens verify tokens and current roles with the server. Expiry, focus/page restoration and account/storage changes trigger revalidation. Temporary connection failures retain a previously verified identity only until its known expiry; edits and checkout pause with Retry connection. Initial unverified sessions remain blocked. Stale requests cannot replace another account's data or clear a newer login. Changing a password revokes that account's sessions; customer and administrator storage slots remain separate.

The public catalog isolates malformed records, rejects duplicate IDs, and provides targeted refresh. Missing/unsafe images use the local cover fallback. Library and history load independently with separate errors/retries. All reader links open the same clearly identified public sample text; the original reference PDF is not served.

Administrators can add, edit and reorder books. Validation matches API text/year/whole-IDR/image rules. A successful save followed by failed catalog refresh requires Reload catalog, not another addition. API contracts:

- `GET /api/books/admin/catalog` returns `{ books, revision }`.
- `POST /api/books` requires a UUID `Idempotency-Key`; same-key retries return/repair the same addition.
- `PATCH /api/books/:id` accepts full book details and the current `version` (`__v`); conflicts return 409.
- `POST /api/books/reorder` accepts `{ bookIds, revision }`, up to 1,000 books; competing revisions are rejected. Public `GET /api/books` remains an array.

These endpoints require administrator authorization. Ordering is held in a single `Catalog` document; legacy `Book.order` remains for compatibility. Creation and appending to the catalog are separate writes; retries repair interrupted appends. Unlisted records stay visible at the end. Use replica-set transactions if indivisible publication is needed. No destructive book deletion is provided. Reorder uses a dedicated drag/keyboard handle; use Space, arrows, Space.

Unconfirmed saves keep their exact submitted payload, creation UUID/edit version and outcome in administrator-scoped `sessionStorage`, without credentials. Recovery survives closing the form and reloading the tab, but is not a durable cross-tab backup. Resume pending save explicitly; nothing retries automatically. Other catalog mutations stay paused. Storage failure prevents a new request. Discarding requires a fresh catalog review and acknowledgement; it never undoes a server save. Conflicting edits require reviewing the latest details and explicitly rebasing the retained draft before saving again.

## Sandbox checkout and notifications

Buy opens Midtrans's hosted sandbox checkout. Prices and ownership come from the server; browser totals are estimates. Orders allow 1-50 unique books and at most 100,000,000 IDR. A unique index permits one active checkout per customer. Matching ready orders can resume; different or unavailable item IDs require review of the previous order's books and total first. The new selection never silently replaces an existing order.

Keep the backend running on port 5000 and expose it with ngrok for external callbacks:

```powershell
ngrok http http://127.0.0.1:5000
```

Save `https://YOUR-NGROK-DOMAIN/api/midtrans/notification` as the Midtrans **sandbox Payment Notification URL**. Update it if the domain changes. The endpoint accepts POST, so opening it in a browser is not a notification test. The local frontend origin can remain `http://localhost:3001` for testing on the same computer.

The notification route uses raw JSON before the general JSON parser. It preserves `gross_amount` as a string and verifies SHA512(`order_id + status_code + gross_amount + MIDTRANS_SIGNATURE_KEY`) with a timing-safe comparison. Malformed notifications receive 400 and invalid signatures 403. Standard Snap documentation uses the merchant Server Key for signing; the explicit override is retained for this installation. Verify the real payment notification before assuming a dashboard test proves an alternative signing configuration.

Valid notifications are saved in `PaymentRecovery` before status verification. A subsequent gateway 404 or processing failure receives 200 and remains pending for reconciliation. If durable storage fails, return 503 so Midtrans retries. HTTP 200 acknowledges delivery, not payment. Payment/library changes still require a matching server-fetched order, amount and currency. Accepted capture or settlement grants access idempotently; late pending/failure events cannot undo confirmed payment. Detailed signature logs are off by default and never print the secret.

A return URL or screenshot does not confirm payment. The receipt page refreshes server status and keeps the order reference on errors. Confirmed payment remains confirmed if cart cleanup or library synchronization fails. Account changes and dismissed dialogs suppress stale checkout redirects.

## Payment recovery

A timeout, missing status or elapsed time does not establish failure. An ambiguous checkout remains locked as `creating`/`uncertain`; explicit creation rejection or verified terminal unpaid status releases it. Check again on the same receipt. Resume sandbox checkout only when offered. Historical orders without saved URLs cannot resume from E-Read. Never delete an unresolved order, force an unlock, or create another account to bypass its lock.

Trusted local operator commands, run from `backend/`:

```powershell
npm run reconcile-payment -- --pending
npm run reconcile-payment -- ORDER_REFERENCE
npm run reconcile-payment -- ORDER_REFERENCE --apply
```

The first command lists the oldest 100 pending recovery references plus the total. Preview fetches current gateway status without changing payment/library/recovery records. `--apply` makes one fresh status request for that invocation, validates the result, applies it and prints the same gateway result. It changes only the referenced order, idempotent library grants and the matching recovery marker. An older attempt cannot clear newer pending work. No automatic worker is installed; receipt checks and operator commands perform recovery.

Before applying, check the exact reference, amount and status in the same sandbox account's dashboard. Pending/challenged capture remains locked. Verified cancel/deny/expire/failure can release the checkout. Unsupported refund states stop for separate investigation. This tool does not cancel payments, recreate missing checkout URLs or bulk-unlock orders. If abandoning a payment, use the gateway's supported sandbox cancellation/expiry workflow, then reconcile its verified status. A failed lookup alone does not justify unlocking it.

After apply, including an error, preview again: payment may already be saved while library synchronization failed. Retry the same order to repair access. If no verified terminal outcome is available, retain the lock and investigate using the reference. Keep support notes private and omit credentials/customer secrets.

## Verification

```powershell
# From frontend/
npm test
npm run lint
npm run build
npm audit
# From backend/
npm test
npm run test:accounts
npm run test:admin
npm run test:payments
npm run test:archive
npm audit
```

Regression checks use real source with browser/API doubles. Backend `npm test` also exercises native bcrypt/password middleware without MongoDB. Integration suites use unique disposable `eread_account_test_*`, `eread_admin_test_*` and `eread_checkout_test_*` databases, remove them afterward, and never use application customer records; gateway calls are simulated. Keep MongoDB available. Run audits from your network-enabled terminal; commit compatible manifest/lock changes together after checks, without blindly using `npm audit fix --force`. Never copy archived native modules into a fresh install.

Acceptance checklist for future changes:

- Register, sign in/out, switch accounts and change passwords; old credentials must fail afterward.
- Complete single/cart sandbox payments and verify receipt, history and library. Check pending/cancel/decline, duplicate notifications, ownership boundaries and different-selection resume.
- Add/edit/reorder as admin, test competing changes and interrupted-save recovery; customers must not access admin APIs.
- Inspect 320/375/768/1280px layouts, 200% zoom and long titles; no clipped controls or page-wide overflow.
- Test keyboard focus, Escape, nested dialogs, restored focus, background-scroll locking, touch/software keyboard and the requested full motion even with OS reduced motion enabled. Verify keyboard reorder separately.

## Publication and operating limits

Publish E-Read in a separate repository; the parent portfolio ignores this working folder. Exclude `.env`, customer data, `node_modules`, `.next`, archives, dependency backups and reference PDFs. Keep lockfiles, environment examples, tests and public assets. See [ASSET-CREDITS.md](ASSET-CREDITS.md) for artwork and edition references. Desktop and phone screenshots are stored separately from the application. Third-party artwork redistribution permissions remain unverified.

This is a sandbox demo with a shared public reader, no real payments and no refund/private-document delivery implementation. JWTs use localStorage. Rate limits are single-process: authenticated requests use verified customer identity, webhooks use the signed order after verification, and unauthenticated requests remain IP-based. Proxy trust stays disabled; do not trust arbitrary forwarded headers. HTTPS, production session design, trusted proxy configuration, shared rate limiting and unattended reconciliation need separate deployment work. Legacy data may require review; use a synthetic development database for demonstrations.

## Current presentation and account features

The dark bookstore uses Cal Sans, Bricolage Grotesque and Cormorant Garamond. The first seven catalog books form a continuously looping Featured shelf; the remaining books appear in a responsive cover-only collection. Search and genre filters use the current catalog. Local covers and prepared decorative cutouts give the supplied twelve books individual card and detail-dialog treatments; unknown or failed artwork uses the shared fallback. Full design requirements live in [AGENTS.md](AGENTS.md).

Each customer has a server-stored cart, purchased library and transaction history. Profile edits require the current password; email changes do not verify mailbox ownership. Cart updates preserve other-device changes, and verified purchases remove owned items. Offline reading is planned, not implemented. All reader links open the same original public sample.

For phone testing, put both devices on the same trusted network. Set frontend NEXT_PUBLIC_API_URL to http://YOUR-PC-IP:5000 and backend FRONTEND_URL to http://YOUR-PC-IP:3001. Restart both servers and open that frontend address on both devices. If necessary, start development with npm run dev -- --hostname 0.0.0.0. Backend CORS allows the configured frontend origin; update both values when the PC address changes.
