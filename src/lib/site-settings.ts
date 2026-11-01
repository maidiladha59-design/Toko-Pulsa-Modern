import { DEFAULT_INFO_TICKER, INFO_TICKER_KEY, type InfoTickerSettings } from "@/lib/info-ticker";
import { getSetting } from "@/lib/settings";

// Sisi server: pembacaan pengaturan info berjalan memakai fondasi Pengaturan
// Terkelola (src/lib/settings.ts). Konstanta, tipe, dan validasi ada di
// src/lib/info-ticker.ts (aman untuk client) supaya modul ini tidak pernah
// diimpor komponen "use client".
//
// getSetting membaca lewat cache bertag "settings:info_ticker" + "site-settings".
// Gagal baca / nilai kosong selalu jatuh ke DEFAULT_INFO_TICKER.

export * from "@/lib/info-ticker";

/** Selalu mengembalikan nilai yang bisa dirender; gagal baca = default, tanpa error ke user. */
export async function getInfoTicker(): Promise<InfoTickerSettings> {
  return getSetting<InfoTickerSettings>(INFO_TICKER_KEY, DEFAULT_INFO_TICKER);
}
