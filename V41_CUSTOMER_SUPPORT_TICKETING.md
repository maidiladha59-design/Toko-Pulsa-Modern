# AIDIL STORE v41 — Customer Support & Ticketing

v41 upgrades the legacy one-message help feature into a threaded ticket center.

## Customer
- Create a ticket with category and optional order UUID.
- Ticket number, status and priority are visible.
- Threaded conversation with admin.
- Customer can continue a ticket while it is open/being handled.

## Admin
- Ticket Center under Admin > Bantuan.
- Filter by status.
- See customer, category and optional order reference.
- Reply inside the same thread.
- Change status: OPEN, IN_PROGRESS, WAITING_CUSTOMER, RESOLVED, CLOSED.

## Security
- RLS restricts customers to their own tickets/messages.
- Admin-only status RPC.
- Internal-message field exists for future private admin notes; customer policy cannot insert internal notes.
- Legacy `support_messages` remains intact and is backfilled into v41 tickets when the migration runs.
