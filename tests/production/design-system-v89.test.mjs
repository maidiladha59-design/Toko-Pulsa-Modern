import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('v89 token warna: palet biru (gold legacy) + mint, semantik success/danger/warning alias palet bawaan', () => {
  const cfg = read('tailwind.config.ts');
  // Identitas default "Biru Neon": biru #1573D1 terang / #3AA7FF gelap.
  // DEFAULT & 400 gold-*/mint-* kini membaca variabel tema sehingga ikut
  // berubah saat admin menerbitkan tema baru; shade lain tetap statis.
  assert.match(cfg, /gold: \{[\s\S]*?DEFAULT: "rgb\(var\(--app-accent\) \/ <alpha-value>\)"/);
  assert.match(cfg, /200: "#B6E0FF"/);
  assert.match(cfg, /300: "#7CC9FC"/);
  assert.match(cfg, /gold: \{[\s\S]*?400: "rgb\(var\(--app-accent\) \/ <alpha-value>\)"/);
  assert.match(cfg, /600: "#1565E0"/);
  assert.match(cfg, /700: "#1151B8"/);
  assert.match(cfg, /950: "#071F45"/);
  assert.match(cfg, /mint: \{/);
  assert.match(cfg, /mint: \{[\s\S]*?DEFAULT: "rgb\(var\(--theme-accent-rgb\) \/ <alpha-value>\)"/);
  assert.match(cfg, /mint: \{[\s\S]*?400: "rgb\(var\(--theme-accent-rgb\) \/ <alpha-value>\)"/);
  assert.match(cfg, /600: "#5BBE1F"/);
  assert.match(cfg, /"brand-gradient":/);
  // Teks di atas warna tema selalu memakai kontras yang dihitung server.
  assert.match(cfg, /"on-primary": "var\(--primary-contrast\)"/);
  assert.match(cfg, /"on-accent": "var\(--accent-contrast\)"/);
  // Token semantik = alias 1:1 palet bawaan Tailwind (bukan warna baru).
  assert.match(cfg, /import colors from "tailwindcss\/colors";/);
  assert.match(cfg, /success: \{ \.\.\.colors\.emerald, DEFAULT: colors\.emerald\[600\] \}/);
  assert.match(cfg, /danger: \{ \.\.\.colors\.red, DEFAULT: colors\.red\[600\] \}/);
  assert.match(cfg, /warning: \{ \.\.\.colors\.amber, DEFAULT: colors\.amber\[500\] \}/);
  // Token tema app-* tetap ada.
  assert.match(cfg, /"accent-soft": "rgb\(var\(--app-accent-soft\) \/ <alpha-value>\)"/);
});

test('v89 acuan desain: tipografi, spacing, radius terdokumentasi di atas globals.css', () => {
  const css = read('src/app/globals.css');
  assert.match(css, /ACUAN DESAIN AIDIL STORE/);
  assert.match(css, /Judul halaman\s*:\s*text-2xl font-black/);
  assert.match(css, /Judul kartu\s*:\s*text-base font-black/);
  assert.match(css, /Caption\/hint\s*:\s*text-xs text-app-subtle/);
  assert.match(css, /Padding kartu standar\s*:\s*p-5/);
  assert.match(css, /Jarak antar section\s*:\s*mt-5 \/ space-y-5/);
  assert.match(css, /Kartu utama \/ panel\s*:\s*rounded-3xl/);
  // Token tema memakai biru brand default (Biru Neon).
  assert.match(css, /--app-accent: 21 115 209;/);
  assert.match(css, /--app-kicker: 18 104 189;/);
  assert.match(css, /--app-accent: 58 167 255;/, 'mode gelap memakai biru lebih terang');
  assert.match(css, /--app-radius-button: 0.875rem;/, 'radius tombol 14px');
  assert.match(css, /\.dark \{/, 'mode gelap tetap ada');
});

test('v89 Button: 5 varian, 3 ukuran, state loading & disabled', () => {
  const src = read('src/components/ui/Button.tsx');
  assert.match(src, /"use client"/);
  assert.match(src, /export type ButtonVariant = "primary" \| "secondary" \| "outline" \| "ghost" \| "destructive";/);
  assert.match(src, /export type ButtonSize = "sm" \| "md" \| "lg";/);
  assert.match(src, /loading = false/);
  assert.match(src, /animate-spin/);
  assert.match(src, /disabled:cursor-not-allowed disabled:opacity-50/);
  assert.match(src, /primary: "btn-gold"/);
  assert.match(src, /secondary:\s*\n\s*"bg-mint-400 text-app-on-accent/);
  assert.match(src, /destructive:\s*\n\s*"bg-danger-600 text-white/);
});

test('v89 Card: rounded-3xl + p-5 + token tema, header/title/body/footer lengkap', () => {
  const src = read('src/components/ui/Card.tsx');
  for (const name of ['Card', 'CardHeader', 'CardTitle', 'CardDescription', 'CardBody', 'CardFooter']) {
    assert.match(src, new RegExp(`export function ${name}\\(`), `Card harus mengekspor ${name}`);
  }
  assert.match(src, /rounded-3xl border border-app-border bg-app-surface p-5 shadow-sm/);
  assert.doesNotMatch(src, /bg-white|bg-zinc-900/, 'Card wajib token tema, bukan warna hardcoded');
});

test('v89 Badge: tone semantik + statusTone memetakan status internal', () => {
  const src = read('src/components/ui/Badge.tsx');
  assert.match(src, /export type BadgeTone = "success" \| "danger" \| "warning" \| "neutral" \| "gold" \| "mint";/);
  assert.match(src, /export function statusTone\(/);
  assert.match(src, /bg-success-100 text-success-800 dark:bg-success-500\/15 dark:text-success-300/);
  assert.match(src, /bg-danger-100 text-danger-800 dark:bg-danger-500\/15 dark:text-danger-300/);
  assert.match(src, /bg-warning-100 text-warning-800 dark:bg-warning-500\/15 dark:text-warning-300/);
  assert.match(src, /mint: "bg-mint-100 text-mint-800/);
  assert.match(src, /rounded-full px-3 py-1 text-xs font-medium/);
  // Status internal yang wajib dikenali.
  for (const s of ['"SUCCESS"', '"FAILED"', '"PENDING"', '"EXPIRED"', '"PROCESSING"']) {
    assert.ok(src.includes(s), `statusTone harus menangani ${s}`);
  }
});

test('v89 Input & Select: state error tegas, focus emas, pesan di bawah field', () => {
  for (const f of ['src/components/ui/Input.tsx', 'src/components/ui/Select.tsx']) {
    const src = read(f);
    assert.match(src, /error\?: string \| null/);
    assert.match(src, /border-danger-400 focus:border-danger-500 focus:ring-danger-500\/20/);
    assert.match(src, /border-app-border focus:border-gold-400 focus:ring-gold-400\/20/);
    assert.match(src, /role="alert"/);
    assert.match(src, /text-danger-600 dark:text-danger-400/);
    assert.match(src, /aria-invalid=\{error \? true : undefined\}/);
  }
  assert.match(read('src/components/ui/Select.tsx'), /appearance-none/);
});

test('v89 EmptyState/LoadingSkeleton/ErrorState: pola status muat data yang canonical', () => {
  const empty = read('src/components/ui/EmptyState.tsx');
  assert.match(empty, /border-dashed border-app-border/);
  assert.match(empty, /action\?: ReactNode/);

  const skeleton = read('src/components/ui/LoadingSkeleton.tsx');
  assert.match(skeleton, /export default function LoadingSkeleton\(/);
  assert.match(skeleton, /export function Skeleton\(/);
  assert.match(skeleton, /animate-pulse/);
  assert.match(skeleton, /aria-busy="true"/);

  const error = read('src/components/ui/ErrorState.tsx');
  assert.match(error, /onRetry\?: \(\) => void/);
  assert.match(error, /role="alert"/);
  assert.match(error, /Coba Lagi/);
});

test('v89 README design system ada dan menjelaskan token + komponen + komponen lama', () => {
  const readme = read('src/components/ui/README.md');
  // Baseline suite setelah v90 (5 guard test palet emas) adalah 245/223/22.
  for (const pin of ['statusTone', 'p-5', 'rounded-3xl', 'success-*', 'ui/Button', 'StatusBadge.tsx', 'NetworkState.tsx', '300 tests / 279 pass / 21 fail']) {
    assert.ok(readme.includes(pin), `README harus menjelaskan: ${pin}`);
  }
});
