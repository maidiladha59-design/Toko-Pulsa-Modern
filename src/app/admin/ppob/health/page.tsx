"use client";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import Badge, { statusTone } from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";

type Health = { provider:string; configured:boolean; testing:boolean; services:{total:number;active:number;inactive:number}; processing:number; lastSync:any };
export default function ProviderHealthPage(){
  const [data,setData]=useState<Health|null>(null); const [loading,setLoading]=useState(true); const [checking,setChecking]=useState(false); const [message,setMessage]=useState("");
  async function load(){setLoading(true);try{const r=await fetch('/api/admin/ppob/health',{cache:'no-store'});if(r.ok)setData(await r.json());}finally{setLoading(false)}}
  async function check(){setChecking(true);setMessage('');try{const r=await fetch('/api/admin/ppob/health',{method:'POST'});const d=await r.json();setMessage(r.ok?`Provider terhubung • ${d.prepaidSkuCount} SKU • ${d.latencyMs} ms`:(d.message||'Provider tidak dapat dihubungi.'));}catch(e:any){setMessage(e?.message||'Gagal mengecek provider.')}finally{setChecking(false)}}
  useEffect(()=>{load();const t=window.setInterval(load,30000);return()=>window.clearInterval(t)},[]);
  const status=!data?'Memuat...':!data.configured?'Credential belum diisi':data.lastSync?.status==='SUCCESS'?'Tersinkron':'Siap dicek';
  return <div className="space-y-5">
    <div>
      <p className="text-xs font-black uppercase tracking-widest text-app-kicker">PPOB CONTROL CENTER</p>
      <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Provider Health</h1>
      <p className="mt-1 text-sm text-app-muted">Pantau koneksi provider, SKU aktif, sinkronisasi terakhir, dan transaksi yang masih diproses.</p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <p className="text-xs font-bold text-app-subtle">Provider</p>
        <p className="mt-1 text-xl font-black capitalize text-app-text">{data?.provider||'Digiflazz'}</p>
        <p className="mt-1 text-xs font-bold text-app-muted">{status}</p>
      </Card>
      <Card>
        <p className="text-xs font-bold text-app-subtle">SKU Aktif</p>
        <p className="mt-1 text-2xl font-black tabular-nums text-app-text">{data?.services.active??'—'}</p>
        <p className="text-xs text-app-subtle">dari {data?.services.total??'—'} layanan</p>
      </Card>
      <Card>
        <p className="text-xs font-bold text-app-subtle">Sedang Diproses</p>
        <p className="mt-1 text-2xl font-black tabular-nums text-app-text">{data?.processing??'—'}</p>
        <p className="text-xs text-app-subtle">transaksi PPOB</p>
      </Card>
      <Card>
        <p className="text-xs font-bold text-app-subtle">Mode</p>
        <p className="mt-1 text-xl font-black text-app-text">{data?.testing?'Testing':'Production'}</p>
        <p className="text-xs text-app-subtle">DIGIFLAZZ_TESTING</p>
      </Card>
    </div>

    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Koneksi provider</CardTitle>
          <CardDescription>Tes request pricelist tanpa mengubah produk atau saldo.</CardDescription>
        </div>
        <Button onClick={check} loading={checking}>{checking?'Mengecek...':'🔌 Test Provider'}</Button>
      </div>
      {message&&<div className="mt-4 rounded-xl bg-app-inset p-3 text-sm font-bold text-app-text">{message}</div>}
    </Card>

    <Card>
      <CardTitle>Sinkronisasi terakhir</CardTitle>
      {loading?<div className="mt-4"><LoadingSkeleton rows={4} /></div>:!data?.lastSync?<EmptyState className="mt-4" title="Belum ada sinkronisasi." />:<div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-app-subtle">Status</p>
          <p className="mt-1"><Badge tone={statusTone(data.lastSync.status)}>{data.lastSync.status}</Badge></p>
        </div>
        <div>
          <p className="text-xs text-app-subtle">Pricelist</p>
          <p className="mt-1 font-black tabular-nums text-app-text">{data.lastSync.fetched}</p>
        </div>
        <div>
          <p className="text-xs text-app-subtle">Baru / Update</p>
          <p className="mt-1 font-black tabular-nums text-app-text">{data.lastSync.created_count} / {data.lastSync.updated_count}</p>
        </div>
        <div>
          <p className="text-xs text-app-subtle">Waktu mulai</p>
          <p className="mt-1 font-black text-sm text-app-text">{new Date(data.lastSync.started_at).toLocaleString('id-ID')}</p>
        </div>
      </div>}
    </Card>

    <div className="rounded-3xl border border-warning-500/30 bg-warning-500/10 p-5 text-sm leading-6 text-warning-800 dark:text-warning-300"><b>Catatan:</b> halaman ini tidak menampilkan API key. Credential provider tetap hanya berada di environment server.</div>
  </div>;
}
