# Local sales persistence

Production sales now use IndexedDB, scoped by configured Supabase URL and organization
(machine email fallback). Demo sales retain their separate existing localStorage flow.
Startup waits for the local read before rendering the POS.

Migration imports all legacy records and archives the exact original JSON in the same
transaction. Existing IndexedDB records win over an older legacy copy; the archive
preserves conflicts for investigation. The original localStorage key is removed only
after transaction completion, and only if another tab has not changed its contents.
Malformed data or a failed transaction leave the original key untouched.

Checkout writes only the affected invoice, not the downloaded report history. A new
invoice is locally pending until the existing cloud writer confirms sale, items and
payments. Server number reconciliation replaces the temporary key atomically. Local
edits/refunds remain pending conservatively, since some fields have no cloud writer.
Polling keeps pending local data and legacy refunds. All legacy records remain in
IndexedDB; there is no trimming or automatic deletion of old sales.

This is persistence, **not an automatic offline replay queue**. Existing failed/partial
cloud writes still need reconciliation; do not blindly reinsert payments or sales.
IndexedDB can also fail (permissions/disk quota); such failures retain the visible warning.
Do not clear browser data. Old deployed clients must be refreshed between sales so they
stop writing the legacy key. No SQL migration or production fixture is required.

Run `node tests/run-local-sales-browser.mjs` using Node with built-in WebSocket support.
Uses installed Chrome by default; `TEST_BROWSER` can point to another Chromium binary.
Creates a disposable browser profile and loopback server, real IndexedDB transactions,
synthetic invoices, and simulated cloud responses for the actual useSales hook. No
production authentication, network requests to Supabase, dependency installation, or
customer messages are used. The temporary profile path is printed for inspection.

Also run `node --test src/utils/salesCache.test.js src/services/salesPagination.test.js`
and `npm run build`. In a kiosk, update between sales, verify the next normal checkout
and an older invoice in My Report. The storage tests do not substitute for that check.
