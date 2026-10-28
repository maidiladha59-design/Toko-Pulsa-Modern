# Design System AIDIL STORE

Gaya: profesional-minimalis-classic-modern. Identitas warna baru: **latar gelap (zinc-950/hitam) + biru listrik + hijau muda**. Latar gelap tetap menjadi identitas brand; mode terang hanya varian tema, bukan identitas utama.

Dua aksen dipakai **berdampingan, bukan dicampur**:

- **Biru** — aksi utama, CTA primer, fokus input, kicker, status proses.
- **Hijau muda (mint)** — aksen sekunder, highlight, status aktif.

Token internal masih bernama `gold-*` (nama legacy) agar ribuan class lama tidak perlu di-rename; nilainya sekarang **biru**. Jangan menambah pemakaian `gold-*` baru bila bisa memakai makna "biru/brand".

> Logo `/aidil-logo.png` saat ini masih logo lama. File logo baru (biru–hijau) akan diunggah terpisah. **Jangan menggambar ulang logo dengan CSS/SVG** — token dan komponen di folder ini sudah siap menerima file baru.

## 1. Token warna (`tailwind.config.ts`)

| Token | Nilai kunci | Pakai untuk |
| --- | --- | --- |
| `gold-50 … gold-950` (legacy, kini **biru**) | `gold-400` = `#2E9EF5` (DEFAULT), `gold-300` = `#7CC9FC` (shine), `gold-600` = `#1565E0`, `gold-700` = `#1151B8`, `gold-950` = `#071F45` | aksi utama, CTA primer, fokus input, kicker, badge proses |
| `mint-50 … mint-950` (**hijau muda**) | `mint-400` = `#8CD93A` (DEFAULT), `mint-300` = `#B8EE70` (hover/terang), `mint-600` = `#5BBE1F`, `mint-800` = `#367712`, `mint-950` = `#17330A` | aksen sekunder, highlight, status aktif, CTA sekunder |
| `brand` | `DEFAULT` = `#2E9EF5`, `dark` = `#1565E0`, `mint` = `#8CD93A` | akses cepat tiga warna identitas |
| `bg-brand-gradient` | utility Tailwind: `linear-gradient(135deg, #2E9EF5 0%, #1565E0 45%, #5BBE1F 100%)` | branding penting: logo container, header utama, CTA terpenting |
| `zinc-*` | `zinc-950` = `#09090b` | latar gelap identitas, netral, teks sekunder |
| `app-bg / app-surface / app-inset / app-border / app-text / app-muted / app-subtle / app-accent / app-accent-soft / app-kicker` | CSS var di `globals.css` | **latar, teks, border** semua permukaan (dual-mode terang/gelap). WAJIB dipakai agar tema tidak rusak. `app-accent` = biru `#2E9EF5`. |
| `success-*` (emerald) | alias 1:1 `colors.emerald` | status **Berhasil** — BUKAN mint |
| `danger-*` (red) | alias 1:1 `colors.red` | status **Gagal/Ditolak**, tombol destructive |
| `warning-*` (amber) | alias 1:1 `colors.amber` | status **Pending/Menunggu/Peringatan** |

Aturan badge status: `success-*` (emerald) / `danger-*` / `warning-*` / `neutral` (zinc) / `gold-*` (biru, proses) / `mint-*` (aksen aktif). Varian dark memakai pola `dark:bg-*-500/15 dark:text-*-300`.

**Jangan tertukar:** hijau brand (`mint`) ≠ hijau status "Berhasil" (`emerald`). Mint hanya untuk aksen/highlight; status transaksi selalu memakai token semantik.

## 2. Gradasi identitas

Satu gradasi diagonal biru → hijau muda, terinspirasi logo baru:

```tsx
<div className="bg-brand-gradient">…logo container / header / CTA utama…</div>
```

Nilai: `linear-gradient(135deg, #2E9EF5 0%, #1565E0 45%, #5BBE1F 100%)`. Jangan memakai gradasi ini untuk badge status atau teks panjang; khusus elemen branding.

## 3. Tipografi

| Peran | Kelas |
| --- | --- |
| Kicker/label kecil | `text-xs font-black uppercase tracking-widest text-app-kicker` |
| Judul halaman | `text-2xl font-black text-app-text` (`sm:text-3xl`) |
| Judul kartu | `text-base font-black` (kartu featured boleh `text-lg`) |
| Body | `text-sm font-normal text-app-text` |
| Teks sekunder | `text-sm text-app-muted` |
| Caption/hint | `text-xs text-app-subtle` |
| Nominal penting | `text-2xl font-black tabular-nums` |

Ukuran dibatasi `xs, sm, base, lg, xl, 2xl, 3xl`. Bobot: `font-black` judul, `font-bold` label, `font-medium` caption/badge, `font-normal` body.

