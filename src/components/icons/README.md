# Set ikon AIDIL STORE

Semua ikon di web (sisi user dan panel admin) memakai satu set SVG buatan sendiri.
Emoji tidak dipakai lagi sebagai ikon — lihat penjaga `npm run check:emoji`.

## Pemakaian

```tsx
import { Icon, IconTile, StarRating } from "@/components/icons";

<Icon name="wallet" size={20} />                 {/* dekoratif: aria-hidden */}
<Icon name="close" size={18} title="Tutup" />    {/* bermakna: role=img + aria-label */}
<IconTile name="pulsa" />                        {/* kotak 56px radius 16 + gradasi brand */}
<IconTile name="pln" size={44} iconSize={24} tone="mint" />
<StarRating value={4} />                         {/* deret bintang rating */}
```

`name` juga menerima emoji lama (mis. `"\u{1F4E6}"`) dan nilai tak dikenal: keduanya
dipetakan lewat `mapEmojiToIcon` dan jatuh ke ikon `default`, jadi komponen tidak
pernah crash. Untuk teks bebas (judul/pesan notifikasi) gunakan `stripEmoji`.

## Memilih ikon (panel admin)

Form admin memakai `<IconPicker>` — grid seluruh registry dengan pencarian dan
pratinjau. Admin tidak lagi mengetik emoji, hanya memilih nama ikon yang tersedia:

```tsx
<IconPicker label="Ikon" value={form.icon} onChange={(name) => set("icon", name)} />
<IconPicker allowNone label="Ikon" value={form.icon} onChange={...} />  // opsi "Tanpa ikon"
```

Nilai yang dikirim ke server adalah nama ikon; API memvalidasi dengan daftar
`ICON_NAMES` (Zod `z.enum`), jadi nilai di luar daftar ditolak.

## Menambah ikon baru

1. Tambahkan satu entri pada `ICON_NAMES`/`registry.ts` (satu nama = satu makna,
   huruf kecil dengan garis bawah, mis. `money_send`).
2. Aturan gaya wajib, kalau tidak ikon akan terlihat berbeda dari yang lain:
   - `viewBox="0 0 24 24"`, isi gambar berada di area aman **3.5 - 20.5**;
   - garis luar saja (`fill: none`, `stroke: currentColor`) — warna mengikuti teks;
   - `stroke-width` 1.8 (naik ke 2 otomatis pada ukuran >= 40px);
   - ujung dan sudut membulat (`strokeLinecap`/`strokeLinejoin: round`);
   - maksimum satu elemen ber-isian (`f(...)`) untuk titik seperti pusat target.
3. Bentuk tersedia: `d("M...")` garis/path, `c(cx, cy, r)` lingkaran,
   `r(x, y, w, h, radius)` persegi, `f("M...")` path ber-isian, `fc(cx, cy, r)` titik.
4. Kalau ikon dipakai dari data lama, tambahkan emoji asalnya ke `emoji-map.ts`.
5. Cek visual: `npm run check:emoji` lalu `npm run build`.

## Daftar nama ikon

sistem: home, grid, menu, user, users, logout, bell, megaphone, ticker, star, star_fill,
heart, heart_fill, sun, moon, monitor, check, check_circle, close, close_circle, plus,
minus, search, filter, arrow_right, arrow_left, arrow_up, arrow_down, chevron_right,
chevron_left, chevron_down, chevron_up, refresh, swap, transfer, settings, tools, sliders,
puzzle, rocket, ban

uang & transaksi: wallet, ewallet, card, banknote, coin, money_send, receipt, doc,
clipboard, paperclip, inbox, send, share, download, upload, undo, printer, qris, scan,
chart_bar, chart_line, activity, target, signal, signal_off, wifi, plug, terminal

belanja & layanan: bag, box, tag, gift, ticket, voucher, streaming, game, tv, hotel,
hospital, water, car, building, bank, office, id_card, lock, shield, key, eye, scales,
calculator, book, chat, help, warning, info, edit, link, copy, trash, hourglass, timer,
alarm, sparkle, party, trophy, medal, crown, flame, gas, phone, pulsa, sim_card, data,
sosmed, bolt, pln, camera, camera_switch, image, dot, default

`default` selalu ada sebagai fallback. Registry berisi 124 nama (termasuk `default`).
Data lama (kolom emoji di database) dipetakan lewat `emoji-map.ts` (125 token) dan
migrasi `supabase/migrations_v99_icon_registry.sql`; kedua daftar itu harus tetap sinkron.
Logo operator/brand (Telkomsel, DANA, dll.) tidak termasuk sini — mereka memakai file
logo asli dari tabel `brand_media` / `category_media`.
