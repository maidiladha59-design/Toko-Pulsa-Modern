-- AIDIL STORE v15: PPOB receipt/status indexes.
-- No destructive changes; the UI reads existing v9-v14 transaction data.

create index if not exists ppob_transactions_order_item_idx
  on public.ppob_transactions(order_id, order_item_id);

create index if not exists ppob_order_targets_item_idx
  on public.ppob_order_targets(order_item_id);
