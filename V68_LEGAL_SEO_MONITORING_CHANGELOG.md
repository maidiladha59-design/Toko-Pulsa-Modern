# V68 — Kelengkapan Legal PPOB, Pengaduan Konsumen, Error Monitoring, SEO

Patch ini menutup 5 celah yang ditemukan pada audit: identitas usaha, jalur
pengaduan konsumen formal, monitoring error, robots.txt/sitemap.xml, dan
metadata Open Graph.

## 1. Identitas usaha / legal PSE
- `src/lib/business.ts` — baca identitas usaha dari environment variable.
- `src/components/BusinessIdentityCard.tsx` — kartu identitas (mode penuh & ringkas).
- `src/app/identitas-usaha/page.tsx` — halaman publik identitas usaha.
- Footer (`src/app/page.tsx`), `/terms`, `/privacy` menampilkan ringkasan identitas + link.

**WAJIB dilakukan sebelum go-live:** isi env berikut dengan data asli badan usaha Anda
(lihat `.env.example`):
```
NEXT_PUBLIC_BUSINESS_LEGAL_NAME=
NEXT_PUBLIC_BUSINESS_ENTITY_TYPE=
NEXT_PUBLIC_BUSINESS_NIB=
NEXT_PUBLIC_BUSINESS_ADDRESS=
NEXT_PUBLIC_BUSINESS_EMAIL=
NEXT_PUBLIC_BUSINESS_PHONE=
NEXT_PUBLIC_PSE_STATUS=      # NOT_SET | PENDING | REGISTERED
NEXT_PUBLIC_PSE_NUMBER=
```
Selama env ini kosong, halaman akan menampilkan peringatan "belum lengkap" secara
otomatis — supaya tidak lupa mengisinya, bukan supaya disembunyikan.

Jika PSE belum terdaftar: daftar dulu di https://pse.kominfo.go.id sebelum
mengubah `NEXT_PUBLIC_PSE_STATUS` menjadi `REGISTERED`.

## 2. Jalur pengaduan konsumen formal
- `supabase/migrations_v68_pengaduan_konsumen.sql` — kategori tiket baru `PENGADUAN`,
  otomatis diberi prioritas `HIGH`. **Jalankan migration ini di Supabase** (SQL editor
  atau CLI) sebelum kategori ini bisa dipakai.
- `src/app/pengaduan-konsumen/page.tsx` — halaman penjelasan hak konsumen, alur
  penanganan, dan eskalasi ke Kemendag/Kominfo/BPSK bila tidak ditangani.
- `src/app/bantuan/page.tsx` — kategori "⚠️ Pengaduan Konsumen (formal)" ditambahkan,
  bisa dibuka langsung via `/bantuan?kategori=PENGADUAN`, badge merah di daftar tiket.

Ini terpisah dari tiket bantuan biasa supaya kasus serius (saldo terpotong,
produk tidak masuk) tidak tenggelam di antrean pertanyaan umum.

## 3. Error monitoring (Sentry)
- `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`,
  `src/instrumentation.ts` — inisialisasi Sentry untuk semua runtime.
- `src/app/error.tsx`, `src/app/global-error.tsx` — error boundary yang otomatis
  lapor ke Sentry dan menampilkan halaman error yang layak ke pengguna.
- `next.config.js` dibungkus `withSentryConfig` (upload source map otomatis saat build
  jika `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` diisi).
- `package.json` — tambah dependency `@sentry/nextjs`.

**Langkah setelah menerima patch ini:**
1. `npm install` (menarik `@sentry/nextjs` yang baru ditambahkan).
2. Buat project di https://sentry.io, ambil DSN-nya.
3. Isi `.env`:
   ```
   SENTRY_DSN=...
   NEXT_PUBLIC_SENTRY_DSN=...
   SENTRY_ORG=...
   SENTRY_PROJECT=...
   SENTRY_AUTH_TOKEN=...
   ```
4. Tanpa DSN diisi, Sentry otomatis idle (`enabled: false`) — aman dipakai di
   development tanpa akun Sentry.
5. `sendDefaultPii` sengaja `false` — data sensitif (cookie, header auth, email
   pengguna) tidak otomatis terkirim ke Sentry.

## 4. SEO teknis
- `src/app/robots.ts` — generate `/robots.txt`, blokir halaman privat
  (admin, dashboard, wallet, checkout, dll), arahkan ke sitemap.
- `src/app/sitemap.ts` — generate `/sitemap.xml` dinamis: halaman statis, 10
  kategori PPOB, dan seluruh produk aktif dari Supabase (maks 2000).
- `NEXT_PUBLIC_SITE_URL` di `.env` harus diisi domain final (bukan placeholder)
  supaya sitemap & robots memakai URL yang benar.

## 5. Metadata Open Graph
- `src/app/layout.tsx` — tambah `metadataBase`, `openGraph`, `twitter` card,
  title template. Preview link di WhatsApp/Telegram sekarang menampilkan
  judul, deskripsi, dan gambar (masih pakai `aidil-logo.png`).

**Saran lanjutan (opsional):** buat gambar khusus `public/og-image.png`
berukuran 1200×630 (bukan logo persegi) agar preview link lebih menarik, lalu
ganti referensi `images: ["/aidil-logo.png"]` di `layout.tsx` ke gambar itu.

## Checklist sebelum deploy
- [ ] Isi semua `NEXT_PUBLIC_BUSINESS_*` dan `NEXT_PUBLIC_PSE_*` dengan data asli
- [ ] Jalankan `supabase/migrations_v68_pengaduan_konsumen.sql` di database
- [ ] `npm install` lalu pastikan `npm run build` sukses
- [ ] Daftar Sentry, isi DSN, verifikasi error test masuk ke dashboard Sentry
- [ ] Isi `NEXT_PUBLIC_SITE_URL` dengan domain final, cek `/robots.txt` dan `/sitemap.xml`
- [ ] (Opsional) buat `og-image.png` 1200×630 untuk preview link yang lebih baik
