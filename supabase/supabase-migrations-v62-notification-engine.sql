-- AIDIL STORE v62: notification templates + preferences
create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  title text not null,
  subtitle text not null default '',
  message text not null default '',
  enabled boolean not null default true,
  push_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  transactions boolean not null default true,
  topup boolean not null default true,
  kyc boolean not null default true,
  security boolean not null default true,
  promotions boolean not null default true,
  announcements boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_templates enable row level security;
alter table public.notification_preferences enable row level security;

insert into public.notification_templates (event_key,title,subtitle,message) values
('TOPUP_SUCCESS','Top Up Berhasil 🎉','Saldo berhasil ditambahkan.','Saldo {{amount}} telah ditambahkan ke akun kamu.'),
('TOPUP_EXPIRING','Pembayaran Segera Berakhir ⏱️','Selesaikan pembayaran sebelum batas waktu.','Transaksi {{reference}} akan kedaluwarsa pada {{expires_at}}.'),
('TOPUP_EXPIRED','Top Up Kedaluwarsa','Batas pembayaran telah berakhir.','Transaksi {{reference}} telah kedaluwarsa dan saldo tidak ditambahkan.'),
('TRANSACTION_SUCCESS','Transaksi Berhasil ✅','Pesanan kamu berhasil diproses.','Transaksi {{reference}} sebesar {{amount}} berhasil.'),
('TRANSACTION_FAILED','Transaksi Gagal','Pesanan tidak dapat diproses.','Transaksi {{reference}} gagal diproses.'),
('KYC_SUBMITTED','KYC Sedang Diverifikasi 🪪','Dokumen kamu sudah diterima.','Pengajuan KYC kamu sedang diperiksa oleh tim AIDIL STORE.'),
('KYC_APPROVED','KYC Berhasil Disetujui 🎉','Verifikasi identitas berhasil.','Verifikasi KYC kamu telah disetujui.'),
('KYC_REJECTED','KYC Ditolak','Perlu tindakan dari kamu.','Pengajuan KYC kamu ditolak. {{reason}}'),
('SECURITY_LOGIN','Login Baru Terdeteksi 🔐','Ada login ke akun kamu.','Login baru terdeteksi pada {{time}} dari {{device}}.'),
('PROMOTION','{{title}}','{{subtitle}}','{{message}}'),
('ANNOUNCEMENT','Pengumuman AIDIL STORE','Ada informasi baru.','{{message}}')
on conflict (event_key) do nothing;

create or replace function public.seed_notification_preferences()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_preferences(user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_seed_notification_preferences on auth.users;
create trigger trg_seed_notification_preferences after insert on auth.users
for each row execute function public.seed_notification_preferences();

create policy notification_preferences_select_own on public.notification_preferences for select using (auth.uid() = user_id);
create policy notification_preferences_insert_own on public.notification_preferences for insert with check (auth.uid() = user_id);
create policy notification_preferences_update_own on public.notification_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
