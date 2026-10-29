import Icon from "@/components/icons/Icon";
import type { IconName as RegistryName } from "@/components/icons/registry";

type IconName = "home" | "grid" | "wallet" | "receipt" | "menu" | "person" | "document" | "question" | "bell" | "megaphone" | "star";

// NavIcon dipertahankan sebagai API lama (dipakai Navbar, HeroQuickMenu, InfoTicker).
// Geometri ikon kini hidup satu kali di src/components/icons/registry.ts.
const ALIAS: Record<IconName, RegistryName> = {
  home: "home",
  grid: "grid",
  wallet: "wallet",
  receipt: "receipt",
  menu: "menu",
  person: "user",
  document: "doc",
  question: "help",
  bell: "bell",
  megaphone: "megaphone",
  star: "star",
};

export default function NavIcon({ name, className = "h-5 w-5" }: { name: IconName | RegistryName; className?: string }) {
  return <Icon name={ALIAS[name as IconName] ?? name} className={className} />;
}
