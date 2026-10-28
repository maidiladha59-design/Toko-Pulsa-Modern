import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('v97 migrasi avatars: tabel, kolom profil, bucket, RPC, proteksi default', () => {
  const sql = read('supabase/migrations_v97_profile_avatars.sql');
  assert.match(sql, /create table if not exists public\.avatars/);
  assert.match(sql, /image_url text not null/i);
  assert.match(sql, /is_active boolean not null default true/i);
  assert.match(sql, /sort_order integer not null default 100/i);
  assert.match(sql, /created_at timestamptz not null default now\(\)/i);
  assert.match(sql, /add column if not exists avatar_id uuid references public\.avatars\(id\) on delete set null/i);
  assert.match(sql, /create policy "avatars_select_active" on public\.avatars/i);
  assert.match(sql, /using \(is_active = true\)/i);
  assert.match(sql, /values \('avatars', 'avatars', true\)/i);
  assert.match(sql, /function public\.user_set_avatar\(p_avatar_id uuid\)/i);
  assert.match(sql, /raise exception 'AVATAR_NOT_AVAILABLE'/i);
  assert.match(sql, /where id = v_uid/i);
  assert.match(sql, /trigger avatars_protect_default/i);
  assert.match(sql, /raise exception 'DEFAULT_AVATAR_PROTECTED'/i);
  assert.match(sql, /'00000000-0000-0000-0000-000000000097'/i);
  assert.match(sql, /'\/avatars\/default\.png'/i);
  // Avatar collection menulis tidak pernah terbuka untuk klien biasa.
  assert.doesNotMatch(sql, /create policy .* for (insert|update|delete) to authenticated.* on public\.avatars/i);
});

test('v97 avatar default tersedia sebagai aset proyek', () => {
  assert.ok(fs.existsSync(path.join(root, 'public/avatars/default.png')), 'public/avatars/default.png wajib ada');
});

