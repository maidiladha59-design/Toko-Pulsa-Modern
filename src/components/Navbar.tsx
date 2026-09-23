"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "./ToastProvider";
import NotificationBell from "./NotificationBell";

type Profile={full_name:string|null;email:string;role:string};
export default function Navbar(){
  const pathname=usePathname();
  if(pathname==="/login"||pathname==="/register"||pathname==="/admin-login") return null;
  return <NavbarContent/>;
}
function NavbarContent(){
 const pathname=usePathname();
 const supabase=createClient(),router=useRouter(),toast=useToast();
 const[profile,setProfile]=useState<Profile|null>(null),[loading,setLoading]=useState(true),[menuOpen,setMenuOpen]=useState(false),[accountOpen,setAccountOpen]=useState(false);
 useEffect(()=>{let mounted=true;async function load(){const{data:{user}}=await supabase.auth.getUser();if(!user){if(mounted){setProfile(null);setLoading(false)}return}const{data}=await supabase.from("profiles").select("full_name,email,role").eq("id",user.id).single();if(mounted){setProfile(data as Profile);setLoading(false)}}load();const{data:listener}=supabase.auth.onAuthStateChange(()=>{load()});return()=>{mounted=false;listener.subscription.unsubscribe()}},[supabase]);
 async function logout(){setAccountOpen(false);setMenuOpen(false);await supabase.auth.signOut();toast.show("Anda telah berhasil keluar.","success");router.push("/");router.refresh()}
 const name=profile?.full_name||profile?.email?.split("@")[0]||"Pengguna",initial=name.charAt(0).toUpperCase(),isAdmin=profile?.role==="ADMIN"||profile?.role==="SUPER_ADMIN";
 return <>
  <header className="sticky top-0 z-50 border-b border-gold-100/80 bg-white/95 shadow-sm backdrop-blur-xl"><div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
   <Link href="/" className="group flex shrink-0 items-center gap-3"><span className="flex h-11 w-11 overflow-hidden rounded-2xl bg-black shadow-lg shadow-zinc-950/20 ring-1 ring-yellow-300/70 transition group-hover:scale-105"><img src="/aidil-logo.png" alt="Logo AIDIL STORE" className="h-full w-full object-cover"/></span><span className="leading-none"><span className="block text-[15px] font-black tracking-tight">AIDIL</span><span className="text-[10px] font-black tracking-[.24em] text-gold-700">STORE</span></span></Link>
   <nav className="ml-auto hidden items-center gap-1 lg:flex"><Link href="/" className="nav-link">Beranda</Link>{profile&&<Link href="/dashboard" className="nav-link">Dashboard</Link>}{profile&&<Link href="/wallet" className="nav-link">Saldo</Link>}{profile&&<Link href="/orders" className="nav-link">Pesanan</Link>}<Link href="/calculator" className="rounded-xl bg-yellow-50 px-3 py-2 text-sm font-black text-yellow-800 hover:bg-yellow-100">🧮 Kalkulator</Link></nav>
   <div className="flex items-center gap-2">{profile&&<NotificationBell/>}{loading?<div className="h-10 w-24 animate-pulse rounded-xl bg-gold-50"/>:profile?<div className="relative hidden sm:block"><button onClick={()=>setAccountOpen(v=>!v)} className="flex items-center gap-2 rounded-xl border border-gold-100 bg-white px-2 py-1.5 hover:bg-gold-50"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-950 text-xs font-black text-yellow-300">{initial}</span><span className="max-w-[110px] truncate text-sm font-bold">{name}</span><span className="text-xs text-slate-400">⌄</span></button>{accountOpen&&<div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-gold-100 bg-white p-2 shadow-2xl"><div className="border-b border-slate-100 px-3 py-3"><p className="text-sm font-black">{name}</p><p className="truncate text-xs text-slate-400">{profile.email}</p></div>{[["/profile","👤 Profil Saya"],["/wallet","💰 Saldo & Top Up"],["/orders","📦 Pesanan Saya"],["/transactions","🧾 Transaksi"],["/calculator","🧮 Kalkulator"],["/bantuan","💬 Bantuan"]].map(([href,label])=><Link key={href} href={href} onClick={()=>setAccountOpen(false)} className="mt-1 block rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-gold-50">{label}</Link>)}{isAdmin&&<Link href="/admin" onClick={()=>setAccountOpen(false)} className="mt-1 block rounded-xl bg-yellow-50 px-3 py-2.5 text-sm font-black text-yellow-800">🛠️ Panel Admin</Link>}<button onClick={logout} className="mt-1 w-full rounded-xl border-t border-slate-100 px-3 py-2.5 text-left text-sm font-black text-red-600 hover:bg-red-50">🚪 Keluar</button></div>}</div>:<><Link href="/login" className="hidden rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-black text-white sm:block">Masuk</Link><Link href="/register" className="hidden rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-black text-black sm:block">Daftar</Link></>}
   <button className="rounded-xl border border-gold-100 p-2.5 text-slate-600 hover:bg-gold-50 lg:hidden" onClick={()=>setMenuOpen(v=>!v)} aria-label="Buka menu">☰</button></div></div>
  </header>

  <nav className="fixed inset-x-0 bottom-0 z-[60] border-t border-gold-100 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_25px_rgba(76,29,149,.08)] backdrop-blur-xl md:hidden">
    <div className="mx-auto grid max-w-lg grid-cols-5">
      <Link href="/" className={`mobile-link ${pathname==="/"?"mobile-link-active":""}`}>⌂<span>Beranda</span></Link>
      {profile&&<Link href="/transactions" className={`mobile-link ${pathname==="/transactions"?"mobile-link-active":""}`}>▤<span>Transaksi</span></Link>}
      {profile&&<Link href="/wallet" className={`mobile-link ${pathname.startsWith("/wallet")?"mobile-link-active":""}`}>▣<span>Saldo</span></Link>}
      <Link href="/calculator" className={`mobile-link ${pathname==="/calculator"?"mobile-link-active":""}`}>🧮<span>Kalkulator</span></Link>
      <button onClick={()=>setMenuOpen(v=>!v)} className={`mobile-link ${menuOpen?"mobile-link-active":""}`}>☰<span>Lainnya</span></button>
    </div>
  </nav>

  {menuOpen&&<div className="fixed inset-x-0 bottom-[64px] z-[60] border-t border-gold-100 bg-white px-4 py-3 shadow-lg lg:hidden"><div className="grid grid-cols-2 gap-2 text-sm">{[["/","🏠 Beranda"],["/layanan","🛍️ Layanan"],["/scan-qris","▣ Scan QRIS"],["/kyc","🪪 Verifikasi Akun"],["/notifications","🔔 Pemberitahuan"],["/referral","🎁 Undang Teman"],["/settings","⚙️ Pengaturan"],["/bantuan","💬 Bantuan"]].map(([href,label])=><Link key={href} href={href} onClick={()=>setMenuOpen(false)} className="rounded-xl bg-gold-50 px-3 py-3 font-bold text-zinc-950">{label}</Link>)}{profile&&<Link href="/orders" onClick={()=>setMenuOpen(false)} className="rounded-xl bg-gold-50 px-3 py-3 font-bold">📦 Pesanan</Link>}{isAdmin&&<Link href="/admin" onClick={()=>setMenuOpen(false)} className="rounded-xl bg-yellow-50 px-3 py-3 font-black text-yellow-900">🛠️ Panel Admin</Link>}{profile?<button onClick={logout} className="rounded-xl bg-red-50 px-3 py-3 text-left font-black text-red-600">🚪 Keluar</button>:<><Link href="/login" className="rounded-xl bg-zinc-900 px-3 py-3 text-center font-black text-white">Masuk</Link><Link href="/register" className="rounded-xl bg-yellow-400 px-3 py-3 text-center font-black text-black">Daftar</Link></>}</div></div>}
 </>
}