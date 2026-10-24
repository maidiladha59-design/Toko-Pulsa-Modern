import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('v91 CTA emas 3D: gradient 180deg, sisi tebal 6px, teks terukir', () => {
  const css = read('src/app/globals.css');
  assert.match(css, /\.btn-gold-3d \{/);
  assert.match(css, /linear-gradient\(180deg, #F5D576 0%, #E8B93C 20%, #C9971F 55%, #A87415 80%, #8C5E10 100%\)/);
  assert.match(css, /inset 0 2px 0 rgba\(255, 255, 255, \.55\)/);
  assert.match(css, /inset 0 -3px 6px rgba\(0, 0, 0, \.35\)/);
  assert.match(css, /0 6px 0 #5C3F0A/);
  assert.match(css, /0 10px 18px rgba\(0, 0, 0, \.55\)/);
  assert.match(css, /border: 1px solid #7A5410;/);
  assert.match(css, /border-radius: 14px;/);
  assert.match(css, /color: #1A1200;/);
  assert.match(css, /font-weight: 900;/);
  assert.match(css, /text-shadow: 0 1px 0 rgba\(255, 255, 255, \.25\);/);
  assert.match(css, /transition: transform \.08s ease, box-shadow \.08s ease, background \.15s ease;/);
});

test('v91 CTA emas 3D: hover tetap tebal, active turun 4px, disabled flat', () => {
  const css = read('src/app/globals.css');
  assert.match(css, /\.btn-gold-3d:hover:not\(:disabled\) \{/);
  assert.match(css, /linear-gradient\(180deg, #F8DF8F 0%, #EEC652 20%, #D6A533 55%, #B88327 80%, #9E6E22 100%\)/);
  assert.match(css, /\.btn-gold-3d:active:not\(:disabled\) \{\s*transform: translateY\(4px\);/);
  assert.match(css, /0 2px 0 #5C3F0A/);
  assert.match(css, /\.btn-gold-3d:disabled \{/);
  assert.match(css, /opacity: \.5;/);
  assert.match(css, /cursor: not-allowed;/);
  assert.match(css, /\.dark \.btn-gold-3d:not\(:disabled\) \{\s*filter: drop-shadow\(0 0 12px rgba\(230, 180, 60, \.25\)\);/);
});

test('v91 kedua Button pusat memakai btn-gold-3d', () => {
  assert.match(read('src/components/ui/Button.tsx'), /primary: "btn-gold-3d"/);
  assert.match(read('src/components/Button.tsx'), /primary: "btn-gold-3d"/);
});

test('v91 CTA utama halaman memakai 3D, kontrol sekunder tetap datar', () => {
  const primaryCtas = [
    'src/app/checkout/page.tsx',
    'src/app/transfer-uang/TransferForm.tsx',
    'src/app/transfer-uang/qr/PersonalQrClient.tsx',
    'src/app/wallet/page.tsx',
    'src/app/wallet/topup/page.tsx',
    'src/app/products/[slug]/page.tsx',
    'src/app/split-bill/SplitBillClient.tsx',
    'src/app/split-bill/[id]/SplitBillDetailClient.tsx',
    'src/app/scan-qris/page.tsx',
    'src/app/scan-qris/qris-confirm/page.tsx',
    'src/app/kyc/page.tsx',
    'src/app/admin-login/page.tsx',
    'src/app/akun-diblokir/page.tsx',
    'src/components/NetworkState.tsx',
    'src/components/ui/ErrorState.tsx',
    'src/components/TransactionCenter.tsx',
    'src/components/PrintButton.tsx',
    'src/components/PPOBServiceGrid.tsx',
  ];
  for (const file of primaryCtas) {
    assert.match(read(file), /btn-gold-3d/, `${file} harus memakai CTA emas 3D`);
  }

  // Hierarki: tab aktif dan aksi sekunder/kompak tetap datar.
  assert.match(read('src/app/login/page.tsx'), /btn-gold-metal/);
  assert.match(read('src/app/register/page.tsx'), /btn-gold-metal/);
  assert.match(read('src/components/Navbar.tsx'), /btn-gold-metal/);
  assert.match(read('src/app/checkout/page.tsx'), /btn-gold-metal/);
  assert.match(read('src/app/wallet/topup/page.tsx'), /btn-gold-metal/);
});
