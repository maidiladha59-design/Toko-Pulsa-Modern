"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "./ToastProvider";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";

type Profile={full_name:string|null;email:string;role:string};
export default function Navbar({scanQrisEnabled=true}:{scanQrisEnabled?:boolean}){
  const pathname=usePathname();
  if(pathname==="/login"||pathname==="/register"||pathname==="/admin-login") return null;
  return <NavbarContent scanQrisEnabled={scanQrisEnabled}/>;
}
function NavbarContent({scanQrisEnabled}:{scanQrisEnabled:boolean}){
 const pathname=usePathname();
 const supabase=createClient(),router=useRouter(),toast=useToast();
 const[profile,setProfile]=useState<Profile|null>(null),[loading,setLoading]=useState(true),[menuOpen,setMenuOpen]=useState(false),[accountOpen,setAccountOpen]=useState(false),[offline,setOffline]=useState(false);
 useEffect(()=>{let mounted=true;async function load(){const{data:{user}}=await supabase.auth.getUser();if(!user){if(mounted){setProfile(null);setLoading(false)}return}const{data}=await supabase.from("profiles").select("full_name,email,role").eq("id",user.id).single();if(mounted){setProfile(data as Profile);setLoading(false)}}load();const{data:listener}=supabase.auth.onAuthStateChange(()=>{load()});return()=>{mounted=false;listener.subscription.unsubscribe()}},[supabase]);
 useEffect(()=>{const goOnline=()=>setOffline(false),goOffline=()=>setOffline(true);setOffline(!navigator.onLine);window.addEventListener("online",goOnline);window.addEventListener("offline",goOffline);return()=>{window.removeEventListener("online",goOnline);window.removeEventListener("offline",goOffline)}},[]);
 async function logout(){setAccountOpen(false);setMenuOpen(false);await supabase.auth.signOut();toast.show("Anda telah berhasil keluar.","success");router.push("/");router.refresh()}
 const name=profile?.full_name||profile?.email?.split("@")[0]||"Pengguna",initial=name.charAt(0).toUpperCase(),isAdmin=profile?.role==="ADMIN"||profile?.role==="SUPER_ADMIN";
 return <>
  {offline&&<div role="alert" className="fixed inset-x-0 top-0 z-[100] bg-red-600 px-4 py-2 text-center text-xs font-black text-white shadow-lg">📶 Koneksi internet terputus</div>}
  <header className="sticky top-0 z-50 border-b border-app-border bg-app-bg/90 text-app-text shadow-sm backdrop-blur-xl"><div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
   <Link href="/" className="group flex shrink-0 items-center gap-3"><span className="flex h-11 w-11 overflow-hidden rounded-2xl bg-black shadow-lg shadow-zinc-950/20 ring-1 ring-gold-400/50 transition group-hover:scale-105"><img src="/aidil-logo.png" alt="Logo AIDIL STORE" className="h-full w-full object-cover"/></span><span className="leading-none"><span className="block text-[15px] font-black tracking-tight text-app-text">AIDIL</span><span className="text-[10px] font-black tracking-[.24em] text-app-kicker">STORE</span></span></Link>
   <nav className="ml-auto hidden items-center gap-1 lg:flex"><Link href="/" className="nav-link">Beranda</Link>{profile&&<Link href="/dashboard" className="nav-link">Dashboard</Link>}{profile&&<Link href="/wallet" className="nav-link">Saldo</Link>}{profile&&<Link href="/orders" className="nav-link">Pesanan</Link>}<Link href="/calculator" className="rounded-xl bg-gold-400/10 px-3 py-2 text-sm font-black text-app-kicker transition hover:bg-gold-400/20">🧮 Kalkulator</Link></nav>
   <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">{profile&&<NotificationBell/>}<ThemeToggle/>{loading?<div className="h-10 w-24 animate-pulse rounded-xl bg-app-inset"/>:profile?<div className="relative hidden sm:block"><button onClick={()=>setAccountOpen(v=>!v)} className="flex items-center gap-2 rounded-xl border border-app-border bg-app-surface px-2 py-1.5 transition hover:bg-app-inset"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-400 text-xs font-black text-zinc-950">{initial}</span><span className="max-w-[110px] truncate text-sm font-bold text-app-text">{name}</span><span className="text-xs text-app-subtle">⌄</span></button>{accountOpen&&<div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-app-border bg-app-surface p-2 shadow-2xl"><div className="border-b border-app-border px-3 py-3"><p className="text-sm font-black text-app-text">{name}</p><p className="truncate text-xs text-app-subtle">{profile.email}</p></div>{[["/profile","👤 Profil Saya"],["/wallet","💰 Saldo & Top Up"],["/transfer-uang","📤 Transfer Saldo"],["/split-bill","🧾 Split Bill"],["/orders","📦 Pesanan Saya"],["/transactions","🧾 Transaksi"],["/calculator","🧮 Kalkulator"],["/bantuan","💬 Bantuan"]].map(([href,label])=><Link key={href} href={href} onClick={()=>setAccountOpen(false)} className="mt-1 block rounded-xl px-3 py-2.5 text-sm font-medium text-app-muted transition hover:bg-app-accent-soft hover:text-app-text">{label}</Link>)}{isAdmin&&<Link href="/admin" onClick={()=>setAccountOpen(false)} className="mt-1 block rounded-xl bg-gold-400/10 px-3 py-2.5 text-sm font-black text-app-kicker">🛠️ Panel Admin</Link>}<button onClick={logout} className="mt-1 w-full rounded-xl border-t border-app-border px-3 py-2.5 text-left text-sm font-black text-red-600 transition hover:bg-red-500/10 dark:text-red-400">🚪 Keluar</button></div>}</div>:<><Link href="/login" className="hidden rounded-xl border border-app-border px-4 py-2.5 text-sm font-black text-app-text transition hover:border-gold-400/60 hover:text-app-kicker sm:block">Masuk</Link><Link href="/register" className="hidden rounded-xl bg-gold-400 px-4 py-2.5 text-sm font-black text-zinc-950 transition hover:bg-gold-300 sm:block">Daftar</Link></>}
   <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-app-border bg-app-surface text-lg text-app-muted transition hover:bg-app-inset lg:hidden" onClick={()=>setMenuOpen(v=>!v)} aria-label="Buka menu">{menuOpen?"✕":"☰"}</button></div></div>
  </header>

  <nav className="fixed inset-x-0 bottom-0 z-[60] border-t border-app-border bg-app-bg/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_25px_rgba(0,0,0,.10)] backdrop-blur-xl md:hidden">
    <div className="mx-auto grid max-w-lg grid-cols-5">
      <Link href="/" className={`mobile-link ${pathname==="/"?"mobile-link-active":""}`}>⌂<span>Beranda</span></Link>
      {profile&&<Link href="/transactions" className={`mobile-link ${pathname==="/transactions"?"mobile-link-active":""}`}>▤<span>Transaksi</span></Link>}
      {profile&&<Link href="/wallet" className={`mobile-link ${pathname.startsWith("/wallet")?"mobile-link-active":""}`}>▣<span>Saldo</span></Link>}
      <Link href="/calculator" className={`mobile-link ${pathname==="/calculator"?"mobile-link-active":""}`}>🧮<span>Kalkulator</span></Link>
      <button onClick={()=>setMenuOpen(v=>!v)} className={`mobile-link ${menuOpen?"mobile-link-active":""}`}>☰<span>Lainnya</span></button>
    </div>
  </nav>

  {menuOpen&&<div className="fixed inset-x-0 bottom-0 top-[69px] z-[56] bg-black/40 lg:hidden" onClick={()=>setMenuOpen(false)}><div onClick={e=>e.stopPropagation()} className="max-h-[calc(100dvh-69px-80px)] overflow-y-auto rounded-b-3xl border-b border-app-border bg-app-surface px-4 py-4 shadow-2xl"><div className="grid grid-cols-2 gap-2 text-sm">{[["/","🏠 Beranda"],["/layanan","🛍️ Layanan"],...(profile?[["/transfer-uang","📤 Transfer Saldo"],["/transfer-uang/qr","📥 QR Pribadi"],["/split-bill","🧾 Split Bill"]]:[]),...(scanQrisEnabled?[["/scan-qris","▣ Scan QRIS"]]:[]),["/kyc","🪪 Verifikasi Akun"],["/notifications","🔔 Pemberitahuan"],["/referral","🎁 Undang Teman"],["/settings","⚙️ Pengaturan"],["/bantuan","💬 Bantuan"]].map(([href,label])=><Link key={href} href={href} onClick={()=>setMenuOpen(false)} className="rounded-xl border border-app-border bg-app-inset px-3 py-3 font-bold text-app-text transition hover:border-gold-400/40 hover:text-app-kicker">{label}</Link>)}{profile&&<Link href="/orders" onClick={()=>setMenuOpen(false)} className="rounded-xl border border-app-border bg-app-inset px-3 py-3 font-bold text-app-text transition hover:border-gold-400/40 hover:text-app-kicker">📦 Pesanan</Link>}{isAdmin&&<Link href="/admin" onClick={()=>setMenuOpen(false)} className="rounded-xl border border-gold-400/25 bg-gold-400/10 px-3 py-3 font-black text-app-kicker">🛠️ Panel Admin</Link>}{profile?<button onClick={logout} className="rounded-xl bg-red-500/10 px-3 py-3 text-left font-black text-red-600 dark:text-red-400">🚪 Keluar</button>:<><Link href="/login" className="rounded-xl border border-app-border bg-app-surface px-3 py-3 text-center font-black text-app-text">Masuk</Link><Link href="/register" className="rounded-xl bg-gold-400 px-3 py-3 text-center font-black text-zinc-950">Daftar</Link></>}</div></div></div>}
 </>
}
