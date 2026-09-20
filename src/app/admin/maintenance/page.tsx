"use client";
import { useEffect, useState } from "react";

const DEFAULTS = { enabled:false, title:"AIDIL STORE sedang dalam pemeliharaan", message:"Kami sedang melakukan perbaikan dan peningkatan sistem. Silakan coba kembali beberapa saat lagi.", starts_at:"", ends_at:"", allow_admin_bypass:true };
function toInputDate(value?: string|null){if(!value)return "";const d=new Date(value);if(Number.isNaN(d.getTime()))return "";const p=(n:number)=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;}
export default function MaintenanceAdmin(){
 const [form,setForm]=useState(DEFAULTS);const[loading,setLoading]=useState(true);const[saving,setSaving]=useState(false);const[msg,setMsg]=useState("");
 async function load(){setLoading(true);const r=await fetch("/api/admin/maintenance",{cache:"no-store"});const j=await r.json();if(r.ok&&j.settings)setForm({...DEFAULTS,...j.settings,starts_at:toInputDate(j.settings.starts_at),ends_at:toInputDate(j.settings.ends_at)});else setMsg(j.message||"Gagal memuat pengaturan");setLoading(false);}
 useEffect(()=>{load();},[]);
 async function save(){setSaving(true);setMsg("");const r=await fetch("/api/admin/maintenance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,starts_at:form.starts_at?new Date(form.starts_at).toISOString():null,ends_at:form.ends_at?new Date(form.ends_at).toISOString():null})});const j=await r.json();setMsg(r.ok?"Pengaturan maintenance berhasil disimpan.":(j.message||"Gagal menyimpan"));setSaving(false);}
 if(loading)return <div className="rounded-2xl border bg-white p-6">Memuat...</div>;
 return <div className="space-y-5">
  <div className="rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-zinc-950 p-6 text-white"><p className="text-xs font-black uppercase tracking-[.2em] text-amber-300">SYSTEM CONTROL</p><h1 className="mt-2 text-2xl font-black">Maintenance Mode</h1><p className="mt-2 text-sm text-white/65">Nyalakan halaman pemeliharaan dari Admin tanpa mengubah kode. Admin tetap dapat mengakses dashboard.</p></div>
  <section className="rounded-2xl border bg-white p-5 shadow-sm">
   <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5"><div><h2 className="font-black">Status sistem</h2><p className="mt-1 text-sm text-slate-500">Pengunjung biasa akan diarahkan ke halaman maintenance saat status aktif.</p></div><button onClick={()=>setForm({...form,enabled:!form.enabled})} className={`rounded-full px-5 py-3 text-sm font-black ${form.enabled?"bg-red-600 text-white":"bg-slate-100 text-slate-700"}`}>{form.enabled?"🔴 MAINTENANCE ON":"🟢 MAINTENANCE OFF"}</button></div>
   <div className="mt-5 grid gap-4 md:grid-cols-2">
    <label className="text-sm font-bold">Judul<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} className="mt-2 w-full rounded-xl border p-3 font-normal"/></label>
    <label className="text-sm font-bold">Mulai (opsional)<input type="datetime-local" value={form.starts_at} onChange={e=>setForm({...form,starts_at:e.target.value})} className="mt-2 w-full rounded-xl border p-3 font-normal"/></label>
    <label className="text-sm font-bold md:col-span-2">Pesan<textarea value={form.message} onChange={e=>setForm({...form,message:e.target.value})} rows={4} className="mt-2 w-full rounded-xl border p-3 font-normal"/></label>
    <label className="text-sm font-bold">Selesai (opsional)<input type="datetime-local" value={form.ends_at} onChange={e=>setForm({...form,ends_at:e.target.value})} className="mt-2 w-full rounded-xl border p-3 font-normal"/></label>
    <label className="flex items-end gap-3 pb-3 text-sm font-bold"><input type="checkbox" checked={form.allow_admin_bypass} onChange={e=>setForm({...form,allow_admin_bypass:e.target.checked})}/> Admin tetap dapat mengakses website saat maintenance</label>
   </div>
   <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900"><b>Operasional aman:</b> halaman pelanggan dan API transaksi baru dihentikan. Webhook pembayaran, PPOB webhook, dan cron operasional tetap dibiarkan berjalan agar transaksi yang sudah dimulai dapat diselesaikan.</div>
   {msg&&<p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm font-semibold">{msg}</p>}
   <button disabled={saving} onClick={save} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving?"Menyimpan...":"Simpan Pengaturan"}</button>
  </section>
  <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-black">Pratinjau</h2><div className="mt-4 rounded-2xl bg-slate-950 p-6 text-white"><div className="mx-auto max-w-lg text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-300 text-2xl">🛠️</div><p className="mt-4 text-xs font-black uppercase tracking-[.2em] text-amber-300">AIDIL STORE</p><h3 className="mt-2 text-xl font-black">{form.title}</h3><p className="mt-2 text-sm leading-6 text-white/60">{form.message}</p></div></div></section>
 </div>;
}
