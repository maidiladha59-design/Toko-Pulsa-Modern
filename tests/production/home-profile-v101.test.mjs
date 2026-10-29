import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('v101 level: ambang transaksi berhasil', async () => {
  const { LEVELS, levelForCount, nextLevel } = await import('../../src/config/levels.ts');
  assert.deepEqual(
    LEVELS.map((tier) => [tier.label, tier.min, tier.max]),
    [
      ['Bronze', 0, 9],
      ['Silver', 10, 49],
      ['Gold', 50, 149],
      ['Platinum', 150, 399],
      ['Diamond', 400, Infinity],
    ]
  );
  assert.equal(levelForCount(0).key, 'bronze');
  assert.equal(levelForCount(9).key, 'bronze');
  assert.equal(levelForCount(10).key, 'silver');
  assert.equal(levelForCount(49).key, 'silver');
  assert.equal(levelForCount(50).key, 'gold');
  assert.equal(levelForCount(149).key, 'gold');
  assert.equal(levelForCount(150).key, 'platinum');
  assert.equal(levelForCount(399).key, 'platinum');
  assert.equal(levelForCount(400).key, 'diamond');
  assert.equal(levelForCount(-5).key, 'bronze');
  assert.equal(levelForCount(Number.NaN).key, 'bronze');
  // Tooltip "X transaksi lagi menuju Gold".
  assert.deepEqual(nextLevel(45), { tier: LEVELS[2], remaining: 5 });
  assert.equal(nextLevel(400), null);
});

test('v101 sapaan: batas jam WIB', async () => {
  const { GREETING, greetingForHour } = await import('../../src/lib/labels.ts');
  assert.equal(greetingForHour(0), GREETING.malam);
  assert.equal(greetingForHour(3), GREETING.malam);
  assert.equal(greetingForHour(4), GREETING.pagi);
  assert.equal(greetingForHour(10), GREETING.pagi);
  assert.equal(greetingForHour(11), GREETING.siang);
  assert.equal(greetingForHour(14), GREETING.siang);
  assert.equal(greetingForHour(15), GREETING.sore);
  assert.equal(greetingForHour(17), GREETING.sore);
  assert.equal(greetingForHour(18), GREETING.malam);
  assert.equal(greetingForHour(23), GREETING.malam);
  assert.equal(GREETING.welcome, 'Selamat datang,');
});

test('v101 status KYC: dipetakan dari kyc_verifications.status', async () => {
  const { kycUiStatus, KYC_UI_LABELS, KYC_VERIFY_HINT } = await import('../../src/lib/labels.ts');
  assert.equal(kycUiStatus('VERIFIED'), 'verified');
  assert.equal(kycUiStatus('SUBMITTED'), 'pending');
  assert.equal(kycUiStatus('KTP_SUBMITTED'), 'pending');
  assert.equal(kycUiStatus('REJECTED'), 'rejected');
  assert.equal(kycUiStatus('PENDING'), 'unverified');
  assert.equal(kycUiStatus('UNVERIFIED'), 'unverified');
  assert.equal(kycUiStatus(null), null, 'gagal dimuat = chip disembunyikan');
  assert.equal(kycUiStatus(''), null);
  assert.deepEqual(KYC_UI_LABELS, {
    verified: 'Terverifikasi',
    unverified: 'Akun belum terverifikasi',
    pending: 'Verifikasi diproses',
    rejected: 'Verifikasi ditolak. Ajukan ulang',
  });
  assert.equal(
    KYC_VERIFY_HINT,
    'Verifikasi untuk membuka cincin warna-warni dan keamanan lebih baik'
  );
});

test('v101 sapaan dihitung di browser dengan jam Asia/Jakarta', () => {
  const greeting = read('src/components/profile/GreetingText.tsx');
  assert.match(greeting, /"use client"/);
  assert.match(greeting, /timeZone: "Asia\/Jakarta"/);
  assert.match(greeting, /formatToParts/);
  assert.match(greeting, /60_000/);
  assert.match(greeting, /useState<string \| null>\(null\)/);
  assert.match(greeting, /greeting \?\? "\\u00A0"/, 'render awal netral agar tidak ada mismatch hidrasi');
  assert.match(greeting, /GREETING\.welcome/);
});

