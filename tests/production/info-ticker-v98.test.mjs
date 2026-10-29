import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('v98 migrasi site_settings: satu tabel key/value, RLS baca publik, tanpa jalur tulis klien', () => {
  const sql = read('supabase/migrations_v98_info_ticker.sql');
  assert.match(sql, /create table if not exists public\.site_settings/);
  assert.match(sql, /key text primary key/i);
  assert.match(sql, /value jsonb not null default '\{\}'::jsonb/i);
  assert.match(sql, /updated_at timestamptz not null default now\(\)/i);
  assert.match(sql, /updated_by uuid references auth\.users\(id\) on delete set null/i);
  assert.match(sql, /constraint site_settings_key_format check \(key ~ '\^\[a-z0-9_\]\{2,60\}\$'\)/i);
  assert.match(sql, /constraint site_settings_value_object check \(jsonb_typeof\(value\) = 'object'\)/i);
  assert.match(sql, /alter table public\.site_settings enable row level security/i);
  assert.match(sql, /create policy "site_settings_public_read" on public\.site_settings/i);
  assert.match(sql, /for select to anon, authenticated using \(key in \('info_ticker'\)\)/i);
  assert.match(sql, /revoke all on public\.site_settings from public, anon, authenticated/i);
  assert.match(sql, /grant select on public\.site_settings to anon, authenticated/i);
  // Tulis langsung dari klien tidak pernah dibuka.
  assert.doesNotMatch(sql, /create policy .* for (insert|update|delete)/i);
});

test('v98 seed info_ticker memakai teks lama dari site_announcements, bukan hardcode di komponen', () => {
  const sql = read('supabase/migrations_v98_info_ticker.sql');
  assert.match(sql, /insert into public\.site_settings \(key, value\)/i);
  assert.match(sql, /'info_ticker',/i);
  assert.match(sql, /'enabled', true/i);
  assert.match(sql, /'speed', 40/i);
  assert.match(sql, /'direction', 'left'/i);
  assert.match(sql, /'pause_on_touch', true/i);
  assert.match(sql, /'gap', 48/i);
  assert.match(sql, /'icon', 'megaphone'/i);
  assert.match(sql, /'style', 'default'/i);
  assert.match(sql, /from public\.site_announcements a/i);
  assert.match(sql, /where a\.is_active = true/i);
  assert.match(sql, /on conflict \(key\) do nothing/i);
  // Batas di database harus sama dengan rentang validasi server.
  assert.match(sql, /constraint site_settings_info_ticker_bounds check/i);
  assert.match(sql, /char_length\(btrim\(coalesce\(value ->> 'text', ''\)\)\) <= 300/i);
  assert.match(sql, /between 10 and 120/i);
  assert.match(sql, /between 16 and 160/i);
  assert.doesNotMatch(read('src/components/InfoTicker.tsx'), /Semua transaksi digital bisa diproses/, 'teks default tidak dipatenkan di komponen');
});

test('v98 preflight mengenal migrasi site_settings', () => {
  const script = read('scripts/migration-preflight.mjs');
  assert.match(script, /migrations_v98_info_ticker\.sql/);
  assert.match(script, /site_settings_public_read/);
  assert.match(script, /97,98\]/);
});

test('v98 lib murni: default, rentang, dan aturan link', () => {
  const lib = read('src/lib/info-ticker.ts');
  assert.match(lib, /export const TICKER_TEXT_MAX = 300;/);
  assert.match(lib, /export const TICKER_SPEED_MIN = 10;/);
  assert.match(lib, /export const TICKER_SPEED_MAX = 120;/);
  assert.match(lib, /export const TICKER_GAP_MIN = 16;/);
  assert.match(lib, /export const TICKER_GAP_MAX = 160;/);
  assert.match(lib, /export type TickerIcon = "megaphone" \| "bell" \| "star" \| "none";/);
  assert.match(lib, /export type TickerStyle = "default" \| "emas" \| "peringatan";/);  assert.match(lib, /if \(value === ""\) return true;/);
  assert.match(lib, /startsWith\("\/\/"\)\) return false;/);
  // Path internal menolak backslash (\ / karakter kontrol URL) — ditulis tanpa
  // regex supaya tidak bergantung pada tingkat escaping.
  const BS = String.fromCharCode(92);
  assert.ok(lib.includes(`if (value.startsWith("/")) return !value.includes("${BS}${BS}");`), 'backslash ditolak di path internal');
  assert.ok(lib.includes('^https:'), 'pola https dipakai memvalidasi link');
  assert.match(lib, /\.test\(value\);/);
  assert.match(lib, /tidak ada javascript:\/data:/);
  assert.match(lib, /Link hanya boleh alamat internal \(diawali \/\) atau https\./);
  assert.match(lib, /Teks info maksimal \$\{TICKER_TEXT_MAX\} karakter\./);
  assert.match(lib, /Kecepatan minimal \$\{TICKER_SPEED_MIN\} px per detik\./);
  assert.match(lib, /Jadwal selesai harus setelah jadwal tampil\./);
  assert.match(lib, /export function tickerIsLive/);
  assert.match(lib, /if \(!settings\.enabled\) return false;/);
  assert.match(lib, /return settings\.text\.trim\(\)\.length > 0 && tickerIsLive\(settings, now\);/);
  assert.match(lib, /export function infoTickerPresentationDefaults/);

  // Modul murni tidak boleh menarik dependensi server ke bundel browser.
  assert.doesNotMatch(lib, /from "next\/cache"/);
  assert.doesNotMatch(lib, /@supabase\/supabase-js/);
  assert.doesNotMatch(lib, /process\.env/);
});

