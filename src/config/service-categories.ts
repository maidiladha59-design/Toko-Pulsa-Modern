// Sumber awal layanan beranda.
//
// Sebelum v106 daftar ini hidup di dalam HomeServiceMenu. Sekarang halaman
// admin "Pengaturan Beranda" menyimpan salinan yang bisa diubah ke
// site_settings.home_settings, dan konstanta di bawah menjadi default +
// fallback bila database gagal dibaca. Jangan menghapus slug: URL
// /ppob/<slug> harus tetap sama agar rute layanan tidak berubah.

export const SERVICE_TAB_KEYS = ["isi-ulang", "tagihan", "hiburan", "produk-digital"] as const;

export type ServiceTabKey = (typeof SERVICE_TAB_KEYS)[number];

export const SERVICE_TABS: ReadonlyArray<{ key: ServiceTabKey; label: string }> = [
  { key: "isi-ulang", label: "Isi Ulang" },
  { key: "tagihan", label: "Bayar Tagihan" },
  { key: "hiburan", label: "Hiburan" },
  { key: "produk-digital", label: "Produk Digital" },
];

export type HomeServiceItem = {
  id: string;
  label: string;
  slug: string;
  icon: string;
  tab: ServiceTabKey;
  visible: boolean;
};

export const DEFAULT_HOME_SERVICES: HomeServiceItem[] = [
  { id: "pulsa", label: "Pulsa", slug: "pulsa", icon: "pulsa", tab: "isi-ulang", visible: true },
  { id: "paket-data", label: "Data", slug: "paket-data", icon: "data", tab: "isi-ulang", visible: true },
  { id: "e-wallet", label: "E-Wallet", slug: "e-wallet", icon: "card", tab: "isi-ulang", visible: true },
  { id: "pln", label: "PLN", slug: "pln", icon: "bolt", tab: "tagihan", visible: true },
  { id: "tv", label: "TV", slug: "tv", icon: "tv", tab: "tagihan", visible: true },
  { id: "gas", label: "Gas", slug: "gas", icon: "gas", tab: "tagihan", visible: true },
  { id: "top-up-game", label: "Game", slug: "top-up-game", icon: "game", tab: "hiburan", visible: true },
  { id: "voucher", label: "Voucher", slug: "voucher", icon: "voucher", tab: "hiburan", visible: true },
  { id: "streaming", label: "Streaming", slug: "streaming", icon: "streaming", tab: "hiburan", visible: true },
  { id: "media-sosial", label: "Sosmed", slug: "media-sosial", icon: "megaphone", tab: "produk-digital", visible: true },
];

export function serviceTabLabel(key: ServiceTabKey): string {
  return SERVICE_TABS.find((tab) => tab.key === key)?.label ?? key;
}