## 4. Spacing & radius

- Padding kartu: **`p-5`**; kartu besar/pembayaran `p-6 sm:p-8`.
- Jarak antar section: **`mt-5` / `space-y-5`**; antar blok dalam kartu `mt-3 / space-y-3`; gap elemen sejajar `gap-2`/`gap-3`.
- Radius: kartu utama **`rounded-3xl`**, elemen dalam kartu `rounded-2xl`, input/tombol `rounded-xl`, badge `rounded-full`. CTA utama `.btn-gold` memakai radius **12px**, tanpa border, hanya satu shadow tipis, tanpa translateY. (Auth `rounded-[2rem]` = pengecualian yang dinormalisasi saat migrasi.)

Acuan ini juga tertera sebagai komentar di bagian atas `src/app/globals.css`.

## 5. Komponen dasar (`src/components/ui/`)

### Button
```tsx
import Button from "@/components/ui/Button";
<Button variant="primary" size="md" loading={saving} onClick={save}>Simpan</Button>
<Button variant="secondary">Aksi sekunder</Button>
```
Varian: `primary` (biru glossy `.btn-gold`, teks putih) · `secondary` (**mint** `bg-mint-400`, teks gelap) · `outline` · `ghost` · `destructive` (merah). Ukuran `sm | md | lg`. Prop `loading` menampilkan spinner (mengikuti `currentColor`) + men-disable otomatis. Kontrol sekunder/kompak yang masih memakai `.btn-gold-metal` kini tampil mint.

### Card
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardBody, CardFooter } from "@/components/ui/Card";
<Card><CardHeader><CardTitle>Judul</CardTitle><CardDescription>Ket.</CardDescription></CardHeader><CardBody>…</CardBody><CardFooter>…</CardFooter></Card>
```
Semua bagian opsional; `Card` sudah membawa `rounded-3xl border-app-border bg-app-surface p-5`.

### Badge + statusTone
```tsx
import Badge, { statusTone } from "@/components/ui/Badge";
<Badge tone={statusTone(order.status)}>Berhasil</Badge>
```
`statusTone()` memetakan status internal (SUCCESS/FAILED/PENDING/PROCESSING/EXPIRED/dll) ke tone semantik — pakai ini agar warna status seragam. Tone `mint` tersedia untuk aksen/highlight aktif; tone `gold` (nama legacy) kini biru untuk status Diproses/brand.

### Input / Select
```tsx
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
<Input label="Email" error={errors.email} hint="Pakai email aktif" … />
<Select label="Metode" error={errors.method}>…</Select>
```
Label + field + pesan error di bawah field (border/ring merah, `role="alert"`) + hint abu; focus biru terlihat jelas (`focus:border-gold-400 focus:ring-gold-400/20` — token legacy yang kini biru).

### EmptyState / LoadingSkeleton / ErrorState
```tsx
import EmptyState from "@/components/ui/EmptyState";
import LoadingSkeleton, { Skeleton } from "@/components/ui/LoadingSkeleton";
import ErrorState from "@/components/ui/ErrorState";
{loading ? <LoadingSkeleton rows={4} /> : error ? <ErrorState onRetry={load} /> : data.length === 0 ? <EmptyState title="Belum ada pesanan" /> : …}
```
- `EmptyState`: ikon + judul + deskripsi + slot aksi (tombol CTA) di atas `app-accent-soft` biru.
- `LoadingSkeleton`: pola baris sama dengan NetworkState; `Skeleton` = kotak denyut tunggal.
- `ErrorState`: judul + deskripsi + `onRetry` (CTA biru).

## 6. Komponen lama & rencana migrasi

Komponen lama **tetap berfungsi** sampai halaman dimigrasikan (task berikutnya), lalu dihapus per pemakaian:

| Lama | Pengganti |
| --- | --- |
| `src/components/Button.tsx` (primary/secondary/danger) | `ui/Button` (5 varian + ukuran) |
| `src/components/EmptyState.tsx` | `ui/EmptyState` |
| `src/components/NetworkState.tsx` (`NetworkSkeleton/NetworkError/NetworkEmpty`) | `ui/LoadingSkeleton` + `ui/ErrorState` + `ui/EmptyState` — NetworkState dipatenkan test v78, jangan diubah dulu |
| `src/components/StatusBadge.tsx` | `ui/Badge` + `statusTone()` |

Aturan migrasi (task penerapan): satu halaman = satu task kecil; jangan mengubah logic bisnis; jalankan `npm run test:production` dan bandingkan dengan baseline (**300 tests / 279 pass / 21 fail**, semua kegagalan pre-existing) karena banyak literal UI dipatenkan test produksi.