test('v98 pembaca server memakai cache 60 detik + tag revalidasi, gagal baca = default tanpa error', () => {
  const lib = read('src/lib/site-settings.ts');
  assert.match(lib, /export \* from "@\/lib\/info-ticker";/);
  assert.match(lib, /unstable_cache\(/);
  assert.match(lib, /\{ revalidate: 60, tags: \[SITE_SETTINGS_TAG\] \}/);
  assert.match(lib, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(lib, /SUPABASE_SERVICE_ROLE_KEY/, 'pembacaan beranda tidak memakai service role');
  assert.match(lib, /\.eq\("key", INFO_TICKER_KEY\)\.maybeSingle\(\)/);
  assert.match(lib, /if \(!value\) return DEFAULT_INFO_TICKER;/);
  assert.match(lib, /catch \{\s*return DEFAULT_INFO_TICKER;/);
});

test('v98 komponen ticker: dua salinan teks, -50%, ResizeObserver, mask, reduced motion, teks biasa', () => {
  const ticker = read('src/components/InfoTicker.tsx');
  assert.match(ticker, /import \{ tickerShouldRender, type InfoTickerSettings, type TickerStyle \} from "@\/lib\/info-ticker";/);
  assert.match(ticker, /new ResizeObserver\(measure\)/);
  assert.match(ticker, /aria-hidden className="whitespace-nowrap text-sm leading-5"/);
  assert.match(ticker, /settings\.direction === "right" \? "info-ticker-right" : "info-ticker-left"/);
  assert.match(ticker, /animationDuration: `\$\{duration\}s`/);
  assert.match(ticker, /animationPlayState: paused \? "paused" : "running"/);
  assert.match(ticker, /const duration = animated \? Math\.max\(1, Math\.round\(\(singleWidth \/ settings\.speed\) \* 10\) \/ 10\) : 0;/);
  assert.match(ticker, /const overflowing = singleWidth > viewportWidth \+ 1;/);
  assert.match(ticker, /if \(!text\) return null;/);
  assert.match(ticker, /if \(!previewMode && !tickerShouldRender\(settings\)\) return null;/);
  assert.match(ticker, /prefers-reduced-motion: reduce/);
  assert.match(ticker, /line-clamp-2 whitespace-normal/);
  assert.match(ticker, /className="info-ticker-viewport relative min-w-0 flex-1 overflow-hidden"/);
  assert.match(ticker, /const href = settings\.link_url \|\| "\/notifications";/);
  assert.match(ticker, /target="_blank" rel="noopener noreferrer"/);
  assert.match(ticker, /onMouseEnter: pause/);
  assert.match(ticker, /onTouchStart: pause/);
  assert.match(ticker, /if \(settings\.pause_on_touch\) setPaused\(true\);/);
  assert.match(ticker, /const TEXT_STYLES: Record<TickerStyle, string>/);
  assert.match(ticker, /default: "text-white"/);
  assert.match(ticker, /emas: "text-gold-200"/);
  assert.match(ticker, /peringatan: "text-warning-300"/);
  // Teks dari pengaturan tidak pernah dirender sebagai HTML.
  assert.doesNotMatch(ticker, /dangerouslySetInnerHTML|\{__html/);
});

test('v98 CSS ticker: loop mulus 0 -> -50%, linear infinite, tanpa layout shift', () => {
  const css = read('src/app/globals.css');
  assert.match(css, /@keyframes info-ticker-left \{ from \{ transform: translateX\(0\); \} to \{ transform: translateX\(-50%\); \} \}/);
  assert.match(css, /@keyframes info-ticker-right \{ from \{ transform: translateX\(-50%\); \} to \{ transform: translateX\(0\); \} \}/);
  assert.match(css, /\.info-ticker-track \{ animation-timing-function: linear; animation-iteration-count: infinite; will-change: transform; \}/);
  assert.match(css, /\.info-ticker-viewport \{ -webkit-mask-image: linear-gradient\(90deg, transparent, black 6%, black 94%, transparent\)/);
});

test('v98 menu cepat hero: satu baris 4 kolom sama lebar, ikon di atas label, badge 9+', () => {
  const menu = read('src/components/HeroQuickMenu.tsx');
  assert.match(menu, /gridTemplateColumns: "repeat\(4, minmax\(0, 1fr\)\)"/);
  assert.match(menu, /\{ href: "\/profile", label: "Profil", icon: "person" \}/);
  assert.match(menu, /\{ href: "\/transactions", label: "Rekap", icon: "document" \}/);
  assert.match(menu, /\{ href: "\/bantuan", label: "Bantuan", icon: "question" \}/);
  assert.match(menu, /\{ href: "\/notifications", label: "Info", icon: "bell" \}/);
  assert.match(menu, /aria-label="Menu cepat"/);
  assert.match(menu, /min-h-\[52px\] min-w-0/);
  assert.match(menu, /<NavIcon name=\{item\.icon\} className="h-8 w-8" \/>/);
  assert.match(menu, /text-\[13px\] font-medium leading-4/);
  assert.match(menu, /w-full min-w-0 break-words text-center/);
  assert.match(menu, /focus-visible:outline-gold-400/);
  assert.match(menu, /active:scale-\[\.97\]/);
  assert.match(menu, /const showBadge = item\.icon === "bell" && count > 0;/);
  assert.match(menu, /\{count > 9 \? "9\+" : count\}/);
  assert.match(menu, /aidil:notifications-updated/);
  assert.match(menu, /bg-danger-500/);
  // Tanpa kotak berbatas dan tanpa tombol berwarna khusus.
  assert.doesNotMatch(menu, /btn-gold|border-app-border|rounded-full border/);

  const icons = read('src/components/NavIcon.tsx');
  assert.match(icons, /"person" \| "document" \| "question" \| "bell" \| "megaphone" \| "star"/);

  const bell = read('src/components/NotificationBell.tsx');
  assert.match(bell, /window\.dispatchEvent\(new CustomEvent\("aidil:notifications-updated", \{ detail: \{ unread \} \}\)\)/);
});

test('v98 hero beranda: avatar > judul > pemisah > menu cepat > pemisah > ticker, kartu Info lama hilang', () => {
  const home = read('src/app/page.tsx');
  const hero = home.slice(home.indexOf('<section className="app-hero'), home.indexOf('</section>', home.indexOf('<section className="app-hero')));
  assert.ok(hero.length > 0, 'kartu hero harus ada');
  assert.match(home, /<HeroQuickMenu unread=\{accountData\?\.unread\?\?0\}\/>/);
  assert.match(home, /\{tickerShouldRender\(ticker\)&&<div className="mt-3 border-t border-white\/10 pt-1"><InfoTicker settings=\{ticker\}\/><\/div>\}/);
  assert.match(hero, /<HeroUser name=\{accountData\.name\}/);
  assert.match(hero, /Semua transaksi digital, <span className="text-gold-400">lebih praktis\.<\/span>/);
  assert.match(hero, /border-t border-white\/10/);
  assert.ok(hero.indexOf('<HeroUser') < hero.indexOf('Semua transaksi digital'), 'avatar di atas judul');
  assert.ok(hero.indexOf('Semua transaksi digital') < hero.indexOf('<HeroQuickMenu'), 'judul di atas menu cepat');
  assert.ok(hero.indexOf('<HeroQuickMenu') < hero.indexOf('<InfoTicker'), 'ticker di bawah menu cepat');
  // Kartu "Info AIDIL STORE" terpisah tidak boleh ada lagi.
  assert.doesNotMatch(home, /Info AIDIL STORE/);
  assert.doesNotMatch(home, /site_announcements/);
  assert.doesNotMatch(home, /📢/);
  assert.doesNotMatch(home, /overflow-x-hidden/);
  assert.match(home, /import\{getInfoTicker,tickerShouldRender\}from'@\/lib\/site-settings'/);
});

test('v98 API admin: role diperiksa di server, audit log, revalidateTag, teks awet saat reset', () => {
  const api = read('src/app/api/admin/info-ticker/route.ts');
  assert.match(api, /\{ data: profile \} = await supabase\.from\("profiles"\)\.select\("role"\)/);
  assert.match(api, /\["ADMIN", "SUPER_ADMIN"\]\.includes\(profile\.role\)/);
  assert.match(api, /Silakan login kembali\./);
  assert.match(api, /Akses admin ditolak\./);
  assert.match(api, /status: 401/);
  assert.match(api, /status: 403/);
  assert.match(api, /infoTickerInputSchema\.safeParse\(input\)/);
  assert.match(api, /action: wrapped\.data\.action === "reset" \? "site_settings\.info_ticker_reset" : "site_settings\.info_ticker_update"/);
  assert.match(api, /target_type: "site_settings"/);
  assert.match(api, /revalidateTag\(SITE_SETTINGS_TAG\)/);
  assert.match(api, /createAdminClient\(\)/);
  assert.match(api, /wrapped\.data\.action === "reset"/);
  assert.match(api, /text: typeof current\.text === "string" \? current\.text : ""/);
  assert.doesNotMatch(api, /console\.log\(/, 'isi pengaturan tidak dicatat ke log aplikasi');
});

test('v98 panel admin Info Berjalan: fields lengkap, pratinjau 360px, simpan nonaktif sampai berubah', () => {
  const page = read('src/app/admin/info-ticker/page.tsx');
  assert.match(page, /from "@\/lib\/info-ticker"/);
  assert.doesNotMatch(page, /from "@\/lib\/site-settings"/, 'komponen client tidak boleh menarik modul server');
  assert.match(page, /fetch\("\/api\/admin\/info-ticker", \{ cache: "no-store" \}\)/);
  assert.match(page, /method: "PUT"/);
  assert.match(page, /body: JSON\.stringify\(\{ action: "save", \.\.\.form \}\)/);
  assert.match(page, /body: JSON\.stringify\(\{ action: "reset" \}\)/);
  assert.match(page, /role="switch"/);
  assert.match(page, /maxLength=\{TICKER_TEXT_MAX\}/);
  assert.match(page, /\{form\.text\.length\}\/\{TICKER_TEXT_MAX\}/);
  assert.match(page, /min=\{TICKER_SPEED_MIN\}\s*\n\s*max=\{TICKER_SPEED_MAX\}/);
  assert.match(page, /type="range"/);
  assert.match(page, /\{form\.speed\} px per detik · \{speedLabel\(form\.speed\)\}/);
  assert.match(page, /if \(speed <= 25\) return "Lambat";/);
  assert.match(page, /if \(speed <= 70\) return "Sedang";/);
  assert.match(page, /return "Cepat";/);
  assert.match(page, /<option value="left">Kiri<\/option>/);
  assert.match(page, /<option value="right">Kanan<\/option>/);
  assert.match(page, /min=\{TICKER_GAP_MIN\}/);
  assert.match(page, /Jeda saat disentuh atau ditunjuk/);
  assert.match(page, /<option value="megaphone">Pengeras suara<\/option>/);
  assert.match(page, /<option value="peringatan">Peringatan \(kuning\)<\/option>/);
  assert.match(page, /type="datetime-local"/);
  assert.match(page, /disabled=\{!dirty \|\| Boolean\(linkError\)\}/);
  assert.match(page, /Kembalikan default/);
  assert.match(page, /Simpan</);
  assert.match(page, /toast\.show\("Pengaturan info berjalan tersimpan dan langsung tampil di beranda\.", "success"\)/);
  assert.match(page, /Gagal menyimpan pengaturan info berjalan\.", "error"/);
  assert.match(page, /max-w-\[360px\] min-w-0/);
  assert.match(page, /<InfoTicker settings=\{form\} previewMode \/>/);
  assert.match(page, /Pratinjau/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(page, /overflow-x-hidden/);

  const sidebar = read('src/app/admin/AdminSidebar.tsx');
  assert.match(sidebar, /\["\/admin\/info-ticker", "🌀", "Info Berjalan"\]/);
});

test('v98 pembayaran, saldo, PIN, dan routing transaksi tidak tersentuh', () => {
  const untouched = [
    'src/app/api/topup/route.ts',
    'src/app/api/midtrans/webhook/route.ts',
    'src/app/api/orders/route.ts',
    'src/app/api/wallet/route.ts',
  ];
  for (const file of untouched) {
    if (!fs.existsSync(path.join(root, file))) continue;
    const source = read(file);
    assert.doesNotMatch(source, /info-ticker|info_ticker|site_settings/);
  }
  assert.doesNotMatch(read('src/components/HeroQuickMenu.tsx'), /\/wallet\/topup|\/checkout/);
});
