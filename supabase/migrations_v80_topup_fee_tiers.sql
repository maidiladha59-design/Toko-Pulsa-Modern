-- AIDIL STORE v80 — BIAYA ADMIN TOP UP BERTINGKAT (topup_fee_tiers)
-- Jalankan setelah v79.
-- Biaya admin Top Up kini bisa diatur per rentang nominal (tier):
--   min_amount/max_amount inklusif; max_amount null berarti tanpa batas atas.
-- Jika nominal pelanggan tidak cocok dengan tier aktif manapun, perhitungan LAMA
-- dari topup_fee_methods/topup_fee_settings tetap dipakai sebagai CADANGAN (fallback),
-- supaya tidak ada nominal yang "kena biaya 0" karena rentang belum lengkap.
-- Tabel lama (topup_fee_settings, topup_fee_methods) SENGAJA tidak dihapus.
-- Anti tumpang tindih dua lapis:
--   1) API /api/admin/topup-fee-tiers menolak (409) sambil menyebut tier yang bentrok;
--   2) trigger BEFORE INSERT/UPDATE di bawah tetap menjaga integritas untuk jalur tulis
--      lain (service role, SQL editor) sekaligus menutup race condition antar request.
-- RLS: semua orang boleh SELECT (halaman Top Up pelanggan memakai daftar tier ini),
-- tulis (INSERT/UPDATE/DELETE) hanya untuk ADMIN/SUPER_ADMIN via public.is_admin().

create table if not exists public.topup_fee_tiers (
  id uuid primary key default extensions.uuid_generate_v4(),
  min_amount bigint not null check (min_amount > 0),
  max_amount bigint check (max_amount is null or max_amount >= min_amount),
  fee_amount bigint not null default 0 check (fee_amount >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists topup_fee_tiers_active_idx
  on public.topup_fee_tiers (is_active, sort_order, min_amount);

-- Penjaga tumpang tindih: menolak baris aktif yang rentangnya bersinggungan dengan
-- baris aktif lain. Pesan error menyebutkan rentang kedua tier supaya jalur tulis
-- non-API pun mendapat konteks yang jelas.
create or replace function public.topup_fee_tiers_prevent_overlap()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_conflict public.topup_fee_tiers;
begin
  if new.is_active = false then return new; end if;
  select * into v_conflict
  from public.topup_fee_tiers t
  where t.is_active = true
    and (new.id is null or t.id <> new.id)
    and t.min_amount <= coalesce(new.max_amount, 9223372036854775807)
    and new.min_amount <= coalesce(t.max_amount, 9223372036854775807)
  order by t.min_amount
  limit 1;
  if v_conflict.id is not null then
    raise exception 'TOPUP_FEE_TIER_OVERLAP: rentang % - % tumpang tindih dengan tier % - %',
      new.min_amount, coalesce(new.max_amount::text, 'tanpa batas'),
      v_conflict.min_amount, coalesce(v_conflict.max_amount::text, 'tanpa batas');
  end if;
  return new;
end $$;

drop trigger if exists topup_fee_tiers_overlap_guard on public.topup_fee_tiers;
create trigger topup_fee_tiers_overlap_guard
  before insert or update on public.topup_fee_tiers
  for each row execute function public.topup_fee_tiers_prevent_overlap();

alter table public.topup_fee_tiers enable row level security;

drop policy if exists "topup_fee_tiers_select_all" on public.topup_fee_tiers;
create policy "topup_fee_tiers_select_all" on public.topup_fee_tiers
  for select using (true);

drop policy if exists "topup_fee_tiers_admin_write" on public.topup_fee_tiers;
create policy "topup_fee_tiers_admin_write" on public.topup_fee_tiers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.topup_fee_tiers from anon, authenticated;
grant select on public.topup_fee_tiers to anon, authenticated;
grant insert, update, delete on public.topup_fee_tiers to authenticated;

-- Seed SATU baris contoh: Rp1.000–Rp9.999 → biaya admin Rp81.
-- Idempotent: hanya mengisi kalau tabel masih kosong, sehingga tidak menimpa
-- pengaturan admin saat migrasi dijalankan ulang.
insert into public.topup_fee_tiers (min_amount, max_amount, fee_amount, is_active, sort_order)
select 1000, 9999, 81, true, 1
where not exists (select 1 from public.topup_fee_tiers);
