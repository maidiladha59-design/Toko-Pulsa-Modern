/**
 * v78 — Indikator loading & status gangguan jaringan (NetworkState).
 *
 * Memastikan:
 * 1. src/components/NetworkState.tsx ada, "use client", ekspor tiga tampilan
 *    (NetworkSkeleton / NetworkError / NetworkEmpty), gaya hitam-emas.
 * 2. Deteksi offline di Navbar (event "online"/"offline" + banner + cleanup).
 * 3. loading.tsx & error.tsx terpasang di /transactions, /wallet, /orders,
 *    /ppob/[category] — tanpa mengubah logic query di halaman server.
 * 4. PPOBServiceGrid memakai NetworkEmpty untuk hasil pencarian kosong,
 *    sementara logic grid (checkout link, brandIcon, groupByBrand) tetap utuh.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("v78: NetworkState.tsx ada, client component, ekspor tiga tampilan", () => {
  const src = read("src/components/NetworkState.tsx");
  assert.match(src, /"use client"/);
  assert.match(src, /export function NetworkSkeleton/);
  assert.match(src, /export function NetworkError/);
  assert.match(src, /export function NetworkEmpty/);
});

test("v78: NetworkSkeleton memakai skeleton abu-abu berdenyut", () => {
  const src = read("src/components/NetworkState.tsx");
  assert.match(src, /animate-pulse/);
  assert.match(src, /bg-zinc-800/);
  assert.match(src, /aria-busy="true"/);
});

test("v78: NetworkError menampilkan status koneksi bermasalah + tombol Coba Lagi", () => {
  const src = read("src/components/NetworkState.tsx");
  assert.match(src, /Koneksi bermasalah/);
  assert.match(src, /Data gagal dimuat/);
  assert.match(src, /Coba Lagi/);
  assert.match(src, /role="alert"/);
  assert.match(src, /onRetry/);
});

test("v78: NetworkEmpty menampilkan status kosong dengan gaya hitam-emas", () => {
  const src = read("src/components/NetworkState.tsx");
  assert.match(src, /Belum ada data/);
  assert.match(src, /border-zinc-700|border-zinc-800/);
  assert.match(src, /bg-gold-400/);
  assert.match(src, /text-zinc-950/);
});

test("v78: Navbar mendeteksi offline via event online/offline dengan cleanup", () => {
  const src = read("src/components/Navbar.tsx");
  assert.match(src, /addEventListener\("online"/);
  assert.match(src, /addEventListener\("offline"/);
  assert.match(src, /removeEventListener\("online"/);
  assert.match(src, /removeEventListener\("offline"/);
  assert.match(src, /Koneksi internet terputus/);
  assert.match(src, /setOffline\(!navigator\.onLine\)/);
});

test("v78: loading.tsx terpasang di transactions, wallet, orders, ppob/[category]", () => {
  for (const route of [
    "src/app/transactions/loading.tsx",
    "src/app/wallet/loading.tsx",
    "src/app/orders/loading.tsx",
    "src/app/ppob/[category]/loading.tsx",
  ]) {
    const src = read(route);
    assert.match(src, /NetworkSkeleton/, `${route} harus memakai NetworkSkeleton`);
  }
});

test("v78: error.tsx terpasang dengan tombol Coba Lagi (reset) + Sentry di empat route", () => {
  for (const route of [
    "src/app/transactions/error.tsx",
    "src/app/wallet/error.tsx",
    "src/app/orders/error.tsx",
    "src/app/ppob/[category]/error.tsx",
  ]) {
    const src = read(route);
    assert.match(src, /"use client"/, `${route} harus client component`);
    assert.match(src, /NetworkError/, `${route} harus memakai NetworkError`);
    assert.match(src, /onRetry=\{reset\}/, `${route} harus mengirim reset sebagai onRetry`);
    assert.match(src, /Sentry\.captureException/, `${route} harus melaporkan error ke Sentry`);
  }
});

test("v78: logic query server /transactions tidak berubah", () => {
  const src = read("src/app/transactions/page.tsx");
  assert.match(src, /\.from\("orders"\)/);
  assert.match(src, /Promise\.all/);
  assert.match(src, /supabase\.auth\.getUser\(\)/, "auth guard tetap ada");
});

test("v78: logic query server /wallet tidak berubah", () => {
  const src = read("src/app/wallet/page.tsx");
  assert.match(src, /\.from\("wallet_transactions"\)/);
  assert.match(src, /createClient/);
});

test("v78: logic query server /orders dan ppob_services tidak berubah", () => {
  const orders = read("src/app/orders/page.tsx");
  assert.match(orders, /\.from\("orders"\)/);

  const ppob = read("src/app/ppob/[category]/page.tsx");
  assert.match(ppob, /\.from\("ppob_services"\)/);
  assert.match(ppob, /\.eq\("provider_active", true\)/);
});

test("v78: PPOBServiceGrid memakai NetworkEmpty tanpa mengubah logic grid", () => {
  const src = read("src/components/PPOBServiceGrid.tsx");
  assert.match(src, /import \{ NetworkEmpty \} from "@\/components\/NetworkState";/);
  assert.match(src, /<NetworkEmpty title="Tidak ada produk yang cocok"/);

  // Logic yang sudah jalan tetap utuh (kontrak v77).
  assert.match(src, /import \{ createClient \} from "@\/lib\/supabase\/client";/);
  assert.match(src, /\.from\("brand_media"\)/);
  assert.match(src, /select\("brand_key,logo_url"\)/);
  assert.match(src, /brandIcon\(brand\)/);
  assert.match(src, /function brandIcon\(brand: string\)/);
  assert.match(src, /groupByBrand\(filtered\)/);
  assert.match(src, /\/checkout\?product=\$\{encodeURIComponent\(p\.id\)\}&qty=1/);
  assert.match(src, /logoMap\[brand\.trim\(\)\.toLowerCase\(\)\]/);
});

test("v78: empty state brand kosong di PPOBServiceGrid tetap dipertahankan", () => {
  const src = read("src/components/PPOBServiceGrid.tsx");
  assert.match(src, /!services\.length/);
  assert.match(src, /Layanan belum tersedia/);
});
