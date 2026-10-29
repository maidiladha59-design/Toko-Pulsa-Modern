import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const MIGRATION = 'supabase/migrations_v90_app_ratings.sql';

test('v90 migrasi app_ratings: kolom, satu rating per user, penanda prompt', () => {
  assert.ok(fs.existsSync(path.join(root, MIGRATION)), 'migrasi v90 harus ada');
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /create table if not exists public\.app_ratings/);
  assert.match(sql, /id uuid primary key default extensions\.uuid_generate_v4\(\)/);
  assert.match(sql, /user_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(sql, /rating int not null check \(rating between 1 and 5\)/);
  assert.match(sql, /comment text/);
  assert.match(sql, /transaction_count_at_rating int not null/);
  assert.match(sql, /is_published boolean not null default false/);
  assert.match(sql, /created_at timestamptz not null default now\(\)/);

  assert.match(sql, /create unique index if not exists app_ratings_user_unique\s+on public\.app_ratings \(user_id\)/);
  assert.match(sql, /alter table public\.profiles\s+add column if not exists rating_prompted_at timestamptz/);
});

test('v90 RLS: user hanya baca/insert baris sendiri, moderasi bukan lewat tabel', () => {
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /create policy "app_ratings_select_own" on public\.app_ratings\s+for select to authenticated using \(user_id = auth\.uid\(\)\)/);
  assert.match(sql, /create policy "app_ratings_insert_own" on public\.app_ratings\s+for insert to authenticated with check \(user_id = auth\.uid\(\)\)/);
  assert.doesNotMatch(sql, /create policy "app_ratings_(update|delete)/, 'tidak boleh ada policy update/delete untuk user');
  assert.match(sql, /revoke all on public\.app_ratings from public, anon, authenticated/);
  assert.match(sql, /grant select on public\.app_ratings to authenticated/);
  assert.match(sql, /grant insert \(user_id, rating, comment, transaction_count_at_rating\)\s+on public\.app_ratings to authenticated/);
  assert.doesNotMatch(sql, /grant update on public\.app_ratings/, 'user tidak boleh update is_published langsung');
});

test('v90 hitungan & prompt memakai orders COMPLETED dan jeda 3 hari', () => {
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /create or replace function public\.get_my_transaction_count\(p_user_id uuid\)/);
  assert.match(sql, /create or replace function public\.should_prompt_rating\(p_user_id uuid\)/);
  assert.match(sql, /from public\.orders\s+where user_id = p_user_id and status = 'completed'/);
  assert.match(sql, /if coalesce\(v_count, 0\) < 10 then\s+return false/);
  assert.match(sql, /select exists \(\s+select 1 from public\.app_ratings where user_id = p_user_id\s+\) into v_has_rating/);
  assert.match(sql, /if v_prompted_at is not null and v_prompted_at > now\(\) - interval '3 days' then\s+return false/);
  assert.match(sql, /grant execute on function public\.get_my_transaction_count\(uuid\) to authenticated, service_role/);
  assert.match(sql, /grant execute on function public\.should_prompt_rating\(uuid\) to authenticated, service_role/);
  assert.doesNotMatch(sql, /grant execute on function public\.should_prompt_rating\(uuid\) to anon/, 'prompt tidak boleh anon');
});

test('v90 submit & dismiss: validasi, histori count, audit, tandai prompted', () => {
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /create or replace function public\.submit_app_rating\(\s*p_user_id uuid,\s*p_rating int,\s*p_comment text default null\s*\)/);
  assert.match(sql, /if p_rating is null or p_rating < 1 or p_rating > 5 then\s+raise exception 'rating_invalid'/);
  assert.match(sql, /if exists \(select 1 from public\.app_ratings where user_id = p_user_id\) then\s+raise exception 'rating_already_submitted'/);
  assert.match(sql, /insert into public\.app_ratings \(user_id, rating, comment, transaction_count_at_rating\)\s+values \(p_user_id, p_rating, v_comment, v_count\)/);
  assert.match(sql, /insert into public\.audit_logs[\s\S]*'rating\.submit'/);
  assert.match(sql, /update public\.profiles set rating_prompted_at = now\(\) where id = p_user_id/);
  assert.match(sql, /exception\s+when unique_violation then\s+raise exception 'rating_already_submitted'/);
  assert.match(sql, /create or replace function public\.mark_rating_prompted\(p_user_id uuid\)/);
  assert.match(sql, /grant execute on function public\.mark_rating_prompted\(uuid\) to authenticated, service_role/);
});

test('v90 agregat publik + daftar approved + moderasi admin diaudit', () => {
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /create or replace function public\.get_rating_summary\(\)\s+returns table\(average numeric, total_count int\)/);
  assert.match(sql, /grant execute on function public\.get_rating_summary\(\) to anon, authenticated, service_role/);
  assert.match(sql, /create or replace function public\.get_published_ratings\(p_limit int default 20\)/);
  assert.match(sql, /split_part\(btrim\(p\.full_name\), ' ', 1\)/);
  assert.match(sql, /'pengguna aidil store'/);
  assert.match(sql, /where r\.is_published = true/);
  assert.match(sql, /grant execute on function public\.get_published_ratings\(int\) to anon, authenticated, service_role/);

  assert.match(sql, /create or replace function public\.admin_set_rating_published\(\s*p_admin_id uuid,\s*p_rating_id uuid,\s*p_published boolean\s*\)/);
  assert.match(sql, /v_role not in \('super_admin', 'admin', 'staff'\)/);
  assert.match(sql, /'rating\.moderate'/);
  assert.match(sql, /grant execute on function public\.admin_set_rating_published\(uuid, uuid, boolean\) to authenticated, service_role/);
});

