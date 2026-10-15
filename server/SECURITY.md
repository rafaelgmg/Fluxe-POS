# Backend security preparation — stage 1

This is a local preparation, not a production release or a completed multi-tenant messaging service.

- `/api/health` is public liveness only. `/api/status` requires a validated Supabase session.
- Except for POST `/api/receipts/authorize`, other API routes require `app_metadata.backend_role = admin` on the Auth user, verified via Supabase `auth.getUser(token)`. User metadata, employee names, local roles and request body roles are not authorization.
- The backend requires `ORG_ID` and accepts only that organization. Existing JSON files, templates and scheduler are organization-wide; never share this deployment or data directory between organizations.
- Do not grant backend administrator permission to the shared kiosk machine account. A kiosk can verify receipt eligibility through the dedicated authorization route, but cannot send arbitrary messages. Employee authentication is still needed for administration; kiosk sends and administrative operations deliberately return 403. Sales directly to Supabase remain separate.
- Public mock account login was removed. It did not issue a verifiable session.
- Customer and location references supplied to the backend are checked against the authenticated organization before service-role operations.
- Twilio inbound SMS requires a valid signature and `TWILIO_SMS_WEBHOOK_URL` matching the exact external URL configured in Twilio, including any query string. Missing configuration fails closed.
- The default bind address is `127.0.0.1`. Future hosting requires explicitly configuring `HOST` and `FRONTEND_URL`; this change alone does not make the service production-ready.
- Existing kiosks using `setup-autostart.ps1` still launch `server.js`. For compatibility, when bound explicitly to `127.0.0.1` or `::1`, it registers the legacy drawer handler before API authentication. This handler accepts only direct loopback requests, rejects forwarded requests, and remains behind the existing CORS policy. A network-bound deployment does not register it. `drawer-server.js` remains an alternative; do not run both on port 3001.

## Validation

Run `node --test server/security.test.js server/localDrawer.test.js` from the repository root. Tests use mocked Auth, resource lookups and hardware handlers; they do not load `.env`, start the production server, access Supabase, send messages or open a drawer.

## Required before cloud activation

Implement employee identity and scoped receipt authorization; migrate JSON storage and scheduled jobs to an organization-scoped persistent queue; derive receipts and recipients from confirmed sales; enforce consent and recipient limits server-side; add idempotency and retries; audit deployed Supabase RLS/views/RPCs; test with isolated provider credentials. The existing scheduler still uses its existing automation flag and JSON data. Do not enable it as part of this stage.

No migrations, environment values, Auth metadata, provider settings or deployments are changed by this preparation.

## Stage 2: receipt authorization (read-only)

`POST /api/receipts/authorize` accepts `{ saleId, phone, receiptRequested: true }` with the existing verified organization session. No administrator grant is needed. It only returns eligibility and a preview; it cannot send, enqueue, schedule, or modify records. The `authorized` response is not an authorization token and must never be trusted by a future sending endpoint.

The server loads the sale by UUID AND authenticated organization, requires completed status, nonempty items/payments, and matching item, tax/tip and payment totals. It builds the SMS from persisted data, not client text or totals. References to another organization's sale return not found. The phone parser explicitly supports US/Canada numbers only, matching the current transport without silently truncating foreign numbers.

For a linked customer, the phone must match a non-archived customer in the same organization. For a guest sale without a linked customer, the kiosk may enter a number and confirm that the customer requested the receipt; this is an operator assertion, not proof of phone ownership. Matching CRM records (including archived records) are checked for SMS opt-out using their normalized phone field. Database errors fail closed. No marketing permission is inferred from a transactional receipt request.

The modal displays a server-generated preview and explicitly says nothing was sent or scheduled. Offline sales without a confirmed Supabase ID cannot be verified. The sale completion screen now retains the Supabase ID returned by the save operation. Cash drawer calls and hardware code are untouched by this stage.

Before real sending: persist the customer request, verified auth user, recipient and sale in the queue; revalidate status/consent; enforce per-sale/recipient idempotency and rate limits atomically. No persistent consent audit or duplicate-send guarantee exists at this read-only stage. This still grants organization-level access, not employee/location-level access, because the existing machine session represents the organization.

