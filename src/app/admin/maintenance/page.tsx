"use client";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import Icon from "@/components/icons/Icon";

const DEFAULTS = { enabled:false, title:"AIDIL STORE sedang dalam pemeliharaan", message:"Kami sedang melakukan perbaikan dan peningkatan sistem. Silakan coba kembali beberapa saat lagi.", starts_at:"", ends_at:"", allow_admin_bypass:true };
function toInputDate(value?: string|null){if(!value)return "";const d=new Date(value);if(Number.isNaN(d.getTime()))return "";const p=(n:number)=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;}
export default function MaintenanceAdmin(){
 const [form,setForm]=useState(DEFAULTS);const[loading,setLoading]=useState(true);const[saving,setSaving]=useState(false);const[msg,setMsg]=useState("");
 async function load(){setLoading(true);const r=await fetch("/api/admin/maintenance",{cache:"no-store"});const j=await r.json();if(r.ok&&j.settings)setForm({...DEFAULTS,...j.settings,starts_at:toInputDate(j.settings.starts_at),ends_at:toInputDate(j.settings.ends_at)});else setMsg(j.message||"Gagal memuat pengaturan");setLoading(false);}
 useEffect(()=>{load();},[]);
 async function save(){setSaving(true);setMsg("");const r=await fetch("/api/admin/maintenance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,starts_at:form.starts_at?new Date(form.starts_at).toISOString():null,ends_at:form.ends_at?new Date(form.ends_at).toISOString():null})});const j=await r.json();setMsg(r.ok?"Pengaturan maintenance berhasil disimpan.":(j.message||"Gagal menyimpan"));setSaving(false);}
 if(loading)return <LoadingSkeleton rows={6} />;
 return <div className="space-y-5">
  <div className="rounded-3xl bg-gradient-to-r from-zinc-900 via-gold-700 to-black p-6 text-white shadow-lg shadow-gold-500/15"><p className="text-xs font-black uppercase tracking-widest text-gold-100">System Control</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">Maintenance Mode</h1><p className="mt-1 text-sm text-gold-100">Nyalakan halaman pemeliharaan dari Admin tanpa mengubah kode. Admin tetap dapat mengakses dashboard.</p></div>
  <Card>
   <div className="flex flex-wrap items-center justify-between gap-4 border-b border-app-border pb-5"><div><CardTitle>Status sistem</CardTitle><CardDescription>Pengunjung biasa akan diarahkan ke halaman maintenance saat status aktif.</CardDescription></div><Button variant={form.enabled?"destructive":"outline"} onClick={()=>setForm({...form,enabled:!form.enabled})}>{form.enabled?<><Icon name="dot" size={12} />MAINTENANCE ON</>:<><Icon name="dot" size={12} className="text-success-600 dark:text-success-400" />MAINTENANCE OFF</>}</Button></div>
   <div className="mt-5 grid gap-3 md:grid-cols-2">
    <Input label="Judul" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} className="bg-app-inset"/>
    <Input label="Mulai (opsional)" type="datetime-local" value={form.starts_at} onChange={e=>setForm({...form,starts_at:e.target.value})} className="bg-app-inset"/>
    <div className="md:col-span-2"><p className="mb-2 text-sm font-bold text-app-text">Pesan</p><textarea value={form.message} onChange={e=>setForm({...form,message:e.target.value})} rows={4} className="w-full rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"/></div>
    <Input label="Selesai (opsional)" type="datetime-local" value={form.ends_at} onChange={e=>setForm({...form,ends_at:e.target.value})} className="bg-app-inset"/>
    <label className="flex items-center gap-3 self-center text-sm font-bold text-app-text"><input type="checkbox" checked={form.allow_admin_bypass} onChange={e=>setForm({...form,allow_admin_bypass:e.target.checked})} className="h-4 w-4 accent-gold-400"/> Admin tetap dapat mengakses website saat maintenance</label>
   </div>
   <div className="mt-5 rounded-2xl border border-warning-500/30 bg-warning-500/10 p-4 text-sm leading-6 text-warning-800 dark:text-warning-300"><b>Operasional aman:</b> halaman pelanggan dan API transaksi baru dihentikan. Webhook pembayaran, PPOB webhook, dan cron operasional tetap dibiarkan berjalan agar transaksi yang sudah dimulai dapat diselesaikan.</div>
   {msg&&<p className="mt-4 rounded-xl bg-app-inset p-3 text-sm font-bold text-app-text">{msg}</p>}
   <Button disabled={saving} onClick={save} className="mt-5">{saving?"Menyimpan...":"Simpan Pengaturan"}</Button>
  </Card>
  <Card><CardTitle>Pratinjau</CardTitle><div className="mt-4 rounded-2xl bg-zinc-900 p-6 text-white"><div className="mx-auto max-w-lg text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-400"><Icon name="tools" size={24} /></div><p className="mt-4 text-xs font-black uppercase tracking-widest text-gold-300">AIDIL STORE</p><h3 className="mt-2 text-xl font-black">{form.title}</h3><p className="mt-2 text-sm leading-6 text-white/60">{form.message}</p></div></div></Card>
 </div>;
}
