# Design System AIDIL STORE

Gaya: profesional-minimalis-classic-modern. Identitas warna tetap **hitam + emas tua** (gold DEFAULT `#C9A227`). CTA utama memakai emas 3D `.btn-gold-3d` (gradient 180deg + sisi tebal 6px); aksen emas sekunder/kompak memakai `.btn-gold-metal` datar. Fondasi ini belum diterapkan ke halaman — task berikutnya memigrasikan halaman satu per satu memakai komponen di folder ini.

## 1. Token warna (tailwind.config.ts)

| Token | Pakai untuk | Catatan |
| --- | --- | --- |
| `gold-50 … gold-950` | identitas emas: aksen, tombol primary, kicker | `gold-400` = `#C9A227` (DEFAULT), `gold-300` = `#D9B73B` (hover), `gold-200` = `#F0D878` (shine), `gold-600/700` untuk teks emas di latar terang. Sudah lengkap 50–950. |
| `zinc-*` | hitam pekat (`zinc-950` = `#09090b`), teks sekunder, netral | palet bawaan Tailwind, lengkap. |
| `app-bg / app-surface / app-inset / app-border / app-text / app-muted / app-subtle / app-accent / app-accent-soft / app-kicker` | **latar, teks, border** semua permukaan | dual-mode terang/gelap dari CSS var di `globals.css`. WAJIB dipakai agar tema tidak rusak. |
| `success-*` (emerald) | status **Berhasil** | alias 1:1 palet bawaan — nilainya identik, hanya nama yang distandarkan. |
| `danger-*` (red) | status **Gagal/Ditolak**, tombol destructive | alias `red`. |
| `warning-*` (amber) | status **Pending/Menunggu/Peringatan** | alias `amber`. |

Aturan badge status: **success-*/danger-*/warning-*/neutral(zinc)*/gold-\*** — jangan memakai warna acak per halaman. Varian dark memakai pola `dark:bg-*-500/15 dark:text-*-300`.

## 2. Tipografi

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

## 3. Spacing & radius

- Padding kartu: **`p-5`**; kartu besar/pembayaran `p-6 sm:p-8`.
- Jarak antar section: **`mt-5` / `space-y-5`**; antar blok dalam kartu `mt-3 / space-y-3`; gap elemen sejajar `gap-2`/`gap-3`.
- Radius: kartu utama **`rounded-3xl`**, elemen dalam kartu `rounded-2xl`, input/tombol `rounded-xl`, badge `rounded-full`. CTA utama `.btn-gold-3d` memakai radius **14px** + sisi tebal 6px (state tekan turun 4px). (Auth `rounded-[2rem]` = pengecualian yang akan dinormalisasi saat migrasi.)

Acuan ini juga tertera sebagai komentar di bagian atas `src/app/globals.css`.

## 4. Komponen dasar (`src/components/ui/`)

### Button
```tsx
import Button from "@/components/ui/Button";
<Button variant="primary" size="md" loading={saving} onClick={save}>Simpan</Button>
```
Varian: `primary` (emas 3D `.btn-gold-3d`, teks `#1A1200`, sisi tebal 6px + state tekan) · `secondary` (hitam solid) · `outline` · `ghost` · `destructive` (merah). Ukuran `sm | md | lg`. Prop `loading` menampilkan spinner + men-disable otomatis. Untuk aksen emas kompak yang bukan CTA utama (tab, tombol “Pilih”, keypad) tetap pakai `.btn-gold-metal` datar agar hierarki visual terjaga.

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
`statusTone()` memetakan status internal (SUCCESS/FAILED/PENDING/PROCESSING/EXPIRED/dll) ke tone semantik — pakai ini agar warna status seragam di seluruh situs.

### Input / Select
```tsx
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
<Input label="Email" error={errors.email} hint="Pakai email aktif" … />
<Select label="Metode" error={errors.method}>…</Select>
```
Label + field + pesan error di bawah field (border/ring merah, `role="alert"`) + hint abu; focus emas terlihat jelas (`focus:border-gold-400 focus:ring-gold-400/20`).

### EmptyState / LoadingSkeleton / ErrorState
```tsx
import EmptyState from "@/components/ui/EmptyState";
import LoadingSkeleton, { Skeleton } from "@/components/ui/LoadingSkeleton";
import ErrorState from "@/components/ui/ErrorState";
{loading ? <LoadingSkeleton rows={4} /> : error ? <ErrorState onRetry={load} /> : data.length === 0 ? <EmptyState title="Belum ada pesanan" /> : …}
```
- `EmptyState`: ikon + judul + deskripsi + slot aksi (tombol CTA).
- `LoadingSkeleton`: pola baris sama dengan NetworkState; `Skeleton` = kotak denyut tunggal.
- `ErrorState`: judul + deskripsi + `onRetry` (pola `NetworkError`).

## 5. Komponen lama & rencana migrasi

Komponen lama **tetap berfungsi** sampai halaman dimigrasikan (task berikutnya), lalu dihapus per pemakaian:

| Lama | Pengganti |
| --- | --- |
| `src/components/Button.tsx` (primary/secondary/danger) | `ui/Button` (5 varian + ukuran) |
| `src/components/EmptyState.tsx` | `ui/EmptyState` |
| `src/components/NetworkState.tsx` (`NetworkSkeleton/NetworkError/NetworkEmpty`) | `ui/LoadingSkeleton` + `ui/ErrorState` + `ui/EmptyState` — NetworkState dipatenkan test v78, jangan diubah dulu; migrasi halaman mengganti pemakaiannya per halaman |
| `src/components/StatusBadge.tsx` | `ui/Badge` + `statusTone()` |

Aturan migrasi (task penerapan): satu halaman = satu task kecil; jangan mengubah logic bisnis; jalankan `npm run test:production` dan bandingkan dengan baseline (**249 tests / 227 pass / 22 fail**) karena banyak literal UI dipatenkan test produksi.