Tests: `node --test server/security.test.js server/localDrawer.test.js server/receiptAuthorization.test.js`. All database/provider access is simulated. No migration or live configuration change is required to prepare this code.

## Stage 3: persistent receipt requests (prepared, not activated)

POST `/api/receipts/requests` accepts the same three fields as authorization and re-runs eligibility checks. Only the verified server identity supplies organization and requesting Auth user. The RPC rechecks sale status/totals, requesting organization, and consent before committing. It saves the server-rendered message and explicit kiosk request source. This records the machine account, not an independently verified employee identity.

Apply `database/migration_receipt_queue.sql` only after explicit approval and the isolated checks in `database/receipt_queue_validation.md`. Afterwards, enabling `RECEIPT_QUEUE_ENABLED=true` in the server environment permits saving requests; it DOES NOT enable delivery. Without the flag or migration the endpoint fails closed and never claims a request was saved. No real .env has been modified.

Rows begin `held`, with zero attempts. One SMS receipt per organization/sale is enforced by a unique constraint and a sale row lock. Repeated requests return the existing id without overwriting the original request audit. A different recipient returns 409. A per-organization/recipient advisory transaction lock serializes a limit of three new receipt requests per rolling 24 hours; repeats of the same sale do not consume the limit. Browser roles have no direct queue or RPC access.

No worker reads this table yet, no held records are released automatically, and the legacy JSON scheduler has NOT been migrated or connected to it. SMS_AUTOMATION_ENABLED is unrelated to this queue. Do not interpret queue uniqueness as exactly-once SMS delivery. Provider timeout recovery and worker concurrency belong to the delivery stage.

The UI verifies first, then offers Save request on hold. It displays an id/status only after database confirmation. To recover after a lost response or backend restart, repeat the same sale/phone request; the database returns the same record. A standalone history/status polling screen is not part of this stage.

Local tests: `npm test` in server/. RPC/database responses are simulated; actual database concurrency and permissions still require isolated PostgreSQL validation.

## Stage 4: kiosk request/status integration

The post-sale modal retains the confirmed Supabase sale ID and number. No receipt
is requested solely because a sale was completed; the operator must enter the phone
and confirm the customer request. History -> invoice detail -> SMS receipt / status
opens the same flow for previously saved sales.

GET `/api/receipts/requests/:saleId` is available to an authenticated organization
session, with both sale and queue queries scoped to that organization. It returns
only request ID, status, timestamps and last four recipient digits, not full phone,
message body or provider errors. It is read-only and works even when new enqueues
are disabled. Missing schema/database failures are errors, never "no request".

The modal checks status on open and offers manual refresh. It blocks creation until
that check succeeds; an ambiguous enqueue failure forces another status check.
Existing requests (including failed/uncertain/cancelled) are shown without creating
another request. "Sent" means provider submission, not confirmed delivery. There is
no automatic polling, resend, or background offline sale synchronization here.

The queue migration, isolated database tests, backend hosting and worker remain
pending. Local Express URLs resolve separately on each kiosk; cross-kiosk production
operation requires a shared authenticated backend URL with this code deployed. No
environment settings or kiosk installations were changed in this stage.

## Migration review corrections (unapplied revision)

This section supersedes earlier descriptions of body persistence and blocking locks.
The receipt RPC now has four arguments (organization, sale, Auth user, recipient);
Express no longer passes message text. SQL locks the sale and existing items/payments,
validates totals, and renders the authoritative message from those rows in the same
transaction. Browser/Express preview is informational only.

Migration statements use lock_timeout=3s and statement_timeout=30s locally. The RPC
uses a nonblocking recipient advisory lock, a 3s row-lock wait limit, and returns
queue_busy for lock contention/deadlocks. Express bounds its RPC wait to 10s. Aborting
that HTTP wait does not establish whether the database committed: recover by checking
status before retry. No automatic provider call or retry was added.

The queue update trigger advances updated_at and forbids changes to original request
fields. Auth user deletion sets the live FK to NULL, preserving an immutable UUID
snapshot (not a staff identity or phone/email snapshot). The link, when non-null,
must match that snapshot. These database behaviors still require isolated integration
tests as listed in database/receipt_queue_validation.md; mocks are not SQL validation.
