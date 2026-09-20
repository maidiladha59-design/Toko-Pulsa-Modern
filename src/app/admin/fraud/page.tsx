'use client';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/ToastProvider';

export default function FraudPage() {
  const toast = useToast();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    const r = await fetch('/api/admin/fraud');
    const j = await r.json();
    if (!r.ok) toast.show(j.message || 'Gagal memuat Risk Center.', 'error');
    setProfiles(j.profiles || []); setEvents(j.events || []); setLoading(false);
  }
  useEffect(() => { load(); }, []);
  async function setStatus(user_id: string, status: string) {
    const reason = status === 'NORMAL' ? 'Review selesai.' : `Status diubah admin menjadi ${status}.`;
    const r = await fetch('/api/admin/fraud', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id, status, reason }) });
    const j = await r.json();
    if (!r.ok) { toast.show(j.message || 'Gagal mengubah status.', 'error'); return; }
    toast.show('Status risk diperbarui.', 'success'); load();
  }
  return <div className="space-y-5">
    <div><p className="section-kicker">Keamanan transaksi</p><h1 className="text-2xl font-black">Fraud & Risk Center</h1><p className="mt-1 text-sm text-slate-500">Pantau pola transaksi tidak biasa. Sistem tidak otomatis memblokir hanya karena satu sinyal.</p></div>
    <div className="grid gap-3 sm:grid-cols-4">
      {['NORMAL','REVIEW','HIGH_RISK','BLOCKED'].map(s => <div key={s} className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold text-slate-400">{s}</p><p className="mt-1 text-2xl font-black">{profiles.filter(x => x.status === s).length}</p></div>)}
    </div>
    <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-left text-xs text-slate-400"><th className="p-4">User</th><th className="p-4">Risk score</th><th className="p-4">Status</th><th className="p-4">Alasan</th><th className="p-4">Tindakan</th></tr></thead><tbody>{loading ? <tr><td className="p-4" colSpan={5}>Memuat...</td></tr> : profiles.map(x => <tr key={x.user_id} className="border-b"><td className="p-4 font-mono text-xs">{x.user_id}</td><td className="p-4 font-black">{x.risk_score}/100</td><td className="p-4 font-bold">{x.status}</td><td className="p-4 text-xs text-slate-500">{x.review_reason || '-'}</td><td className="p-4"><div className="flex flex-wrap gap-2"><button onClick={() => setStatus(x.user_id,'NORMAL')} className="rounded-lg border px-3 py-1.5 text-xs font-bold">Clear</button><button onClick={() => setStatus(x.user_id,'REVIEW')} className="rounded-lg border px-3 py-1.5 text-xs font-bold">Review</button><button onClick={() => setStatus(x.user_id,'BLOCKED')} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600">Block</button></div></td></tr>)}</tbody></table></div>
    <div className="overflow-x-auto rounded-2xl border bg-white"><div className="border-b p-4"><h2 className="font-black">Risk Events Terbaru</h2></div><table className="w-full min-w-[800px] text-sm"><thead><tr className="border-b text-left text-xs text-slate-400"><th className="p-4">Waktu</th><th className="p-4">User</th><th className="p-4">Event</th><th className="p-4">Poin</th><th className="p-4">Alasan</th></tr></thead><tbody>{events.map(x => <tr key={x.id} className="border-b"><td className="p-4 whitespace-nowrap">{new Date(x.created_at).toLocaleString('id-ID')}</td><td className="p-4 font-mono text-xs">{x.user_id || 'anonymous'}</td><td className="p-4 font-semibold">{x.event_type}</td><td className="p-4 font-black">+{x.risk_points}</td><td className="p-4 text-xs text-slate-500">{x.reason}</td></tr>)}</tbody></table></div>
  </div>;
}
