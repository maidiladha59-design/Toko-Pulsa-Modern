# AIDIL STORE v70 — Reject KYC per Tahap + Kunci Akses cost_price/margin

Perbaikan untuk dua dari tiga catatan di V69: penolakan KYC per tahap, dan
kunci akses kolom modal (`cost_price`/`margin`) di `ppob_services`. Catatan
ketiga (OCR/verifikasi keaslian KTP) **belum dikerjakan** — lihat bagian
"Yang masih perlu diputuskan" di bawah, saya butuh arahan Anda dulu.

## 1. Admin bisa menolak KYC per tahap (KTP saja / Wajah saja / keduanya)
- `supabase/migrations_v70_kyc_reject_stage_costprice_lockdown.sql`:
  - Kolom baru `kyc_verifications.rejected_stage` (`KTP` | `SELFIE` | NULL).
  - Fungsi `admin_review_kyc()` diperbarui: menerima parameter
    `p_rejected_stage` dan menyimpannya saat menolak, juga mengubah pesan
    notifikasi ke user sesuai tahap yang ditolak.
- `src/app/admin/kyc/page.tsx`: tombol "Tolak" sekarang jadi 3 pilihan —
  **Tolak KTP saja**, **Tolak wajah saja**, **Tolak keduanya** — dan baris
  pengajuan yang sudah ditolak menampilkan tahap mana yang perlu diulang user.
- `src/app/api/admin/kyc/route.ts`: meneruskan `rejected_stage` dari body ke
  RPC, dan menyertakannya di daftar KYC yang diambil admin.
- `src/app/kyc/page.tsx`: kalau admin **cuma menolak Tahap 2 (wajah)**, user
  langsung diarahkan ke Tahap 2 saja saat mengajukan ulang — KTP yang sudah
  tersimpan **tidak perlu difoto ulang**. Kalau yang ditolak Tahap 1 (KTP)
  atau keduanya, user mulai dari Tahap 1 seperti sebelumnya (karena setelah
  KTP diulang, sistem tetap meminta foto wajah baru — sesuai alur normal).
  Pesan di halaman KYC juga disesuaikan agar user tahu tahap mana yang perlu
  diulang.

## 2. Kunci akses `cost_price` & `margin` di `ppob_services`
Kebijakan RLS lama (`ppob_services_public_active`, sejak v9) mengizinkan
**siapa saja** membaca seluruh kolom tabel `ppob_services` — termasuk
`cost_price` (modal) dan `margin` — selama `provider_active=true`, lewat
query langsung ke Supabase (bukan cuma lewat aplikasi). Ini jadi lebih
relevan sejak v69 karena field "Untung" ditampilkan di struk.

Perbaikan (RLS bersifat per-baris, jadi solusinya lewat hak akses kolom
Postgres, bukan mengubah kebijakan baris):
- `supabase/migrations_v70_kyc_reject_stage_costprice_lockdown.sql`: mencabut
  `SELECT` penuh dari `anon`/`authenticated` pada `ppob_services`, lalu
  memberikannya kembali **hanya** untuk kolom yang aman ditampilkan ke publik
  (`id, product_id, provider, provider_sku, service_kind, category, brand,
  target_schema, provider_active, updated_at`). `cost_price` dan `margin`
  sengaja **tidak** diberikan — hanya bisa dibaca lewat service role
  (`createAdminClient()` di server).
- `src/app/orders/[id]/receipt/page.tsx` dan `src/app/orders/[id]/page.tsx`:
  query `cost_price` untuk menghitung "Untung" di struk/detail transaksi
  sekarang memakai `createAdminClient()` (service role), bukan client biasa
  yang tunduk RLS/hak akses kolom user — supaya tetap bisa dihitung di server
  tanpa mengekspos kolom modal ke client.
- `src/app/api/ppob/inquiry/route.ts`: field `margin` yang sebelumnya ikut
  di-select tapi tidak pernah dipakai, dihapus dari query (sudah tidak
  relevan lagi setelah kolom ini dikunci).
- Semua tempat lain yang membaca `ppob_services` (katalog publik di
  `/ppob/[category]`, halaman checkout, cek stok saat checkout) sudah dicek
  satu per satu — tidak ada yang meminta `cost_price`/`margin`, jadi tidak
  terdampak.

## Yang perlu dilakukan setelah extract
1. Jalankan `supabase/migrations_v70_kyc_reject_stage_costprice_lockdown.sql`
   di Supabase SQL editor (setelah v69).
2. Deploy ulang seperti biasa (`npm run build` lalu deploy ke Vercel).
3. **Cek dulu sebelum deploy**: kalau ada bagian lain di project Anda (di
   luar folder ini) yang membaca `ppob_services.cost_price` atau `.margin`
   langsung lewat Supabase client biasa (anon key), query itu akan mulai
   gagal setelah migrasi ini — pindahkan ke service role seperti pola di atas.

## Yang masih perlu diputuskan: verifikasi keaslian KTP (OCR)
Ini **belum saya kerjakan** karena butuh keputusan dari Anda dulu:
"Simpan kalau hasil sudah bagus" masih cuma cek blur, bukan verifikasi
keaslian KTP (baca NIK/nama otomatis, cek KTP asli vs bukan). Validasi
seperti itu butuh integrasi pihak ketiga (mis. layanan OCR/verifikasi KTP
Indonesia) yang biasanya berbayar per-panggilan dan perlu API key terpisah.
Kalau Anda mau saya kerjakan, saya perlu tahu dulu: mau pakai layanan yang
mana (atau saya carikan opsi), dan seberapa ketat validasinya (sekadar baca
NIK/nama vs pencocokan wajah-KTP penuh) — supaya saya tidak asal pasang
integrasi berbayar tanpa persetujuan Anda.
