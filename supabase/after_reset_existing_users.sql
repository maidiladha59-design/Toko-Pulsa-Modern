-- Jalankan setelah schema.sql jika Auth users lama ingin tetap dipakai.
INSERT INTO public.profiles (id, email, full_name)
SELECT
  u.id,
  COALESCE(u.email, ''),
  COALESCE(u.raw_user_meta_data->>'full_name', '')
FROM auth.users u
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name;

INSERT INTO public.wallets (user_id, balance)
SELECT p.id, 0
FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;

SELECT 'PROFILE DAN WALLET USER LAMA BERHASIL DIPULIHKAN' AS status;
