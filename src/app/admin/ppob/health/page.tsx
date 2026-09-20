"use client";
import { useEffect, useState } from "react";
import Button from "@/components/Button";

type Health = { provider:string; configured:boolean; testing:boolean; services:{total:number;active:number;inactive:number}; processing:number; lastSync:any };
export default function ProviderHealthPage(){
  const [data,setData]=useState<Health|null>(null); const [loading,setLoading]=useState(true); const [checking,setChecking]=useState(false); const [message,setMessage]=useState("");
  async function load(){setLoading(true);try{const r=await fetch('/api/admin/ppob/health',{cache:'no-store'});if(r.ok)setData(await r.json());}finally{setLoading(false)}}
  async function check(){setChecking(true);setMessage('');try{const r=await fetch('/api/admin/ppob/health',{method:'POST'});const d=await r.json();setMessage(r.ok?`Provider terhubung • ${d.prepaidSkuCount} SKU • ${d.latencyMs} ms`:(d.message||'Provider tidak dapat dihubungi.'));}catch(e:any){setMessage(e?.message||'Gagal mengecek provider.')}finally{setChecking(false)}}
  useEffect(()=>{load();const t=window.setInterval(load,30000);return()=>window.clearInterval(t)},[]);
  const status=!data?'Memuat...':!data.configured?'Credential belum diisi':data.lastSync?.status==='SUCCESS'?'Tersinkron':'Siap dicek';
  return <div className="space-y-5">
    <div className="rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-zinc-950 p-6 text-white shadow-xl"><p className="text-xs font-black uppercase tracking-[.2em] text-amber-300">PPOB CONTROL CENTER</p><h1 className="mt-2 text-2xl font-black">Provider Health</h1><p className="mt-2 text-sm text-white/65">Pantau koneksi provider, SKU aktif, sinkronisasi terakhir, dan transaksi yang masih diproses.</p></div>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold text-slate-400">Provider</p><p className="mt-1 text-xl font-black capitalize">{data?.provider||'Digiflazz'}</p><p className="mt-1 text-xs font-bold text-slate-500">{status}</p></div>
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold text-slate-400">SKU Aktif</p><p className="mt-1 text-2xl font-black">{data?.services.active??'—'}</p><p className="text-xs text-slate-400">dari {data?.services.total??'—'} layanan</p></div>
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold text-slate-400">Sedang Diproses</p><p className="mt-1 text-2xl font-black">{data?.processing??'—'}</p><p className="text-xs text-slate-400">transaksi PPOB</p></div>
      <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-bold text-slate-400">Mode</p><p className="mt-1 text-xl font-black">{data?.testing?'Testing':'Production'}</p><p className="text-xs text-slate-400">DIGIFLAZZ_TESTING</p></div>
    </section>
    <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">Koneksi provider</h2><p className="mt-1 text-sm text-slate-500">Tes request pricelist tanpa mengubah produk atau saldo.</p></div><Button onClick={check} loading={checking}>{checking?'Mengecek...':'🔌 Test Provider'}</Button></div>{message&&<div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">{message}</div>}</section>
    <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6"><h2 className="font-black">Sinkronisasi terakhir</h2>{loading?<p className="mt-3 text-sm text-slate-500">Memuat...</p>:!data?.lastSync?<p className="mt-3 text-sm text-slate-500">Belum ada sinkronisasi.</p>:<div className="mt-4 grid gap-3 sm:grid-cols-4"><div><p className="text-xs text-slate-400">Status</p><p className="font-black">{data.lastSync.status}</p></div><div><p className="text-xs text-slate-400">Pricelist</p><p className="font-black">{data.lastSync.fetched}</p></div><div><p className="text-xs text-slate-400">Baru / Update</p><p className="font-black">{data.lastSync.created_count} / {data.lastSync.updated_count}</p></div><div><p className="text-xs text-slate-400">Waktu mulai</p><p className="font-black text-sm">{new Date(data.lastSync.started_at).toLocaleString('id-ID')}</p></div></div>}</section>
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900"><b>Catatan:</b> halaman ini tidak menampilkan API key. Credential provider tetap hanya berada di environment server.</div>
  </div>
}
