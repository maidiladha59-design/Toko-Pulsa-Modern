-- Aidil Store v5: remove legacy Midtrans artifacts when upgrading an existing database.
-- If you are doing a fresh/reset setup, this file is NOT required because schema.sql no longer creates them.

DROP FUNCTION IF EXISTS public.create_payment_order(uuid, jsonb, text);
DROP TABLE IF EXISTS public.payments;
DROP TYPE IF EXISTS public.payment_status;

