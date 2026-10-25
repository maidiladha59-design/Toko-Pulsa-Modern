import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const LUPA = "src/app/lupa-password/LupaPasswordForm.tsx";
const VERIFY = "src/app/verifikasi-kode-reset/VerifikasiKodeResetForm.tsx";
const RESET = "src/app/reset-password/ResetPasswordForm.tsx";
const LIB = "src/lib/password-reset.ts";

test("lupa password mengirim kode OTP tanpa redirectTo dan pindah ke halaman verifikasi", () => {
  const form = read(LUPA);

  assert.match(form, /resetPasswordForEmail\(cleanEmail\)/);
  assert.doesNotMatch(form, /redirectTo\s*:/, "permintaan reset tidak boleh memakai redirectTo");
  assert.match(form, /startResetCooldown\(cleanEmail\)/);
  assert.match(form, /\/verifikasi-kode-reset\?email=\$\{encodeURIComponent\(cleanEmail\)\}/);
  assert.match(form, /Kode verifikasi 6 digit sudah dikirim ke email kamu, masukkan kode di bawah ini\./);
  assert.match(form, /Kirim Kode Verifikasi/);
  assert.match(form, /useRouter/);

  const page = read("src/app/lupa-password/page.tsx");
  assert.match(page, /kode verifikasi 6 digit/i);
});

test("halaman verifikasi-kode-reset memakai verifyOtp recovery dengan input 6 digit", () => {
  const page = read("src/app/verifikasi-kode-reset/page.tsx");
  assert.match(page, /Suspense/);

  const form = read(VERIFY);
  assert.match(form, /const CODE_LENGTH = 6/);
  assert.match(form, /supabase\.auth\.verifyOtp\(\{/);
  assert.match(form, /token: code,/);
  assert.match(form, /type: "recovery"/);
  assert.match(form, /inputMode="numeric"/);
  assert.match(form, /autoComplete="one-time-code"/);
  assert.match(form, /maxLength=\{CODE_LENGTH\}/);
  assert.match(form, /router\.replace\("\/reset-password"\)/);
  assert.match(form, /friendlyPasswordResetError\(verifyError\.message\)/);
  assert.match(form, /Kirim Ulang Kode/);
  assert.match(form, /RESET_CODE_COOLDOWN_SECONDS/);
  assert.doesNotMatch(form, /redirectTo\s*:/, "kirim ulang tidak boleh memakai redirectTo");
  assert.match(form, /resetPasswordForEmail\(email\)/);
  assert.match(form, /readResetCooldown\(email\)/);
  assert.match(form, /startResetCooldown\(email\)/);
});

test("lib password-reset: cooldown 60 detik dan pesan error OTP yang jelas", () => {
  const lib = read(LIB);

  assert.match(lib, /RESET_CODE_COOLDOWN_SECONDS = 60/);
  assert.match(lib, /sessionStorage/);
  assert.match(lib, /Kode salah atau sudah kedaluwarsa\. Periksa kembali atau kirim ulang kode\./);
  assert.match(lib, /Sesi verifikasi tidak ditemukan atau sudah berakhir/);
  assert.match(lib, /Terlalu banyak permintaan/);
  assert.match(lib, /isEmailEnumerationError/);
});

test("reset-password memakai session verifyOtp, bukan token dari URL", () => {
  const form = read(RESET);

  assert.match(form, /supabase\.auth\.getSession\(\)/);
  assert.match(form, /supabase\.auth\.updateUser\(\{\s*password,?\s*\}\)/);
  assert.match(form, /password\.length < 8/);
  assert.match(form, /password !== confirm/);
  assert.match(form, /signOut/);
  assert.match(form, /router\.replace\("\/login\?reset=success"\)/);
  assert.doesNotMatch(form, /window\.location\.search/);
  assert.doesNotMatch(form, /window\.location\.hash/);
  assert.doesNotMatch(form, /access_token/);
  assert.doesNotMatch(form, /PASSWORD_RECOVERY/);
  assert.doesNotMatch(form, /redirectTo\s*:/);
});

test("login menampilkan pesan sukses setelah password diubah", () => {
  const login = read("src/app/login/page.tsx");

  assert.match(login, /searchParams\.get\("reset"\) === "success"/);
  assert.match(login, /Password berhasil diubah\. Silakan login dengan password baru\./);
});

test("halaman verifikasi kode terdaftar sebagai rute publik", () => {
  const middleware = read("src/lib/supabase/middleware.ts");
  assert.match(middleware, /"\/verifikasi-kode-reset"/);

  const robots = read("src/app/robots.ts");
  assert.match(robots, /"\/verifikasi-kode-reset"/);

  const welcome = read("src/components/WelcomeExperience.tsx");
  assert.match(welcome, /pathname === "\/verifikasi-kode-reset"/);
});
