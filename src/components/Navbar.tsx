"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "./ToastProvider";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";
import BottomNav from "./BottomNav";
import Icon from "@/components/icons/Icon";
import NavDrawer, { type NavDrawerGroup, type NavDrawerItem } from "@/components/NavDrawer";
import AvatarRing from "@/components/profile/AvatarRing";
import VerifiedBadge from "@/components/icons/VerifiedBadge";
import LevelChip from "@/components/profile/LevelChip";
import { HEADER_ICON_BUTTON } from "@/components/ui/header-button";
import UserAvatar from "./UserAvatar";
import { resolveAvatarUrl } from "@/lib/avatar";
import { visibleBottomNavItems, type BottomNavSettings } from "@/lib/bottom-nav";
import { Skeleton } from "./ui/LoadingSkeleton";
import { kycUiStatus, type KycUiStatus } from "@/lib/labels";
import { formatRupiah } from "@/lib/utils";
import {
  USER_ADMIN_MENU_ITEM,
  USER_MENU_GROUPS,
  filterUserMenuGroups,
  userActiveHref,
  type UserBadgeKey,
} from "@/config/user-menu";

type Profile = { full_name: string | null; email: string; role: string; avatar_id: string | null };

type DrawerProfile = {
  kycStatus: KycUiStatus | null;
  balance: number | null;
  transactions: number | null;
};

type DrawerBadges = Record<UserBadgeKey, number>;

// Kunci sama dengan halaman Profil agar tombol mata konsisten di kedua tempat.
const BALANCE_HIDDEN_KEY = "aidilstore_balance_hidden";
const EMPTY_BADGES: DrawerBadges = { notifications: 0, orders: 0, support: 0 };
const EMPTY_DRAWER_PROFILE: DrawerProfile = { kycStatus: null, balance: null, transactions: null };

// [href, nama ikon registry, label] — label tidak boleh mengandung emoji.
const ACCOUNT_LINKS: [string, string, string][] = [
  ["/profile", "user", "Profil Saya"],
  ["/wallet", "wallet", "Saldo & Top Up"],
  ["/transfer-uang", "money_send", "Transfer Saldo"],
  ["/split-bill", "receipt", "Split Bill"],
  ["/diskusi", "chat", "Ruang Diskusi"],
  ["/orders", "box", "Pesanan Saya"],
  ["/transactions", "doc", "Transaksi"],
  ["/calculator", "calculator", "Kalkulator"],
  ["/bantuan", "help", "Bantuan"],
];

function EyeToggle({ hidden }: { hidden: boolean }) {
  if (!hidden) return <Icon name="eye" size={16} />;
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.9 10.9 0 0 1 12 5c5 0 9 4.5 9 7 0 .9-.9 2.4-2.4 3.7M6.1 6.3C4.2 7.8 3 9.6 3 12c0 2 4 7 9 7 1.6 0 3-.4 4.2-1" />
    </svg>
  );
}

