# AIDIL STORE v27 — Production Environment Validator

Sebelum deployment production, siapkan `.env.local` dari `.env.example` lalu isi credential asli melalui secret manager/Vercel Environment Variables. Jangan commit `.env.local`.

## Pemeriksaan otomatis

```bash
npm run validate:production
```

Validator memeriksa:
- variabel environment wajib dan placeholder;
- URL production HTTPS;
- panjang secret minimum secara heuristik;
- mode sandbox/testing Pakasir dan Digiflazz;
- keberadaan dan jadwal PPOB Vercel Cron;
- migration PPOB wajib yang termasuk hardening/atomic claim.

`WARN` tidak menggagalkan validasi. Untuk transaksi nyata, ubah mode sandbox/testing sesuai dokumentasi provider dan lakukan uji terkontrol terlebih dahulu.

## Vercel

Set environment variables untuk environment Production di Vercel. Nilai `CRON_SECRET` harus sama dengan secret yang digunakan oleh worker. Jangan menaruh API key provider di variabel `NEXT_PUBLIC_*`.

## Supabase

Jalankan migration PPOB sesuai urutan proyek dan verifikasi fungsi/RLS di database target sebelum membuka transaksi kepada pengguna.
