import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('v92 CTA biru flat glossy: gradient 135deg + highlight overlay tipis', () => {
  const css = read('src/app/globals.css');
  assert.match(css, /\.btn-gold \{/);
  assert.match(css, /linear-gradient\(135deg, #1565E0 0%, #1151B8 100%\)/);
  assert.match(css, /linear-gradient\(180deg, rgba\(255, 255, 255, \.22\) 0%, rgba\(255, 255, 255, 0\) 50%\)/);
  assert.match(css, /background-blend-mode: overlay;/);
  assert.match(css, /color: #F8FAFC;/);
  assert.match(css, /font-weight: 800;/);
  assert.match(css, /border: none;/);
  assert.match(css, /border-radius: 12px;/);
  assert.match(css, /box-shadow: 0 2px 8px rgba\(7, 31, 69, \.35\);/);
  assert.match(css, /transition: filter \.15s ease, box-shadow \.15s ease;/);
  assert.doesNotMatch(css, /\.btn-gold-3d/);
  assert.doesNotMatch(css, /translateY\(4px\)/);
  assert.doesNotMatch(css, /inset 0 2px 0/);
});

test('v92 hover/active/disabled tetap flat tanpa transform', () => {
  const css = read('src/app/globals.css');
  assert.match(css, /\.btn-gold:hover:not\(:disabled\) \{\s*filter: brightness\(1\.1\);\s*box-shadow: 0 4px 12px rgba\(7, 31, 69, \.4\);/);
  assert.match(css, /\.btn-gold:active:not\(:disabled\) \{\s*filter: brightness\(\.95\);/);
  assert.match(css, /\.btn-gold:disabled \{\s*background-image: linear-gradient\(135deg, #1565E0 0%, #1151B8 100%\);\s*background-blend-mode: normal;\s*filter: none;\s*opacity: \.5;\s*cursor: not-allowed;/);
  assert.doesNotMatch(css, /\.dark \.btn-gold/);
});

test('v92 kedua Button pusat memakai btn-gold', () => {
  assert.match(read('src/components/ui/Button.tsx'), /primary: "btn-gold"/);
  assert.match(read('src/components/Button.tsx'), /primary: "btn-gold"/);
});

test('v92 CTA utama halaman memakai btn-gold, kontrol sekunder tetap mint datar', () => {
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
    assert.match(read(file), /btn-gold(?!-)/, `${file} harus memakai CTA biru flat glossy`);
  }

  // Hierarki: tab aktif dan aksi sekunder/kompak tetap datar mint.
  assert.match(read('src/app/login/page.tsx'), /btn-gold-metal/);
  assert.match(read('src/app/register/page.tsx'), /btn-gold-metal/);
  assert.match(read('src/components/Navbar.tsx'), /btn-gold-metal/);
  assert.match(read('src/app/checkout/page.tsx'), /btn-gold-metal/);
  assert.match(read('src/app/wallet/topup/page.tsx'), /btn-gold-metal/);
});
