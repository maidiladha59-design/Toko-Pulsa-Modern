import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const LAYOUT = "src/app/layout.tsx";
const THEME_LIB = "src/lib/theme-settings.ts";
const CSS = "src/app/globals.css";
const HEADER_BUTTON = "src/components/ui/header-button.ts";
const NAVBAR = "src/components/Navbar.tsx";
const BELL = "src/components/NotificationBell.tsx";
const TOGGLE = "src/components/ThemeToggle.tsx";

test("v111 tema hanya diterapkan server di <html>, bukan oleh komponen client", () => {
  const layout = read(LAYOUT);

  // Layout dinamis: warna terbit tidak boleh ikut dipanggang ke shell rute statis.
  assert.match(layout, /import \{ unstable_noStore as noStore \} from "next\/cache";/);
  assert.match(layout, /noStore\(\);/);

  // Satu sumber kebenaran: nilai warna published ditulis inline di <html>.
  assert.match(layout, /style=\{themeHtmlVariables\(theme\) as React\.CSSProperties\}/);
  assert.match(layout, /<style id="theme-vars" dangerouslySetInnerHTML=\{\{ __html: buildThemeCss\(theme\) \}\} \/>/);

  // Dibaca lewat jalur published + tag cache yang sama dengan tombol Terbitkan.
  assert.match(layout, /getSetting\(THEME_SETTINGS_KEY, DEFAULT_THEME_SETTINGS\)/);

  // Tidak ada komponen client yang menulis variabel warna ke root.
  const walk = (dir) => {
    const out = [];
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) out.push(...walk(rel));
      else if (/\.(ts|tsx)$/.test(entry.name) && rel !== LAYOUT) out.push(rel);
    }
    return out;
  };
  for (const file of walk("src/components").concat(walk("src/app"))) {
    const source = read(file);
    assert.doesNotMatch(source, /documentElement\.style\.setProperty/, `${file} tidak boleh menimpa variabel tema`);
    assert.doesNotMatch(source, /style\.setProperty\(\s*["']--hero-/, `${file} tidak boleh menimpa warna hero`);
  }
});

test("v111 stylesheet tema hanya memakai default + pemetaan mode, bukan nilai terbit", () => {
  const lib = read(THEME_LIB);

  assert.match(lib, /export function themeHtmlVariables/);
  assert.match(lib, /vars\[`--theme-\$\{mode\}-\$\{name\.slice\(2\)\}`\] = value;/);
  assert.match(lib, /for \(const \[mode, colors\] of \[\["light", settings\.light\], \["dark", settings\.dark\]\] as const\)/);

  // buildThemeCss memakai nilai default sebagai fallback var(), bukan warna terbit.
  assert.match(lib, /`\$\{name\}: var\(--theme-\$\{mode\}-\$\{name\.slice\(2\)\}, \$\{value\}\);`/);
  assert.match(lib, /paletteMapping\(DEFAULT_LIGHT_VARS, "light"\)/);
  assert.match(lib, /paletteMapping\(DEFAULT_DARK_VARS, "dark"\)/);
});

test("v111 kartu hero membulat penuh: tidak ada lapisan persegi di belakangnya", () => {
  const css = read(CSS);

  assert.match(
    css,
    /\.app-hero \{\s*position: relative;\s*isolation: isolate;\s*overflow: hidden;\s*transform: translateZ\(0\);/,
  );
  assert.match(css, /\.app-hero::after \{ content: ""; position: absolute; inset: 0; border-radius: inherit;/);
  assert.match(css, /background: radial-gradient\(circle at 80% 15%, var\(--hero-glow\), transparent 34%\), linear-gradient\(135deg, var\(--hero-bg-from\) 0%, var\(--hero-bg-to\) 100%\);/);
  assert.doesNotMatch(css, /\.app-hero::before/);

  // Bayangan luar menempel pada wrapper beradius; versi gelap lebih rapat
  // supaya tidak terbaca sebagai tepi abu-abu.
  assert.match(css, /\.app-hero \{[\s\S]*?box-shadow: 0 24px 60px rgba\(0, 0, 0, \.28\);/);
  assert.match(css, /\.dark \.app-hero \{ box-shadow: 0 14px 34px rgba\(0, 0, 0, \.45\); \}/);
});

test("v111 tombol header seragam 44px dan memakai token tema", () => {
  const button = read(HEADER_BUTTON);
  assert.match(button, /export const HEADER_ICON_BUTTON =/);
  assert.match(button, /flex h-11 w-11 shrink-0 items-center justify-center rounded-xl/);
  assert.match(button, /border border-app-border bg-app-surface text-app-text/);

  for (const [file, marker] of [
    [NAVBAR, "Buka menu"],
    [TOGGLE, "Ganti tema"],
    [BELL, "Notifikasi"],
  ]) {
    const source = read(file);
    assert.match(source, /import \{ HEADER_ICON_BUTTON \} from "@\/components\/ui\/header-button";/);
    assert.ok(source.includes(marker), `${file} harus memakai tombol header bersama`);
  }

  // Badge menempel pada tombol lonceng (bukan header) agar tidak meleset di mobile.
  const bell = read(BELL);
  assert.match(bell, /className=\{`relative \$\{HEADER_ICON_BUTTON\}`\}/);
  assert.match(bell, /absolute -right-1 -top-1/);
  assert.match(bell, /ring-2 ring-\[color:var\(--card\)\]/);
  assert.doesNotMatch(bell, /className="relative sm:relative"/);
});
