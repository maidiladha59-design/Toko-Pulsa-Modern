import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('v95 token warna baru: gold-* biru, mint-* hijau muda, gradient biru→mint', () => {
  const cfg = read('tailwind.config.ts');
  // Biru menempati token legacy gold-* (tanpa rename class di halaman).
  assert.match(cfg, /gold: \{[\s\S]*?DEFAULT: "#2E9EF5"/);
  assert.match(cfg, /gold: \{[\s\S]*?400: "#2E9EF5"/);
  assert.match(cfg, /gold: \{[\s\S]*?600: "#1565E0"/);
  assert.match(cfg, /gold: \{[\s\S]*?950: "#071F45"/);
  // Hijau muda sebagai token terpisah.
  assert.match(cfg, /mint: \{[\s\S]*?DEFAULT: "#8CD93A"/);
  assert.match(cfg, /mint: \{[\s\S]*?400: "#8CD93A"/);
  assert.match(cfg, /mint: \{[\s\S]*?600: "#5BBE1F"/);
  // Gradient identitas diagonal biru → hijau.
  assert.match(
    cfg,
    /"brand-gradient":\s*\n\s*"linear-gradient\(135deg, #2E9EF5 0%, #1565E0 45%, #5BBE1F 100%\)"/,
  );
});

test('v95 CSS pusat: accent biru, CTA primer biru, CTA sekunder mint', () => {
  const css = read('src/app/globals.css');
  assert.match(css, /--app-accent: 46 158 245;/);
  assert.match(css, /--app-kicker: 17 81 184;/);
  assert.match(css, /--app-kicker: 124 201 252;/, 'kicker mode gelap lebih terang');
  assert.match(css, /\.btn-gold \{[\s\S]*?linear-gradient\(135deg, #1565E0 0%, #1151B8 100%\)/);
  assert.match(css, /\.btn-gold \{[\s\S]*?color: #F8FAFC;/);
  assert.match(css, /\.btn-gold-metal \{[\s\S]*?linear-gradient\(135deg, #8CD93A 0%, #5BBE1F 100%\)/);
  assert.match(css, /\.btn-gold-metal \{[\s\S]*?color: #0B1A05;/);
  assert.match(css, /bg-brand-gradient/, 'gradient brand didokumentasikan di komentar CSS');
});

test('v95 komponen: primary biru, secondary mint, status Berhasil tetap emerald', () => {
  const button = read('src/components/ui/Button.tsx');
  assert.match(button, /primary: "btn-gold"/);
  assert.match(button, /secondary:\s*\n\s*"bg-mint-400 text-zinc-950/);

  const badge = read('src/components/ui/Badge.tsx');
  assert.match(badge, /success: "bg-success-100 text-success-800/);
  assert.match(badge, /mint: "bg-mint-100 text-mint-800/);
  assert.match(badge, /"gold" \| "mint"/);

  for (const file of ['src/components/ui/Input.tsx', 'src/components/ui/Select.tsx']) {
    assert.match(read(file), /focus:border-gold-400 focus:ring-gold-400\/20/, `${file} fokus memakai token biru`);
  }

  const readme = read('src/components/ui/README.md');
  for (const pin of ['bg-brand-gradient', 'mint-*', 'emerald', 'BUKAN mint']) {
    assert.ok(readme.includes(pin), `README harus menjelaskan: ${pin}`);
  }
});

test('v95 branding hardcoded memakai biru/mint, bukan hex emas lama', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.theme_color, '#2E9EF5');
  assert.equal(manifest.background_color, '#09090b');

  assert.match(read('src/components/AppLoader.tsx'), /rgba\(46,158,245,0\.45\)/);
  assert.match(read('src/components/WelcomeExperience.tsx'), /rgba\(46,158,245,0\.2\)/);
  assert.match(read('src/components/WelcomeExperience.tsx'), /rgba\(140,217,58,0\.12\)/);
  assert.match(read('src/components/ToastProvider.tsx'), /bg: "#2E9EF5"/);

  const legacyGold = /#C9A227|#F0D878|#D9B73B|#B08D21|#8A6D14|#7A5F12/i;
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|jsx?|css|md)$/i.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(root, 'src'));
  for (const file of files) {
    assert.doesNotMatch(
      fs.readFileSync(file, 'utf8'),
      legacyGold,
      `hex emas lama masih ada di ${path.relative(root, file)}`,
    );
  }
});