test('v101 cincin avatar: gradasi berputar hanya saat terverifikasi', () => {
  const css = read('src/app/globals.css');
  assert.match(css, /@keyframes avatar-ring-spin \{ to \{ transform: rotate\(360deg\); \} \}/);
  assert.match(css, /\.avatar-ring-spin \{\s*animation: avatar-ring-spin 5s linear infinite;\s*will-change: transform;/);
  assert.match(css, /conic-gradient\(from 0deg, #f87171, #fb923c, #facc15, #4ade80, #22d3ee, #3b82f6, #a855f7, #f87171\)/);
  assert.match(css, /--app-hero-bg: 9 9 11;/);
  assert.match(css, /\.avatar-ring-glow \{ box-shadow: 0 0 14px rgb\(var\(--app-accent\) \/ \.38\); \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.avatar-ring-spin \{ animation: none !important; \}/);

  const ring = read('src/components/profile/AvatarRing.tsx');
  assert.match(ring, /export type AvatarRingStatus = "verified" \| "unverified" \| "pending" \| "rejected";/);
  assert.match(ring, /gap\?: "surface" \| "hero";/);
  assert.match(ring, /status === "pending"\s*\?\s*"bg-warning"/);
  assert.match(ring, /bg-danger-500\/45/);
  assert.match(ring, /avatar-ring-verified avatar-ring-spin avatar-ring-glow/);
  assert.match(ring, /inset-\[2px\]/, 'celah 2px antara cincin dan foto');
  assert.match(ring, /inset-\[4px\]/);
  assert.match(ring, /viewBox="0 0 12 12"/, 'lencana centang digambar sendiri, bukan emoji');
  assert.doesNotMatch(ring, /✎|✅|✔/u);
  assert.doesNotMatch(ring, /\u{1F600}-\u{1F64F}/u);
});

test('v101 blok profil hero: chip KYC, level, ID, saldo', () => {
  const header = read('src/components/profile/ProfileHeader.tsx');
  assert.match(header, /const BALANCE_HIDDEN_KEY = "aidilstore_balance_hidden";/);
  assert.match(header, /window\.localStorage\.getItem\(BALANCE_HIDDEN_KEY\)/);
  assert.match(header, /window\.localStorage\.setItem\(BALANCE_HIDDEN_KEY/);
  assert.match(header, /toast\.show\("ID disalin", "success"\)/);
  assert.match(header, /navigator\.clipboard\.writeText\(shortId\)/);
  assert.match(header, /href="\/wallet"/);
  assert.match(header, /hidden \? "Rp ••••" : formatRupiah\(balance\)/);
  assert.match(header, /status === "unverified" \?/);
  assert.match(header, /\{KYC_VERIFY_HINT\}/);
  assert.match(header, /<LevelChip transactions=\{transactions\} \/>/);
  assert.match(header, /<KycChip status=\{status\} tone="hero" \/>/);
  assert.match(header, /aria-label="Ganti foto profil"/);
  assert.match(header, /kycStatus=\{status \?\? "unverified"\}/);

  const level = read('src/components/profile/LevelChip.tsx');
  assert.match(level, /href="\/ranking"/);
  assert.match(level, /Lv\. \{tier\.label\}/);
  assert.match(level, /transaksi lagi menuju/);
  assert.match(level, /<Icon name="star_fill" size=\{11\} className="shrink-0" \/>/);

  const chip = read('src/components/profile/KycChip.tsx');
  assert.match(chip, /status === "unverified" \|\| status === "rejected"/);
  assert.match(chip, /<Link href="\/kyc"/);
});

test('v101 beranda memuat KYC, saldo, dan transaksi dalam batch yang sama', () => {
  const home = read('src/app/page.tsx');
  assert.match(home, /s\.from\('kyc_verifications'\)\.select\('status'\)\.eq\('user_id',user\.id\)\.maybeSingle\(\)/);
  assert.match(home, /s\.from\('wallets'\)\.select\('balance'\)\.eq\('user_id',user\.id\)\.maybeSingle\(\)/);
  assert.match(home, /s\.from\('user_rankings'\)\.select\('successful_transactions'\)\.eq\('user_id',user\.id\)\.maybeSingle\(\)/);
  assert.match(home, /kycStatus:kycError\?null:\(kyc\?\.status\?\?'UNVERIFIED'\)/);
  assert.match(home, /<HeroUser name=\{accountData\.name\}[^>]*kycStatus=\{accountData\.kycStatus\}[^>]*balance=\{accountData\.balance\}[^>]*transactions=\{accountData\.transactions\}[^>]*accountId=\{accountData\.accountId\}\/>/);
  assert.match(home, /<GreetingText guest/);

  const picker = read('src/components/AvatarPicker.tsx');
  assert.match(picker, /kycStatus\?: AvatarRingStatus/);
  assert.match(picker, /<AvatarRing size=\{40\} src=\{currentUrl\} status=\{kycStatus\}/);
});