export default function Navbar({
  scanQrisEnabled = true,
  brandName = "AIDIL STORE",
  logoLight = "",
  logoDark = "",
  navSettings,
  isAdmin = false,
}: {
  scanQrisEnabled?: boolean;
  brandName?: string;
  logoLight?: string;
  logoDark?: string;
  navSettings: BottomNavSettings;
  /** Diperiksa di server dari public.profiles.role agar menu Panel Admin tidak hanya bergantung UI. */
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/register" || pathname === "/admin-login" || pathname.startsWith("/admin")) return null;
  return <NavbarContent scanQrisEnabled={scanQrisEnabled} brandName={brandName} logoLight={logoLight} logoDark={logoDark} navSettings={navSettings} isAdmin={isAdmin} />;
}

function NavbarContent({
  scanQrisEnabled,
  brandName,
  logoLight,
  logoDark,
  navSettings,
  isAdmin: serverIsAdmin,
}: {
  scanQrisEnabled: boolean;
  brandName: string;
  logoLight: string;
  logoDark: string;
  navSettings: BottomNavSettings;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const supabase = createClient(), router = useRouter(), toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null), [avatarUrl, setAvatarUrl] = useState<string | null>(null), [loading, setLoading] = useState(true), [menuOpen, setMenuOpen] = useState(false), [accountOpen, setAccountOpen] = useState(false), [offline, setOffline] = useState(false);
  const [drawerProfile, setDrawerProfile] = useState<DrawerProfile>(EMPTY_DRAWER_PROFILE);
  const [drawerBadges, setDrawerBadges] = useState<DrawerBadges>(EMPTY_BADGES);
  const [balanceHidden, setBalanceHidden] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (mounted) { setProfile(null); setAvatarUrl(null); setLoading(false); }
        return;
      }
      const { data } = await supabase.from("profiles").select("full_name,email,role,avatar_id").eq("id", user.id).single();
      const url = await resolveAvatarUrl(supabase, (data as Profile | null)?.avatar_id);
      if (mounted) { setProfile(data as Profile); setAvatarUrl(url); setLoading(false); }
    }
    load();
    const { data: listener } = supabase.auth.onAuthStateChange(() => { load(); });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    const goOnline = () => setOffline(false), goOffline = () => setOffline(true);
    setOffline(!navigator.onLine);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  useEffect(() => {
    try {
      setBalanceHidden(window.localStorage.getItem(BALANCE_HIDDEN_KEY) === "1");
    } catch {
      // Mode privat / storage diblokir: saldo tetap tampil.
    }
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  async function logout() {
    setAccountOpen(false);
    setMenuOpen(false);
    await supabase.auth.signOut();
    toast.show("Anda telah berhasil keluar.", "success");
    router.push("/");
    router.refresh();
  }

  const name = profile?.full_name || profile?.email?.split("@")[0] || "Pengguna";
  const clientIsAdmin = profile?.role === "ADMIN" || profile?.role === "SUPER_ADMIN";
  const isAdmin = serverIsAdmin || clientIsAdmin;
  const brand = String(brandName || "AIDIL STORE").trim() || "AIDIL STORE";
  const [brandFirst, ...brandRestParts] = brand.split(/\s+/);
  const brandRest = brandRestParts.join(" ");
  const brandLightLogo = logoLight || "/aidil-logo.png";

  useEffect(() => {
    const onAvatarUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ image_url?: string | null }>).detail;
      setAvatarUrl(detail?.image_url || null);
    };
    window.addEventListener("aidil:avatar-updated", onAvatarUpdated);
    return () => window.removeEventListener("aidil:avatar-updated", onAvatarUpdated);
  }, []);

  // NotificationBell sudah menghitung unread dari /api/notifications; badge drawer
  // ikut event itu supaya tidak menambah polling baru.
  useEffect(() => {
    const onNotifications = (event: Event) => {
      const detail = (event as CustomEvent<{ unread?: number }>).detail;
      if (typeof detail?.unread !== "number") return;
      const unread = Math.max(0, Math.floor(detail.unread));
      setDrawerBadges((current) => (current.notifications === unread ? current : { ...current, notifications: unread }));
    };
    window.addEventListener("aidil:notifications-updated", onNotifications);
    return () => window.removeEventListener("aidil:notifications-updated", onNotifications);
  }, []);

  // Data kartu profil & badge dimuat saat drawer dibuka saja: ringan (satu baris
  // atau head-count) dan tidak menambah query di setiap halaman.
  useEffect(() => {
    if (!profile) {
      setDrawerProfile(EMPTY_DRAWER_PROFILE);
      setDrawerBadges(EMPTY_BADGES);
      return;
    }
    if (!menuOpen) return;
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active || !user) return;
      const [kyc, wallet, rank, orders, support, notices] = await Promise.all([
        supabase.from("kyc_verifications").select("status").eq("user_id", user.id).maybeSingle(),
        supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_rankings").select("successful_transactions").eq("user_id", user.id).maybeSingle(),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "PROCESSING"),
        supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "WAITING_CUSTOMER"),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
      ]);
      if (!active) return;
      setDrawerProfile({
        kycStatus: kyc.error ? null : kycUiStatus(kyc.data?.status ?? "UNVERIFIED"),
        balance: wallet.data ? Number(wallet.data.balance ?? 0) : null,
        transactions: rank.data ? Number(rank.data.successful_transactions ?? 0) : null,
      });
      setDrawerBadges({
        notifications: Number(notices.count ?? 0),
        orders: Number(orders.count ?? 0),
        support: Number(support.count ?? 0),
      });
    })();
    return () => { active = false; };
  }, [menuOpen, profile, supabase]);

  function toggleBalance() {
    setBalanceHidden((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(BALANCE_HIDDEN_KEY, next ? "1" : "0");
      } catch {
        // Pilihan tetap berlaku di sesi ini walau tidak bisa disimpan.
      }
      return next;
    });
  }

  // Item login-only disembunyikan sampai profil termuat; bila semuanya
  // login-only, nav tetap tampil agar tidak kosong di halaman publik.
  const allowedBottomItems = visibleBottomNavItems(navSettings, { loggedIn: Boolean(profile) });
  const resolvedNavSettings: BottomNavSettings = {
    ...navSettings,
    items:
      allowedBottomItems.length > 0
        ? allowedBottomItems
        : navSettings.items.filter((item) => item.visible),
  };

  // Menu hamburger memakai data tunggal dari src/config/user-menu.ts; hanya
  // item yang boleh tampil (login/izin/fitur) yang dikirim ke drawer.
  const visibleGroups = useMemo(
    () =>
      filterUserMenuGroups(USER_MENU_GROUPS, {
        loggedIn: Boolean(profile),
        isAdmin,
        scanQrisEnabled,
      }),
    [profile, isAdmin, scanQrisEnabled]
  );
  const drawerGroups: NavDrawerGroup[] = useMemo(
    () =>
      visibleGroups.map((group) => ({
        id: group.id,
        label: group.label,
        items: group.items.map((item) => ({
          id: item.id,
          label: item.label,
          icon: item.icon,
          href: item.href,
          badge: item.badge ? drawerBadges[item.badge] : undefined,
        })),
      })),
    [visibleGroups, drawerBadges]
  );
  const activeHref = userActiveHref(pathname, visibleGroups);
  const pinnedItems: NavDrawerItem[] = isAdmin
    ? [
        {
          id: USER_ADMIN_MENU_ITEM.id,
          label: USER_ADMIN_MENU_ITEM.label,
          icon: USER_ADMIN_MENU_ITEM.icon,
          href: USER_ADMIN_MENU_ITEM.href,
          emphasis: true,
        },
      ]
    : [];

  const drawerHeader = (
    <div className="app-hero flex items-center gap-3 border-b border-white/10 p-4 text-white">
      <Image src={brandLightLogo} alt={`Logo ${brand}`} width={40} height={40} className="h-10 w-10 rounded-xl bg-white p-1" />
      <div className="min-w-0 flex-1">
        <p className="break-words font-black leading-5">{brand}</p>
        <p className="text-[10px] font-black uppercase tracking-widest text-gold-200">Akun Saya</p>
      </div>
      <button
        type="button"
        onClick={() => setMenuOpen(false)}
        aria-label="Tutup menu"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20"
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );

  const accountBlock = profile ? (
    <div className="relative rounded-2xl border border-app-border bg-app-surface shadow-sm">
      <Link href="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-3 pr-12">
        <AvatarRing
          size={44}
          src={avatarUrl}
          name={name}
          status={drawerProfile.kycStatus ?? "unverified"}
        />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="block min-w-0 truncate text-sm font-black text-app-text">{name}</span>
            {drawerProfile.kycStatus === "verified" ? <VerifiedBadge size={14} className="shrink-0" /> : null}
          </span>
          {drawerProfile.transactions !== null ? (
            <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
              <LevelChip transactions={drawerProfile.transactions} linkable={false} />
            </span>
          ) : null}
          <span className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-app-subtle">Saldo</span>
            <span className="min-w-0 break-words text-sm font-black tabular-nums text-app-text">
              {drawerProfile.balance === null ? "Memuat..." : balanceHidden ? "Rp ••••" : formatRupiah(drawerProfile.balance)}
            </span>
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={toggleBalance}
        aria-label={balanceHidden ? "Tampilkan saldo" : "Sembunyikan saldo"}
        className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-app-muted transition hover:bg-app-inset hover:text-app-text"
      >
        <EyeToggle hidden={balanceHidden} />
      </button>
    </div>
  ) : (
    <div className="grid grid-cols-2 gap-2">
      <Link
        href="/login"
        onClick={() => setMenuOpen(false)}
        className="flex min-h-11 items-center justify-center rounded-xl border border-app-border bg-app-surface px-3 text-sm font-black text-app-text transition hover:border-gold-400/60 hover:text-app-kicker"
      >
        LOGIN
      </Link>
      <Link
        href="/register"
        onClick={() => setMenuOpen(false)}
        className="btn-gold-metal flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-black transition"
      >
        DAFTAR
      </Link>
    </div>
  );

  const drawerFooter = profile ? (
    <button
      type="button"
      onClick={logout}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-danger-600 transition hover:bg-danger-500/10 dark:text-danger-400"
    >
      <Icon name="logout" size={18} />
      Keluar
    </button>
  ) : null;

  return (
    <>
      {offline && <div role="alert" className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-danger-600 px-4 py-2 text-center text-xs font-black text-white shadow-lg"><Icon name="signal_off" size={14} />Koneksi internet terputus</div>}
      <header className="sticky top-0 z-50 border-b border-app-border bg-app-bg/90 text-app-text shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="group flex shrink-0 items-center gap-3">
            <span className="flex h-11 w-11 overflow-hidden rounded-2xl bg-black shadow-lg shadow-zinc-950/20 ring-1 ring-gold-400/50 transition group-hover:scale-105">
              <Image src={brandLightLogo} alt={`Logo ${brand}`} width={44} height={44} priority className={`h-full w-full object-cover${logoDark ? " dark:hidden" : ""}`} />
              {logoDark ? (
                <Image src={logoDark} alt={`Logo ${brand}`} width={44} height={44} className="hidden h-full w-full object-cover dark:block" />
              ) : null}
            </span>
            <span className="leading-none">
              <span className="block text-[15px] font-black tracking-tight text-app-text">{brandFirst}</span>
              {brandRest ? (
                <span className="text-[10px] font-black tracking-[.24em] text-app-kicker">{brandRest}</span>
              ) : null}
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 lg:flex">
            <Link href="/" className={`nav-link ${pathname === "/" ? "nav-link-active" : ""}`}>Beranda</Link>
            {profile && <Link href="/dashboard" className={`nav-link ${pathname === "/dashboard" ? "nav-link-active" : ""}`}>Dashboard</Link>}
            {profile && <Link href="/wallet" className={`nav-link ${pathname.startsWith("/wallet") ? "nav-link-active" : ""}`}>Saldo</Link>}
            {profile && <Link href="/orders" className={`nav-link ${pathname.startsWith("/orders") ? "nav-link-active" : ""}`}>Pesanan</Link>}
            {profile && <Link href="/diskusi" className={`nav-link ${pathname.startsWith("/diskusi") ? "nav-link-active" : ""}`}>Diskusi</Link>}
            <Link href="/calculator" className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-black text-app-kicker transition ${pathname === "/calculator" ? "bg-gold-400/20" : "bg-gold-400/10 hover:bg-gold-400/20"}`}><Icon name="calculator" size={16} />Kalkulator</Link>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
            {profile && <NotificationBell />}
            <ThemeToggle />
            {loading ? (
              <Skeleton className="h-10 w-24 rounded-xl" />
            ) : profile ? (
              <div className="relative hidden sm:block">
                <button onClick={() => setAccountOpen((v) => !v)} className="flex items-center gap-2 rounded-xl border border-app-border bg-app-surface px-2 py-1.5 transition hover:bg-app-inset">
                  <UserAvatar size={32} src={avatarUrl} name={name} ring={false} />
                  <span className="max-w-[110px] truncate text-sm font-bold text-app-text">{name}</span>
                  <span className="text-app-subtle"><Icon name="chevron_down" size={14} /></span>
                </button>
                {accountOpen && (
                  <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-app-border bg-app-surface p-2 shadow-2xl">
                    <div className="flex items-center gap-3 border-b border-app-border px-3 py-3">
                      <UserAvatar size={40} src={avatarUrl} name={name} />
                      <span className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-app-text">{name}</p>
                        <p className="truncate text-xs text-app-subtle">{profile.email}</p>
                      </span>
                    </div>
                    {ACCOUNT_LINKS.map(([href, icon, label]) => (
                      <Link key={href} href={href} onClick={() => setAccountOpen(false)} className="mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold text-app-muted transition hover:bg-app-accent-soft hover:text-app-text"><Icon name={icon} size={16} />{label}</Link>
                    ))}
                    {isAdmin && <Link href="/admin" onClick={() => setAccountOpen(false)} className="mt-1 flex items-center gap-2.5 rounded-xl bg-gold-400/10 px-3 py-2.5 text-sm font-black text-app-kicker"><Icon name="tools" size={16} />Panel Admin</Link>}
                    <button onClick={logout} className="mt-1 flex w-full items-center gap-2.5 rounded-xl border-t border-app-border px-3 py-2.5 text-left text-sm font-black text-danger-600 transition hover:bg-danger-500/10 dark:text-danger-400"><Icon name="logout" size={16} />Keluar</button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link href="/login" className="hidden rounded-xl border border-app-border px-4 py-2.5 text-sm font-black text-app-text transition hover:border-gold-400/60 hover:text-app-kicker sm:block">Masuk</Link>
                <Link href="/register" className="btn-gold-metal hidden rounded-xl px-4 py-2.5 text-sm font-black transition sm:block">Daftar</Link>
              </>
            )}
            <button className={`${HEADER_ICON_BUTTON} lg:hidden`} onClick={() => setMenuOpen((v) => !v)} aria-label={menuOpen ? "Tutup menu" : "Buka menu"} aria-expanded={menuOpen} aria-controls="user-menu-drawer"><Icon name={menuOpen ? "close" : "menu"} size={18} /></button>
          </div>
        </div>
      </header>

      <BottomNav
        settings={resolvedNavSettings}
        pathname={pathname}
        menuOpen={menuOpen}
        onMenu={() => setMenuOpen((v) => !v)}
        hidden={pathname.startsWith("/checkout") || pathname.startsWith("/scan-qris/qris-confirm")}
      />

      <NavDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={() => setMenuOpen(false)}
        ariaLabel="Menu akun"
        panelId="user-menu-drawer"
        header={drawerHeader}
        accountBlock={accountBlock}
        groups={drawerGroups}
        activeHref={activeHref}
        favoritesKey="aidil_user_favs_v1"
        collapsedKey="aidil_user_groups_v1"
        pinnedItems={pinnedItems}
        footer={drawerFooter}
        searchPlaceholder="Cari menu..."
        emptyText="Menu tidak ditemukan"
        navLabel="Menu akun"
      />
    </>
  );
}
