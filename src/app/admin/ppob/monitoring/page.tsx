"use client";
import { useEffect, useState } from "react";
import { formatRupiah } from "@/lib/utils";
import Button from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import Badge, { statusTone } from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import Icon from "@/components/icons/Icon";

type Tx={id:string;order_id:string;order_number:string;customer_no:string;product_name:string;status:string;provider_status:string|null;response_code:string|null;serial_number:string|null;provider_message:string|null;attempt_count:number;created_at:string;next_retry_at:string|null};
export default function Monitoring(){const [rows,setRows]=useState<Tx[]>([]);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState<string|null>(null);const [filter,setFilter]=useState('ALL');
 async function load(){setLoading(true);const r=await fetch('/api/admin/ppob/monitoring',{cache:'no-store'});if(r.ok){const d=await r.json();setRows(d.transactions||[]);}setLoading(false)} useEffect(()=>{load();const t=window.setInterval(load,20000);return()=>window.clearInterval(t)},[]);
 async function retry(id:string){setBusy(id);const r=await fetch(`/api/admin/ppob/retry/${id}`,{method:'POST'});const d=await r.json();if(!r.ok)alert(d.message||'Retry gagal');await load();setBusy(null)}
 const shown=filter==='ALL'?rows:rows.filter(x=>x.status===filter); const counts=Object.fromEntries(['PROCESSING','SUCCESS','FAILED'].map(s=>[s,rows.filter(x=>x.status===s).length]));
 return <div className="space-y-5">
    <div>
      <p className="text-xs font-black uppercase tracking-widest text-app-kicker">PPOB MONITORING</p>
      <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Monitoring Transaksi</h1>
      <p className="mt-1 text-sm text-app-muted">Pantau status provider, percobaan retry, dan SN/token dari satu halaman.</p>
    </div>

    <div className="grid grid-cols-3 gap-3">
      {[['PROCESSING','refresh','Diproses'],['SUCCESS','check_circle','Berhasil'],['FAILED','close_circle','Gagal']].map(([s,ic,l])=><button key={s} onClick={()=>setFilter(filter===s?'ALL':s)} className={`rounded-3xl border p-4 text-left shadow-sm transition ${filter===s?'border-gold-400 bg-app-accent-soft':'border-app-border bg-app-surface'}`}><p className="flex items-center gap-1.5 text-xs font-bold text-app-subtle"><Icon name={ic} size={12} />{l}</p><p className="mt-1 text-2xl font-black tabular-nums text-app-text">{counts[s]||0}</p></button>)}
    </div>

    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border p-5">
        <CardTitle>Transaksi PPOB {filter!=='ALL'&&`• ${filter}`}</CardTitle>
        <Button size="sm" variant="outline" onClick={load}><Icon name="refresh" size={16} />Refresh</Button>
      </div>
      {loading?<div className="p-5"><LoadingSkeleton rows={5} /></div>:shown.length===0?<EmptyState icon="receipt" title="Tidak ada transaksi." className="m-4" />:<div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead><tr className="border-b border-app-border text-left text-xs font-bold uppercase tracking-widest text-app-subtle"><th className="px-4 py-3">Order</th><th className="px-4 py-3">Produk</th><th className="px-4 py-3">Tujuan</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Percobaan</th><th className="px-4 py-3 text-right">Aksi</th></tr></thead>
          <tbody>{shown.map(x=><tr key={x.id} className="border-b border-app-border last:border-0">
            <td className="px-4 py-3"><b className="text-app-text">{x.order_number}</b><p className="text-xs tabular-nums text-app-subtle">{new Date(x.created_at).toLocaleString('id-ID')}</p></td>
            <td className="px-4 py-3 text-app-text">{x.product_name}</td>
            <td className="px-4 py-3 text-app-muted">{x.customer_no}</td>
            <td className="px-4 py-3"><Badge tone={statusTone(x.status)} className="px-2 py-0.5">{x.status}</Badge>{x.response_code&&<p className="mt-1 text-xs text-app-subtle">RC {x.response_code}</p>}</td>
            <td className="px-4 py-3 text-app-text">{x.provider_status||'-'}{x.provider_message&&<p className="max-w-[220px] truncate text-xs text-app-subtle">{x.provider_message}</p>}</td>
            <td className="px-4 py-3 tabular-nums text-app-text">{x.attempt_count||0}/3</td>
            <td className="px-4 py-3 text-right">{(x.status==='PROCESSING'||x.status==='FAILED')?<Button size="sm" disabled={busy===x.id} onClick={()=>retry(x.id)}>{busy===x.id?'Memproses...':'Retry'}</Button>:x.serial_number?<span className="font-mono text-xs font-bold">{x.serial_number}</span>:<span className="text-app-subtle">—</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </Card>
  </div>}
