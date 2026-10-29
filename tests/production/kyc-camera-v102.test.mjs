import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const HOOK = 'src/hooks/useCamera.ts';
const PAGE = 'src/app/kyc/page.tsx';

test('v102 hook useCamera: default facing, fallback berlapis, satu stream', () => {
  const hook = read(HOOK);
  assert.match(hook, /export type CameraFacing = "user" \| "environment";/);
  assert.match(hook, /video: \{ facingMode: \{ ideal: facing \}, \.\.\.RESOLUTION \}/);
  assert.match(hook, /video: \{ deviceId: \{ exact: deviceId \}, \.\.\.RESOLUTION \}/);
  assert.match(hook, /getUserMedia\(\{ video: true, audio: false \}\)/);
  assert.match(hook, /width: \{ ideal: 1280 \}/);
  assert.match(hook, /height: \{ ideal: 720 \}/);
  // Hentikan semua track + lepas srcObject sebelum membuka kamera berikutnya.
  assert.match(hook, /stream\?\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(hook, /video\.srcObject = null;/);
  assert.match(hook, /if \(busyRef\.current\) return;/);
  assert.match(hook, /busyRef\.current = true;/);
  assert.match(hook, /navigator\.mediaDevices\.enumerateDevices\(\)/);
});

test('v102 ganti kamera: kembali ke kamera sebelumnya kalau gagal, log error asli', () => {
  const hook = read(HOOK);
  assert.match(hook, /const target: CameraFacing = previous === "user" \? "environment" : "user";/);
  assert.match(hook, /console\.error\("\[kamera\] gagal mengganti kamera, kembali ke kamera sebelumnya", error\)/);
  assert.match(hook, /const fallback = await openMedia\(previous\);/);
  assert.match(hook, /setSwitching\(true\)/);
  assert.match(hook, /setSwitching\(false\)/);
});

test('v102 hook membersihkan stream saat unmount dan tab disembunyikan', () => {
  const hook = read(HOOK);
  assert.match(hook, /document\.visibilityState === "hidden"/);
  assert.match(hook, /resumeOnVisibleRef\.current = activeRef\.current;/);
  assert.match(hook, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
  assert.match(hook, /document\.removeEventListener\("visibilitychange", onVisibilityChange\)/);
  assert.match(hook, /mountedRef\.current = false;/);
  assert.match(hook, /if \(!mountedRef\.current\) \{\n\s+stream\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\);/);
});

test('v102 halaman KYC: default depan untuk wajah, belakang untuk KTP', () => {
  const page = read(PAGE);
  assert.match(page, /import \{ useCamera, type CameraErrorKind \} from "@\/hooks\/useCamera";/);
  assert.match(page, /camera\.start\(stage === "selfie" \? "user" : "environment"\)/);
  assert.match(page, /const camera = useCamera\(\);/);
  assert.doesNotMatch(page, /navigator\.mediaDevices\.getUserMedia/);
});

test('v102 tombol ganti kamera 44px, SVG sendiri, hanya bila lebih dari satu kamera', () => {
  const page = read(PAGE);
  const registry = read('src/components/icons/registry.ts');
  assert.match(page, /aria-label="Ganti kamera"/);
  assert.match(page, /className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full/);
  assert.match(page, /<Icon name="camera_switch" size=\{20\} \/>/);
  assert.match(registry, /camera_switch: \[/);
  assert.match(page, /\{camera\.hasMultipleCameras && \(/);
  assert.match(page, /disabled=\{camera\.switching\}/);
  assert.match(page, /Mengganti kamera\.\.\./);
});

test('v102 video mirip iOS: playsInline muted autoPlay; mirror hanya preview depan', () => {
  const page = read(PAGE);
  assert.match(page, /ref=\{camera\.videoRef\}\n\s+playsInline\n\s+muted\n\s+autoPlay/);
  assert.match(page, /style=\{\{ transform: camera\.facing === "user" \? "scaleX\(-1\)" : undefined \}\}/);
  // Hasil jepretan digambar apa adanya dari elemen video (tanpa transform).
  assert.match(page, /canvas\.getContext\("2d"\)\?\.drawImage\(video, 0, 0, canvas\.width, canvas\.height\);/);
  assert.doesNotMatch(page, /ctx\.scale\(-1/);
});

test('v102 pesan error ramah tanpa istilah teknis + Coba Lagi', () => {
  const page = read(PAGE);
  assert.match(page, /Izin kamera ditolak\. Aktifkan izin kamera di pengaturan browser, lalu coba lagi\./);
  assert.match(page, /Kamera tidak ditemukan atau sedang dipakai aplikasi lain\./);
  assert.match(page, /Kamera hanya bisa dipakai lewat koneksi aman \(HTTPS\)\./);
  assert.match(page, /Coba Lagi/);
  assert.match(page, /role="alert"/);
});

test('v102 kamera dimatikan setelah jepret, alur simpan tidak berubah', () => {
  const page = read(PAGE);
  assert.match(page, /const file = await capture\(stage\);\n\s+if \(!file\) \{ setBusy\(false\); return; \}\n\s+camera\.stop\(\);/);
  assert.match(page, /await saveStage\(stage, file, nik\);/);
  assert.match(page, /storage\.from\("kyc-private"\)\.upload\(path, file, \{ upsert: false \}\)/);
});
