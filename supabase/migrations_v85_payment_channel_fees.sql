-- AIDIL STORE v85 BIAYA PER CHANNEL PEMBAYARAN (Midtrans)
-- Run after v84.
-- Tabel payment_channel_fees: tarif biaya per channel top up yang
-- diatur admin (biaya gateway + biaya admin/margin), plus snapshot
-- tarif pada tabel topups agar riwayat transaksi tidak berubah saat
-- tarif diperbarui.
--
-- Keamanan baca: pelanggan TIDAK diberi akses langsung ke tabel ini
-- (tidak ada policy select publik, revoke semua). Pelanggan hanya
-- melihat rincian biaya lewat endpoint server (/api/topup/preview)
-- yang memilih kolom publik saja. Tulis hanya ADMIN/SUPER_ADMIN
-- (cek public.is_admin()).
--
-- Seed awal bernilai 0 semua: jangan menebak tarif Midtrans. Admin
-- mengisi tarif asli lewat panel admin.

create table if not exists public.payment_channel_fees (
  id uuid primary key default gen_random_uuid(),
  channel_code text not null unique check (btrim(channel_code) <> ''),
  label text not null check (btrim(label) <> ''),
  channel_group text not null default 'Virtual Account' check (btrim(channel_group) <> ''),
  is_active boolean not null default true,
  gateway_fee_type text not null default 'flat'
    check (gateway_fee_type in ('flat', 'percent', 'flat_percent')),
  gateway_fee_flat bigint not null default 0 check (gateway_fee_flat >= 0),
  gateway_fee_percent numeric not null default 0 check (gateway_fee_percent >= 0),
  gateway_fee_tax_percent numeric not null default 0 check (gateway_fee_tax_percent >= 0),
  margin_type text not null default 'flat'
    check (margin_type in ('flat', 'percent', 'flat_percent')),
  margin_flat bigint not null default 0 check (margin_flat >= 0),
  margin_percent numeric not null default 0 check (margin_percent >= 0),
  min_amount bigint check (min_amount is null or min_amount >= 0),
  max_amount bigint check (max_amount is null or max_amount >= 0),
  customer_note text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint payment_channel_fees_min_max_check
    check (min_amount is null or max_amount is null or min_amount <= max_amount)
);

alter table public.payment_channel_fees enable row level security;

-- Tidak ada policy select untuk anon/authenticated: pelanggan tidak
-- boleh membaca tabel ini langsung. Endpoint server memakai service
-- role (bypass RLS) dan hanya mengekspos kolom publik.

drop policy if exists "payment_channel_fees_admin_write" on public.payment_channel_fees;
create policy "payment_channel_fees_admin_write" on public.payment_channel_fees
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.payment_channel_fees from public, anon, authenticated;

-- Snapshot tarif saat transaksi dibuat (riwayat tidak berubah saat tarif diubah).
alter table public.topups add column if not exists fee_snapshot jsonb;

-- Seed channel aktif dari v83 dengan tarif 0 (admin isi tarif asli nanti).
insert into public.payment_channel_fees(channel_code, label, channel_group, is_active) values
('qris', 'QRIS', 'QRIS', true),
('bca_va', 'BCA Virtual Account', 'Virtual Account', true),
('bni_va', 'BNI Virtual Account', 'Virtual Account', true),
('bri_va', 'BRI Virtual Account', 'Virtual Account', true),
('permata_va', 'Permata Virtual Account', 'Virtual Account', true)
on conflict(channel_code) do nothing;
