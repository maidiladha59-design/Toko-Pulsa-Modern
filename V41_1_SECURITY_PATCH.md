# AIDIL STORE v41.1 — Customer Support Security & Reliability Patch

## Changes
- Removed broad `UPDATE` and `DELETE` privileges on `support_tickets` for `anon` and `authenticated`.
- Added atomic `create_support_ticket(subject, category, order_id, message)` RPC.
- Customer-created tickets can only reference an order owned by the authenticated customer.
- Hardened `touch_support_ticket` so USER calls require ticket ownership and ADMIN calls require `is_admin()`.
- Existing admin-only `set_support_ticket_status` remains the controlled workflow mutation path.
- Customer UI now creates the ticket and first message through one RPC transaction.
- Added production static tests covering the v41.1 security contract.

## Verification
- Production/static test suite: **40/40 passed**.
- Migration preflight: **0 errors**, required versions through v41 detected.
- Existing warnings remain only for the historical duplicate v5 migrations and documented version gaps.
- Full Next.js build was not run because dependencies could not be installed within the available execution window. Run `npm install` then `npm run build` in the deployment environment before release.
