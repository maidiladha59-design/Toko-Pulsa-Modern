import { getSetting } from "@/lib/settings";
import { DEFAULT_THEME_SETTINGS, THEME_SETTINGS_KEY } from "@/lib/theme-settings";
import BottomNavSettingsEditor from "./BottomNavSettingsEditor";

// Halaman admin Navigasi Bawah. Tema dibaca di server supaya pratinjau 360px
// memakai warna terang/gelap yang benar-benar terbit, bukan warna contoh.
// Otorisasi role admin + 2FA sudah ditegakkan oleh src/app/admin/layout.tsx.

export default async function AdminBottomNavPage() {
  const theme = await getSetting(THEME_SETTINGS_KEY, DEFAULT_THEME_SETTINGS);
  return <BottomNavSettingsEditor theme={theme} />;
}
