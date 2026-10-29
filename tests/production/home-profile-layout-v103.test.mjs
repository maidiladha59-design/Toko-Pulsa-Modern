import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('v103 hero profile: dua kolom avatar + identitas, saldo blok sendiri', () => {
  const header = read('src/components/profile/ProfileHeader.tsx');
  // Baris utama membungkus di layar sempit, sejajar di sm+.
  assert.match(header, /flex w-full min-w-0 max-w-full flex-wrap items-start gap-3 sm:flex-nowrap sm:gap-4/);
  // Nama tetap satu baris dengan ellipsis.
  assert.match(header, /className="block truncate text-\[18px\] font-semibold leading-6 text-white" title=\{name\}/);
  // Saldo keluar dari deretan chip: label kecil + angka besar + tombol mata.
  assert.match(header, /text-\[10px\] font-semibold uppercase tracking-widest text-zinc-400">Saldo</);
  assert.match(header, /mt-1 block truncate text-xl font-black leading-7 tabular-nums text-white sm:text-right sm:text-2xl/);
  assert.match(header, /aria-label=\{hidden \? "Tampilkan saldo" : "Sembunyikan saldo"\}/);
  assert.match(header, /w-full shrink-0 rounded-2xl border border-white\/10 bg-white\/5 px-3 py-2\.5 sm:w-48/);
  // Satu wadah deretan lencana, jarak konsisten.
  assert.match(header, /<div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">\n\s+\{status \? <KycChip status=\{status\} tone="hero" \/> : null\}\n\s+<LevelChip transactions=\{transactions\} \/>/);
  assert.doesNotMatch(header, /overflow-x-hidden/);
});

test('v103 lencana seragam: tinggi, padding, dan ukuran font sama', () => {
  const header = read('src/components/profile/ProfileHeader.tsx');
  const kyc = read('src/components/profile/KycChip.tsx');
  const level = read('src/components/profile/LevelChip.tsx');

  assert.match(kyc, /inline-flex min-h-6 max-w-full items-center gap-1 rounded-full border px-2\.5 text-\[11px\] font-semibold leading-4/);
  assert.match(level, /inline-flex h-6 items-center gap-1 rounded-full border px-2\.5 text-\[11px\] font-semibold leading-4/);
  assert.match(header, /inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-white\/15 bg-white\/10 px-2\.5 text-\[11px\] font-semibold leading-4/);
});

test('v103 logic profil tidak berubah: salin ID, sembunyikan saldo, picker avatar', () => {
  const header = read('src/components/profile/ProfileHeader.tsx');
  assert.match(header, /const BALANCE_HIDDEN_KEY = "aidilstore_balance_hidden";/);
  assert.match(header, /toast\.show\("ID disalin", "success"\)/);
  assert.match(header, /navigator\.clipboard\.writeText\(shortId\)/);
  assert.match(header, /onClick=\{toggleBalance\}/);
  assert.match(header, /href="\/wallet"/);
  assert.match(header, /aria-label="Ganti foto profil"/);
  assert.match(header, /onClick=\{\(\) => setPickerOpen\(true\)\}/);
  assert.match(header, /<AvatarPicker/);
});
