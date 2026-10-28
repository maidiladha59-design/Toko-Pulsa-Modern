import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// Bug v96: checkout produk dengan nama panjang (mis. TV "K-Vision & GOL Paket CLING
// (CL06) 180 Hari") membuat halaman lebih lebar dari viewport, sehingga di HP
// seluruh layout ter-render seperti mode desktop. Akar masalahnya: <aside> ringkasan
// adalah grid item dengan min-width:auto yang dilebarkan oleh nama produk ber-`truncate`
// (white-space:nowrap), jadi lebar minimum grid mengikuti teks penuh yang tidak terpotong.
const page = () => read('src/app/checkout/page.tsx');

test('v96 ringkasan checkout: grid item boleh menyusut (min-w-0) dan nama paket wrap', () => {
  assert.match(page(), /<aside className="h-fit min-w-0/);
  assert.match(page(), /<div className="min-w-0 space-y-5">/);
  assert.match(page(), /lg:grid-cols-\[minmax\(0,1fr\)_360px\]/);
  assert.match(page(), /<p className="mt-3 break-words font-bold text-app-text">\{product\.name\}<\/p>/);
});

test('v96 teks panjang lain di checkout punya batas break, bukan nowrap tanpa min-w-0', () => {
  assert.match(page(), /<p className="break-words font-black text-app-text">\{product\.name\}<\/p>/);
  assert.match(page(), /<div className="min-w-0"><p className="text-xs font-bold text-app-muted">Pelanggan<\/p><p className="break-words font-black text-app-text">/);
  assert.match(page(), /<div className="shrink-0 text-right"><p className="text-xs font-bold text-app-muted">Total tagihan<\/p>/);
  assert.match(page(), /\[&>\*\]:min-w-0 \[&>\*\]:break-words/);
});

test('v96 overflow tidak ditutup-tutupi dengan overflow-x hidden', () => {
  assert.doesNotMatch(page(), /overflow-x-hidden/);
  assert.doesNotMatch(page(), /truncate font-bold text-app-text/);
});
