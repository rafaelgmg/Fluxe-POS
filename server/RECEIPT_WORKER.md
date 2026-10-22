# Receipt worker: controlled pilot

Disabled by default. No new SQL migration is required: the existing queue has all
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
