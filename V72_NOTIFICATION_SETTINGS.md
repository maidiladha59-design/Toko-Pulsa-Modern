# AIDIL STORE v72 — Pengaturan Notifikasi di Halaman Settings

Menjawab 2 hal dari pertanyaan Anda soal notifikasi push:
1. Tombol aktif/nonaktifkan push dipindah dari muncul-di-semua-halaman ke
   halaman Settings.
2. User sekarang bisa memilih sendiri kategori notifikasi apa yang mau
   diterima (sebelumnya backend-nya sudah ada tapi belum ada tombolnya).

Tidak ada migrasi SQL baru — tabel `notification_preferences` sudah ada
sejak v62 dan RLS-nya sudah mengizinkan user baca/tulis baris miliknya
sendiri, jadi halaman Settings langsung query tabel itu tanpa API baru.

## Yang berubah
- **`src/app/layout.tsx`**: `<PushNotificationRegistrar />` dihapus dari
  layout global (sebelumnya muncul sebagai kotak di atas Navbar di *setiap*
  halaman untuk semua user yang login — bukan penempatan yang disengaja).
- **`src/app/settings/page.tsx`**: kartu baru "Notifikasi" berisi:
  - Komponen `PushNotificationRegistrar` (tombol aktif/nonaktifkan push di
    perangkat ini — fungsinya sama seperti sebelumnya, cuma pindah tempat).
  - 6 checkbox kategori: **Transaksi, Top Up Saldo, KYC, Keamanan, Promosi,
    Pengumuman** — disimpan ke tabel `notification_preferences` lewat tombol
    "Simpan Pengaturan" yang sudah ada (sekarang menyimpan 2 tabel sekaligus:
    `user_app_settings` dan `notification_preferences`).
- **`src/components/PushNotificationRegistrar.tsx`**: gaya kotaknya
  disederhanakan (dashed, lebih kecil) supaya pas ditaruh di dalam kartu
  Settings, bukan lagi kotak besar berdiri sendiri.

## Cara kerjanya (supaya jelas apa yang dikontrol apa)
- **Kategori (checkbox)** = server-side. Dicek oleh `notifyUser()` di
  `src/lib/notification-engine.ts` sebelum mengirim — kalau kategori
  dimatikan, notifikasi **tidak dikirim sama sekali** (baik ke dalam-app
  maupun push).
- **Tombol "Aktif/nonaktifkan push di perangkat ini"** = client-side, per
  perangkat/browser. Ini soal izin browser + subscription push, terpisah
  dari kategori. Kalau push di perangkat dimatikan tapi kategori tetap
  menyala, user tetap dapat notifikasi di dalam app (lonceng notifikasi),
  hanya tidak dapat notifikasi push ke perangkat itu.
- **Toggle per jenis notifikasi di Admin** (`/admin/notifications`, dari
  sebelumnya) tetap jadi kontrol paling atas — kalau admin matikan
  `push_enabled` untuk satu event, tidak akan terkirim ke siapa pun terlepas
  dari pengaturan user.

## Catatan
- Komponen `src/components/PushNotificationPrompt.tsx` yang lama (tidak
  dipakai di mana pun, mirip fungsinya dengan `PushNotificationRegistrar`
  tapi ke endpoint berbeda) saya biarkan apa adanya — bukan bagian dari
  perubahan ini, tapi kalau mau saya bersihkan nanti tinggal bilang.
- Tidak ada perubahan skema database, jadi tidak perlu jalankan migrasi apa
  pun untuk v72 ini — langsung `npm run build` dan deploy.
