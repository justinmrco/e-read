# E-Read operations

Local administration and Midtrans sandbox recovery. Start with the [setup guide](../README.md#local-setup).

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
