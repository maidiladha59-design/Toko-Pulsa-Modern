'use client';
import {useEffect,useState} from 'react';
import Button from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/icons/Icon';

export default function MonitoringPage(){
 const [d,setD]=useState<any>({alerts:[],runs:[],summary:{open:0,critical:0,warning:0}}); const [busy,setBusy]=useState(false); const [msg,setMsg]=useState('');
 async function load(){const r=await fetch('/api/admin/monitoring',{cache:'no-store'});if(r.ok)setD(await r.json());}
 async function run(){setBusy(true);setMsg('');try{const r=await fetch('/api/admin/monitoring',{method:'POST'});const j=await r.json();setMsg(r.ok?`Pemeriksaan selesai • ${j.alerts_opened} alert diperbarui.`:(j.message||'Gagal'));await load()}finally{setBusy(false)}}
 async function resolve(id:string){const r=await fetch(`/api/admin/monitoring/${id}`,{method:'PATCH'});if(r.ok)load()}
 useEffect(()=>{load();const t=setInterval(load,30000);return()=>clearInterval(t)},[]);
 const stats = [["Open Alert", d.summary.open], ["Critical", d.summary.critical], ["Warning", d.summary.warning]];
 return <div className="space-y-5">
  <div className="rounded-3xl bg-gradient-to-r from-zinc-900 via-gold-700 to-black p-6 text-white shadow-lg shadow-gold-500/15"><p className="text-xs font-black uppercase tracking-widest text-gold-100">Operations Center</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">Monitoring &amp; Notification Center</h1><p className="mt-1 text-sm text-gold-100">Pantau mismatch pembayaran, refund tertunda, webhook error, transaksi PPOB yang terlalu lama, dan sinkronisasi provider.</p></div>
  <div className="grid gap-3 sm:grid-cols-3">{stats.map(([label, value]) => <Card key={label}><p className="text-xs font-bold text-app-muted">{label}</p><p className="mt-1 text-2xl font-black tabular-nums text-app-text">{value}</p></Card>)}</div>
  <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Pemeriksaan sistem</CardTitle><CardDescription>Jalankan pengecekan database secara manual. Cron dapat memanggil endpoint ini secara berkala.</CardDescription></div><Button onClick={run} disabled={busy}>{busy?'Memeriksa...':<><Icon name="search" size={16} />Jalankan Monitoring</>}</Button></div>{msg&&<p className="mt-3 rounded-xl bg-app-inset p-3 text-sm font-bold text-app-text">{msg}</p>}</Card>
  <Card className="p-0">{d.alerts.length===0?<EmptyState icon="bell" title="Belum ada alert" description="Semua pemeriksaan sistem berjalan normal." className="m-4" />:<div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr className="border-b border-app-border text-left text-xs font-bold uppercase tracking-widest text-app-subtle"><th className="px-4 py-3">Severity</th><th className="px-4 py-3">Kategori</th><th className="px-4 py-3">Alert</th><th className="px-4 py-3">Terakhir</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Aksi</th></tr></thead><tbody>{d.alerts.map((x:any)=><tr key={x.id} className="border-b border-app-border last:border-0"><td className="px-4 py-3"><Badge tone={x.severity==='CRITICAL'?'danger':x.severity==='WARNING'?'warning':'neutral'} className="uppercase">{x.severity}</Badge></td><td className="px-4 py-3 text-app-text">{x.category}</td><td className="px-4 py-3"><p className="font-black text-app-text">{x.title}</p><p className="mt-0.5 text-xs text-app-muted">{x.message}</p></td><td className="px-4 py-3 whitespace-nowrap tabular-nums text-xs text-app-muted">{new Date(x.last_seen_at).toLocaleString('id-ID')}</td><td className="px-4 py-3"><Badge tone={x.status==='RESOLVED'?'success':'warning'}>{x.status}</Badge></td><td className="px-4 py-3 text-right">{x.status!=='RESOLVED'&&<Button size="sm" variant="outline" onClick={()=>resolve(x.id)}>Resolve</Button>}</td></tr>)}</tbody></table></div>}</Card>
 </div>
}
