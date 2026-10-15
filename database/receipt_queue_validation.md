# Receipt queue: pre-production validation

Migration is prepared, NOT applied. It depends on existing sales, sale_items,
payments, customers (including sms_consent_status), organizations and auth.users.
The sales composite unique key (id, organization_id) must exist as in schema.sql.

Use an isolated Supabase test project, not a live kiosk database. Review schema and
apply migration_receipt_queue.sql only after explicit authorization. The migration
is transactional, intended to run once and fails rather than silently accepting an
existing incompatible table. No live SMS provider or worker is required.

Prepare two organizations with Auth app_metadata.org_id, completed sales with
matching items/payments and customers. Use the backend service-role connection to
call enqueue_receipt; the browser must not have this permission.

Required integration cases:

1. A valid request creates one held row, attempts=0, original recipient/body,
   requested_at, consent_source and authenticated account UUID.
2. Run two concurrent RPC calls in separate sessions for the same sale and number.
   A contending call may return queue_busy immediately. Retry after checking status;
   successful calls return the same id, with only one row and distinct duplicate flags.
3. Concurrent calls for one sale with different numbers: one succeeds and the
   other returns recipient_conflict (or queue_busy before retry); audit fields remain unchanged.
4. Four concurrent distinct sales to the same recipient in one organization:
   retry queue_busy responses after checking status; at most three rows are created
   in 24 hours and the fourth new request returns rate_limit.
5. Repeating an existing request at the limit still returns its existing id.
6. Cross-organization sale/Auth user, voided sale, partial sale persistence,
   opted-out recipient and wrong linked customer must not insert a row.
7. With anon and authenticated roles, direct table reads/writes and RPC execution
   must fail, even for users with the correct organization. service_role works.
8. Drop the test RPC or disable RECEIPT_QUEUE_ENABLED: frontend must report failure,
   never queued/sent; retry after recovery produces only one record.
9. Restart the backend and repeat a request: same id, demonstrating persistence.
10. Confirm no request triggers Twilio, scheduler JSON writes or the cash drawer.

JavaScript tests mock the RPC contract. They do NOT validate PostgreSQL syntax,
RLS/grants, advisory locks, real concurrency, or deployed schema compatibility.

Do not release held messages automatically on deployment. Before delivery, implement
worker claiming, renewed sale/consent validation, recipient limits, provider status
handling and an uncertain state for ambiguous provider timeouts (never blind retry).
Uniqueness prevents duplicate queue records, not exactly-once provider delivery.

## Review corrections to validate (not yet executed on PostgreSQL)

- RPC signature is now enqueue_receipt(uuid, uuid, uuid, text). There is no message
  argument. An old five-argument call must not exist or be executable. This is a
  revision of the UNAPPLIED migration, not an upgrade script for an existing queue.
- Between preview and enqueue, change the sale/items consistently in test data.
  The stored body must use the updated database values, not the previous preview.
- Hold an update on a sale/item/payment in a second session. The enqueue call must
  wait no more than its 3-second lock timeout per lock, returning queue_busy on lock
  timeout/deadlock without a partial queue insert. Advisory contention returns
  queue_busy immediately. Retries must consult status and preserve idempotency.
- Verify concurrent child inserts cannot enter the snapshot while the sale row is
  locked, and existing child updates/deletes cannot change receipt data until commit.
- A migration statement has a 30-second timeout and 3-second lock timeout. Test that
  failure rolls back all objects in this migration. Roll back any aborted transaction
  before retrying. Do not test contention against production.
- The backend stops waiting for the RPC after 10 seconds. This does NOT prove the
  database cancelled or rolled back. Simulate a lost response after commit and verify
  status recovery returns the existing row; never automatically send or enqueue anew.
- Update queue status in a separate transaction: updated_at must advance automatically
  while requested_at, snapshot ID and message_body remain unchanged. Attempts to
  modify immutable request audit fields must fail.
- Delete only a disposable Auth user in the test project: queue rows must survive,
  requested_by_auth_user_id becomes NULL, and requested_by_auth_user_snapshot remains
  the original UUID. A non-null live reference must equal that snapshot.

The preview remains generated in JavaScript; the persisted authoritative message is
built in SQL from locked rows, ordered by item created_at/id. The preview and saved
body may differ if data changed. The future worker must still recheck consent/status
before provider submission. No claim of a total SQL execution deadline is made by the
function-level lock timeout: it limits lock waits, not all computation.
