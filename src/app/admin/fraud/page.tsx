'use client';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/ToastProvider';
import Button from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';

const riskTone = (status: string): BadgeTone =>
  status === 'NORMAL' ? 'success' : status === 'REVIEW' ? 'warning' : status === 'BLOCKED' ? 'neutral' : 'danger';

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
    <div><p className="text-xs font-black uppercase tracking-widest text-app-kicker">Keamanan transaksi</p><h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Fraud & Risk Center</h1><p className="mt-1 text-sm text-app-muted">Pantau pola transaksi tidak biasa. Sistem tidak otomatis memblokir hanya karena satu sinyal.</p></div>
    <div className="grid gap-3 sm:grid-cols-4">
      {['NORMAL','REVIEW','HIGH_RISK','BLOCKED'].map(s => <Card key={s}><p className="text-xs font-bold uppercase tracking-widest text-app-subtle">{s}</p><p className="mt-1 text-2xl font-black tabular-nums text-app-text">{profiles.filter(x => x.status === s).length}</p></Card>)}
    </div>
    <Card className="p-0">{loading ? <div className="p-5"><LoadingSkeleton rows={5} /></div> : !profiles.length ? <EmptyState icon="🛡️" title="Belum ada profil risiko" description="Pengguna akan muncul di sini setelah sistem mengumpulkan sinyal transaksi." className="m-4" /> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-app-border text-left text-xs font-bold uppercase tracking-widest text-app-subtle"><th className="px-4 py-3">User</th><th className="px-4 py-3">Risk score</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Alasan</th><th className="px-4 py-3">Tindakan</th></tr></thead><tbody>{profiles.map(x => <tr key={x.user_id} className="border-b border-app-border last:border-0"><td className="px-4 py-3 font-mono text-xs text-app-muted">{x.user_id}</td><td className="px-4 py-3 font-black tabular-nums text-app-text">{x.risk_score}/100</td><td className="px-4 py-3"><Badge tone={riskTone(x.status)}>{x.status}</Badge></td><td className="px-4 py-3 text-xs text-app-muted">{x.review_reason || '-'}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setStatus(x.user_id,'NORMAL')}>Clear</Button><Button size="sm" variant="outline" onClick={() => setStatus(x.user_id,'REVIEW')}>Review</Button><Button size="sm" variant="destructive" onClick={() => setStatus(x.user_id,'BLOCKED')}>Block</Button></div></td></tr>)}</tbody></table></div>}</Card>
    <Card className="p-0"><div className="border-b border-app-border p-5"><CardTitle>Risk Events Terbaru</CardTitle></div>{loading ? <div className="p-5"><LoadingSkeleton rows={5} /></div> : !events.length ? <EmptyState icon="📟" title="Belum ada risk event" description="Sinyal risiko terbaru akan tercatat di sini." className="m-4" /> : <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead><tr className="border-b border-app-border text-left text-xs font-bold uppercase tracking-widest text-app-subtle"><th className="px-4 py-3">Waktu</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Poin</th><th className="px-4 py-3">Alasan</th></tr></thead><tbody>{events.map(x => <tr key={x.id} className="border-b border-app-border last:border-0"><td className="px-4 py-3 whitespace-nowrap tabular-nums text-app-text">{new Date(x.created_at).toLocaleString('id-ID')}</td><td className="px-4 py-3 font-mono text-xs text-app-muted">{x.user_id || 'anonymous'}</td><td className="px-4 py-3 font-bold text-app-text">{x.event_type}</td><td className="px-4 py-3 font-black tabular-nums text-app-kicker">+{x.risk_points}</td><td className="px-4 py-3 text-xs text-app-muted">{x.reason}</td></tr>)}</tbody></table></div>}</Card>
  </div>;
}