test('v97 API pengguna: hanya avatar aktif milik sesi sendiri', () => {
  const api = read('src/app/api/profile/avatar/route.ts');
  assert.match(api, /supabase\.auth\.getUser\(\)/);
  assert.match(api, /z\.string\(\)\.trim\(\)\.uuid\(/);
  assert.match(api, /await supabase\.rpc\("user_set_avatar", \{\n    p_avatar_id: parsed\.data\.avatar_id,/);
  assert.match(api, /AVATAR_NOT_AVAILABLE: "Foto profil tidak tersedia\. Pilih avatar lain\."/)
  assert.match(api, /Silakan login kembali\./);
  assert.doesNotMatch(api, /createAdminClient/, 'jalur pengguna tidak boleh memakai service role');
  assert.doesNotMatch(api, /from\(['"]profiles['"]\)\s*\.update/);
});

test('v97 API admin: cek role di server, batas 1MB, tipe diverifikasi dari byte, audit log', () => {
  const list = read('src/app/api/admin/avatars/route.ts');
  const item = read('src/app/api/admin/avatars/[id]/route.ts');
  assert.match(list, /\["ADMIN", "SUPER_ADMIN"\]\.includes\(String\(profile\.role\)\)/);
  assert.match(list, /MAX_AVATAR_BYTES/);
  assert.match(list, /sniffAvatarType\(bytes\)/);
  assert.match(list, /admin\.storage\.from\(AVATAR_BUCKET\)\.upload/);
  assert.match(list, /form\.getAll\("files"\)/, 'mendukung unggahan banyak file sekaligus');
  assert.match(list, /action: "avatar\.create"/);
  assert.match(item, /action: "avatar\.update"/);
  assert.match(item, /action: "avatar\.delete"/);
  assert.match(item, /Avatar default toko tidak boleh dihapus\./);
  assert.match(item, /select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(item, /\.eq\("avatar_id", current\.id\)/);
  assert.match(item, /move: z\.enum\(\["up", "down"\]\)/);
});

test('v97 hero beranda memakai foto profil + nama, tagline lama dihapus', () => {
  const home = read('src/app/page.tsx');
  const hero = read('src/components/HeroUser.tsx');
  assert.doesNotMatch(home, /Pulsa • Game • Tagihan • Saldo/);
  assert.match(home, /<HeroUser name=\{accountData\.name\} avatarId=\{accountData\.avatarId\} avatarUrl=\{accountData\.avatarUrl\}\/>/);
  assert.match(home, /Masuk \/ Daftar/);
  assert.match(hero, /Halo,/);
  assert.match(hero, /text-\[18px\] font-semibold/);
  assert.match(hero, /<UserAvatar size=\{60\} src=\{current\.url\} name=\{name\} priority \/>/);
  assert.match(hero, /✎/);
  assert.match(hero, /className="block truncate text-\[18px\]/);
  assert.match(hero, /min-w-0 flex-1/);
  assert.doesNotMatch(hero, /overflow-x-hidden/, 'overflow harus diperbaiki dari akar, bukan ditutup');
});

test('v97 pemilih avatar: judul, grid 3 kolom, hanya aktif, simpan sampai berubah, toast', () => {
  const picker = read('src/components/AvatarPicker.tsx');
  assert.match(picker, /const heading = "Pilih Foto Profil";/);
  assert.match(picker, /grid grid-cols-3 gap-3/);
  assert.match(picker, /loadActiveAvatars\(supabase\)/);
  assert.match(picker, /ring-4 ring-gold-400/);
  assert.match(picker, /✓/);
  assert.match(picker, /disabled=\{!changed\}/);
  assert.match(picker, /Simpan/);
  assert.match(picker, /toast\.show\("Foto profil diperbarui\.", "success"\)/);
  assert.match(picker, /Skeleton key=\{i\} className="aspect-square rounded-full"/);
  assert.match(picker, /Belum ada foto profil tersedia/);
  assert.match(picker, /aria-modal="true"/);

  const lib = read('src/lib/avatar.ts');
  assert.match(lib, /\.eq\("is_active", true\)/);
  assert.match(lib, /\.order\("sort_order", \{ ascending: true \}\)/);
  assert.match(lib, /export const DEFAULT_AVATAR_URL = "\/avatars\/default\.png";/);
});

test('v97 komponen UserAvatar dipakai di beranda, profil, dan navbar', () => {
  assert.match(read('src/app/profile/page.tsx'), /<UserAvatar size=\{64\} src=\{avatarUrl\} name=\{p\.full_name\|\|'Pengguna'\}\/>/);
  assert.match(read('src/app/profile/page.tsx'), /<AvatarPicker/);
  assert.match(read('src/components/Navbar.tsx'), /<UserAvatar size=\{32\} src=\{avatarUrl\} name=\{name\} ring=\{false\} \/>/);
  assert.match(read('src/components/Navbar.tsx'), /<UserAvatar size=\{40\} src=\{avatarUrl\} name=\{name\} \/>/);
  assert.match(read('src/components/Navbar.tsx'), /select\("full_name,email,role,avatar_id"\)/);
  assert.match(read('src/components/Navbar.tsx'), /aidil:avatar-updated/);

  const avatar = read('src/components/UserAvatar.tsx');
  assert.match(avatar, /width=\{size\}/);
  assert.match(avatar, /shrink-0/);
  assert.match(avatar, /rounded-full/);

  const sidebar = read('src/app/admin/AdminSidebar.tsx');
  assert.match(sidebar, /\["\/admin\/avatars", "🙂", "Foto Profil"\]/);
  assert.match(read('src/app/admin/avatars/page.tsx'), /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(read('src/app/admin/avatars/page.tsx'), /Pratinjau \(dipotong 1:1, 500×500\)/);
});

test('v97 preflight mewajibkan migrasi v97', () => {
  const script = read('scripts/migration-preflight.mjs');
  assert.match(script, /migrations_v97_profile_avatars\.sql/);
  assert.match(script, /90,93,94,97\]/);
});
