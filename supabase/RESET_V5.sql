-- AIDIL STORE v5 — RESET DATABASE (PUBLIC ONLY)
-- Aman untuk storage: file di Storage TIDAK dihapus.
-- Jalankan ini jika ingin memulai database aplikasi dari nol.

DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.topups CASCADE;
DROP TABLE IF EXISTS public.payment_settings CASCADE;
DROP TABLE IF EXISTS public.wallet_transactions CASCADE;
DROP TABLE IF EXISTS public.wallets CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP FUNCTION IF EXISTS public.checkout(uuid, jsonb, text) CASCADE;
DROP FUNCTION IF EXISTS public.approve_topup(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.create_payment_order(uuid, jsonb, text) CASCADE;

DROP TYPE IF EXISTS public.wallet_tx_type CASCADE;
DROP TYPE IF EXISTS public.order_status CASCADE;
DROP TYPE IF EXISTS public.topup_status CASCADE;
DROP TYPE IF EXISTS public.user_role CASCADE;
DROP TYPE IF EXISTS public.payment_status CASCADE;

-- Bersihkan policy Storage yang dibuat versi sebelumnya.
-- File di bucket tetap ada.
DROP POLICY IF EXISTS "topup_proofs_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "topup_proofs_select_own_or_admin" ON storage.objects;
DROP POLICY IF EXISTS "digital_products_admin_write" ON storage.objects;
DROP POLICY IF EXISTS "product_thumbnails_select_all" ON storage.objects;
DROP POLICY IF EXISTS "product_thumbnails_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "product_thumbnails_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "product_thumbnails_admin_delete" ON storage.objects;

SELECT 'RESET DATABASE V5 BERHASIL' AS status;
