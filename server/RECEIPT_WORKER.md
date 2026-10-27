# Receipt worker: controlled pilot

The original single-request test mode is disabled by default. It needs no new SQL migration: the existing queue has all
fields and service-role privileges required for conditional updates. This version
does not enable general customer delivery or change enqueue_receipt's held default.

The worker runs in the existing Node server. It only claims one explicitly configured
request whose recipient matches the allowlisted number exactly. It does not use the
legacy scheduler or its SMS_TEST_NUMBER redirection. SMS_AUTOMATION_ENABLED must stay
false during this pilot; it controls a different legacy marketing scheduler.

Configuration (Railway backend only; never VITE variables):

```
RECEIPT_WORKER_ENABLED=false
RECEIPT_WORKER_MODE=test
RECEIPT_TEST_REQUEST_ID=<existing receipt_queue UUID>
RECEIPT_TEST_NUMBER=<your own number in +1 format, matching that request>
```

Existing ORG_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY, TWILIO_ACCOUNT_SID,
TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER are required. No credentials belong in Git.

Activation after review:
1. Confirm the selected invoice, destination and current held status.
2. Configure the exact request and allowlisted number; set RECEIPT_WORKER_ENABLED=true
   and deploy. Held requests still do not send.
3. In the Railway backend console (working directory containing package.json), run
   `npm run receipt:release-test -- <same request UUID>` **only when ready to send**.
   This performs a scoped held -> pending update; it is not a dry run.
4. Within approximately ten seconds, check SMS Receipt / Refresh status and Twilio logs.
5. Set RECEIPT_WORKER_ENABLED=false after the pilot.

At claim, a single conditional UPDATE changes pending/attempts=0 to processing/attempts=1.
Competing replicas cannot both claim that row. Revalidation calls the existing SQL RPC
to recheck the sale, totals, user organization and consent before any provider call.
No change to the stored destination or audited body is permitted.

Twilio autoRetry is explicitly disabled. A valid returned SID is recorded as sent,
meaning accepted by the provider, **not confirmed delivered**. Explicit HTTP 4xx
rejections fail (408 is ambiguous); timeouts/5xx/missing confirmation become uncertain.
Nothing is automatically retried. Interrupted processing older than 15 minutes becomes
uncertain when the configured worker runs again. Never reset attempts manually to retry:
first reconcile with Twilio, because a message may already exist there.

The database transaction and Twilio request cannot be one atomic transaction. A crash
between them can leave no SMS or an unrecorded accepted SMS; the conservative policy is
to stop and investigate rather than risk duplicate messages. Consent can also change
after the last database check. Delivery callbacks, production-wide release controls,
operator reconciliation UI and opt-out webhook audit remain follow-up work.

Tests mock provider calls and the store. The race test verifies worker behavior against
an atomic store contract; it is not an integration test against production PostgreSQL.
Run `npm test` from server. No tests send real SMS or modify production data.

## Explicit delivery from the Fluxe SMS button

This mode requires `database/migration_receipt_delivery.sql`, applied ONCE after
the existing queue migration. Do not rerun the original CREATE TABLE migration.
It adds delivery_mode and service-role-only RPCs request_receipt_send and
claim_receipt_send. Existing rows remain test/held (or their existing status).
Migration alone sends nothing. Browser roles cannot call either RPC.

POST /api/receipts/send validates the authenticated org, persisted sale, requested
phone and receiptRequested=true, then invokes request_receipt_send. This reuses
enqueue_receipt checks and releases held -> pending in the same transaction.
It never resets attempts or terminal outcomes. Old held requests require entering
the original phone, checking consent, verifying, and explicitly confirming Send.
The legacy /requests endpoint continues to save held requests, even in live mode.

Deploy code with sending OFF, apply the new migration, then use Railway variables:

```
RECEIPT_QUEUE_ENABLED=true
RECEIPT_WORKER_ENABLED=true
RECEIPT_WORKER_MODE=live
RECEIPT_SEND_ENABLED=true
RECEIPT_LIVE_TEST_NUMBER=<your own normalized +1 number>
SMS_AUTOMATION_ENABLED=false
```

The optional RECEIPT_LIVE_TEST_NUMBER restricts both the send endpoint AND worker
to that destination. Use it for the first end-to-end UI test; the original
RECEIPT_TEST_REQUEST_ID / RECEIPT_TEST_NUMBER settings are ignored in live mode.
Use an eligible sale without a previously sent/attempted request. Confirm the UI
shows test sending, enter your number, verify, then press Send receipt by SMS.
This sends a real SMS; never test with an unrelated customer's linked sale.
After checking the result, disable RECEIPT_WORKER_ENABLED and RECEIPT_SEND_ENABLED
until ready for general delivery. To allow all eligible customers, remove
RECEIPT_LIVE_TEST_NUMBER only as an explicit rollout step and redeploy.

The live worker claims one pending/live request per ten-second tick via an atomic
FOR UPDATE SKIP LOCKED RPC. Outcomes are written to the exact claimed ID and org.
Stale processing rows become uncertain; they are never automatically resent.
Three new requests per recipient/24h remain enforced; release also limits old
held requests to three live releases per recipient/24h. No backlog is bulk-released.
Flags take effect after Railway deployment. In-flight provider calls may finish
during shutdown. Never reset attempts or clear provider IDs to retry a message.

Validation:
- `npm test` in server: API/config/worker/auth tests with mocked providers.
- `node tests/run-receipt-delivery-browser.mjs`: isolated Chrome, mocked backend.
- `tests/receiptDelivery.database.mjs`: actual in-memory PostgreSQL via a temporary
  @electric-sql/pglite installation; set PGLITE_MODULE to its dist/index.js path.
  Covers migrations, idempotency, claims, scope, eligibility and RPC privileges.
  PGlite does not test competing independent PostgreSQL sessions; verify parallel
  claims in a staging Supabase database before scaling to multiple replicas.

Delivery callbacks remain a separate follow-up: sent still means provider accepted,
not confirmed delivered. This change does not enable marketing automation.