test('v90 preflight mendaftarkan migrasi dan definisi wajib', () => {
  const script = read('scripts/migration-preflight.mjs');
  assert.match(script, /migrations_v90_app_ratings\.sql/);
  assert.match(script, /89,90,93,94,97,98]/);
  assert.match(script, /get_my_transaction_count/);
  assert.match(script, /admin_set_rating_published/);
  assert.match(script, /rating_prompted_at/);
});

test('v90 API rating: session RPC, pesan ramah, schema-missing aman', () => {
  const status = read('src/app/api/rating/status/route.ts');
  assert.match(status, /should_prompt_rating/);
  assert.match(status, /p_user_id: user\.id/);
  assert.match(status, /isRatingRpcMissing\(error\.code\)/);
  assert.match(status, /shouldPrompt: false/);

  const submit = read('src/app/api/rating/submit/route.ts');
  assert.match(submit, /submit_app_rating/);
  assert.match(submit, /p_rating: parsed\.data\.rating/);
  assert.match(submit, /p_comment: comment/);
  assert.match(submit, /RATING_SCHEMA_MISSING/);
  assert.match(submit, /Pilih rating 1 sampai 5 bintang/);

  const dismiss = read('src/app/api/rating/dismiss/route.ts');
  assert.match(dismiss, /mark_rating_prompted/);
  assert.match(dismiss, /p_user_id: user\.id/);

  const messages = read('src/lib/rating-messages.ts');
  assert.match(messages, /RATING_ALREADY_SUBMITTED/);
  assert.match(messages, /RATING_NOT_ELIGIBLE/);
  assert.match(messages, /PGRST202/);
  assert.match(messages, /Anda sudah pernah mengirim rating/);
});

test('v90 modal muncul hanya di beranda/dashboard, 5 bintang + dismiss', () => {
  const modal = read('src/components/RatingPrompt.tsx');
  assert.match(modal, /Bagaimana pengalaman Anda memakai AIDIL STORE\?/);
  assert.match(modal, /MAX_COMMENT = 1000/);
  assert.match(modal, /role="radiogroup"/);
  assert.match(modal, /\[1, 2, 3, 4, 5\]\.map/);
  assert.match(modal, /\/api\/rating\/status/);
  assert.match(modal, /\/api\/rating\/submit/);
  assert.match(modal, /\/api\/rating\/dismiss/);
  assert.match(modal, /setTimeout\(\(\) => setOpen\(false\), 1800\)/);
  assert.match(modal, /Nanti saja/);
  assert.match(modal, /Mengirim\.\.\./);
  assert.match(modal, /Terima kasih!/);

  assert.match(read('src/app/dashboard/page.tsx'), /RatingPrompt/);
  assert.match(read('src/app/page.tsx'), /RatingPrompt/);
  for (const page of [
    'src/app/checkout/page.tsx',
    'src/app/transfer-uang/page.tsx',
    'src/app/wallet/page.tsx',
  ]) {
    assert.doesNotMatch(read(page), /RatingPrompt/, `${page} tidak boleh memasang modal rating`);
  }

  const dashboard = read('src/app/dashboard/page.tsx');
  assert.match(dashboard, /\.eq\("status", "COMPLETED"\)/);
  assert.match(dashboard, /Transaksi berhasil/);
});

test('v90 UI publik & admin: badge, /ulasan, filter, approve/unpublish', () => {
  const view = read('src/components/RatingBadgeView.tsx');
  assert.ok(view.includes('dari ${summary.totalCount} ulasan'), 'badge harus menampilkan jumlah ulasan');
  assert.match(view, /Belum ada ulasan/);
  assert.match(view, /href="\/ulasan"/);

  const badge = read('src/components/RatingBadge.tsx');
  assert.match(badge, /getRatingSummary/);

  const live = read('src/components/RatingBadgeLive.tsx');
  assert.match(live, /\.rpc\("get_rating_summary"\)/);
  assert.match(read('src/app/welcome/page.tsx'), /<RatingBadgeLive \/>/);

  const home = read('src/app/page.tsx');
  assert.match(home, /<RatingBadge \/>/);
  assert.match(home, /Ulasan Pelanggan/);

  const card = read('src/components/BusinessIdentityCard.tsx');
  assert.match(card, /<RatingBadge showEmpty \/>/);

  const reviews = read('src/app/ulasan/page.tsx');
  assert.match(reviews, /getPublishedRatings\(30\)/);
  assert.match(reviews, /getRatingSummary\(\)/);
  assert.match(reviews, /displayName/);
  assert.match(reviews, /Hanya ulasan yang disetujui\s+admin/);

  const lib = read('src/lib/ratings.ts');
  assert.match(lib, /\.rpc\("get_rating_summary"\)/);
  assert.match(lib, /\.rpc\("get_published_ratings", \{ p_limit: limit \}\)/);

  const api = read('src/app/api/admin/ratings/route.ts');
  assert.match(api, /admin_set_rating_published/);
  assert.match(api, /p_published: parsed\.data\.published/);
  assert.match(api, /\[\"ADMIN\", \"SUPER_ADMIN\"\]/);

  const page = read('src/app/admin/ratings/page.tsx');
  assert.match(page, /\/api\/admin\/ratings/);
  assert.match(page, /Tayangkan/);
  assert.match(page, /Sembunyikan/);
  assert.match(page, /Rata-rata/);
  assert.match(page, /Menunggu/);
  assert.match(page, /aria-pressed=\{filter === star\}/);

  const sidebar = read('src/app/admin/AdminSidebar.tsx');
  assert.match(sidebar, /\["\/admin\/ratings", "⭐", "Rating & Ulasan"\]/);
});
