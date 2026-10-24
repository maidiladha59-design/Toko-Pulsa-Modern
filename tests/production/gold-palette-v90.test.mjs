import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('v90 palet emas tua: token pusat + CTA metalik dengan teks gelap', () => {
  const cfg = read('tailwind.config.ts');
  assert.match(cfg, /DEFAULT: "#C9A227"/);
  assert.match(cfg, /200: "#F0D878"/);
  assert.match(cfg, /300: "#D9B73B"/);
  assert.match(cfg, /400: "#C9A227"/);
  assert.match(cfg, /600: "#8A6D14"/);
  assert.match(cfg, /700: "#7A5F12"/);

  const css = read('src/app/globals.css');
  assert.match(css, /--app-accent: 201 162 39;/);
  assert.match(css, /--app-kicker: 122 95 18;/);
  assert.match(css, /\.btn-gold-metal \{/);
  assert.match(css, /linear-gradient\(135deg, #C9A227 0%, #E8C766 50%, #C9A227 100%\)/);
  assert.match(css, /linear-gradient\(135deg, #D9B73B 0%, #F0D878 50%, #D9B73B 100%\)/);
  assert.match(css, /color: #1A1200;/);
});

test('v90 Button bersama memakai kelas CTA pusat (flat glossy sejak v92)', () => {
  assert.match(read('src/components/ui/Button.tsx'), /primary: "btn-gold"/);
  assert.match(read('src/components/Button.tsx'), /primary: "btn-gold"/);
});

test('v90 halaman auth memakai emas metalik + tab aktif kontras gelap', () => {
  const login = read('src/app/login/page.tsx');
  assert.match(login, /btn-gold-metal/);
  assert.match(login, /bg-gold-400/);
  assert.match(login, /text-\[#1A1200\]/);

  const register = read('src/app/register/page.tsx');
  assert.match(register, /btn-gold-metal/);
  assert.match(register, /bg-gold-400/);
  assert.match(register, /text-\[#1A1200\]/);
});

test('v90 tidak ada hex/kuning lama atau kelas yellow-* di UI & manifest', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|jsx?|css|md|json|webmanifest)$/i.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(root, 'src'));
  files.push(path.join(root, 'public/manifest.webmanifest'));

  // #D4AF37 sengaja diizinkan lagi sebagai stop gradient .btn-gold v92.
  const legacy = /#F5C542|#B8941F|#E4B93A|#FCD34D|rgba\(\s*245\s*,\s*197\s*,\s*66|(?:bg|text|border|ring|from|via|to)-yellow-\d{2,3}/i;
  for (const file of files) {
    assert.doesNotMatch(
      fs.readFileSync(file, 'utf8'),
      legacy,
      `warna kuning lama masih ter-hardcode di ${path.relative(root, file)}`,
    );
  }
});

test('v90 manifest PWA memakai warna emas baru tanpa mengubah latar hitam', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.theme_color, '#C9A227');
  assert.equal(manifest.background_color, '#09090b');
  assert.equal(manifest.icons[0].src, '/aidil-logo.png');
});
