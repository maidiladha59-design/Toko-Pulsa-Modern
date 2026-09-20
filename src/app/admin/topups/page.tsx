"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/Button";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { formatRupiah, formatDate } from "@/lib/utils";

type FeeConfig = { enabled: boolean; fee_type: "FIXED" | "PERCENTAGE"; fee_value: number; min_topup: number; max_topup: number; deadline_minutes: number; updated_at?: string };
type Topup = { id: string; user_id: string; amount: number; admin_fee?: number; payment_amount?: number; status: string; provider?: string | null; payment_method?: string | null; gateway_fee?: number | null; gateway_total_payment?: number | null; proof_url: string | null; created_at: string; profiles: { full_name: string | null; email: string } | null };

export default function AdminTopupsPage() {
  const supabase = createClient();
  const toast = useToast();
  const [topups, setTopups] = useState<Topup[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({});
  const [fee, setFee] = useState<FeeConfig>({ enabled: true, fee_type: "FIXED", fee_value: 0, min_topup: 10000, max_topup: 10000000, deadline_minutes: 10 });
  const [savingFee, setSavingFee] = useState(false);

  async function loadFee() {
    const res = await fetch("/api/admin/topup-fee");
    if (res.ok) setFee(await res.json());
  }
  async function saveFee() {
    setSavingFee(true);
    try {
      const res = await fetch("/api/admin/topup-fee", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fee) });
      const json = await res.json();
      if (!res.ok) { toast.show(json.message || "Gagal menyimpan biaya Top Up.", "error"); return; }
      setFee(json); toast.show("Pengaturan biaya Top Up berhasil disimpan.", "success");
    } catch { toast.show("Koneksi bermasalah.", "error"); }
    finally { setSavingFee(false); }
  }

  async function load() {
    setLoading(true);
    const { data: rawTopups, error } = await supabase.from("topups").select("id, user_id, amount, admin_fee, payment_amount, status, provider, payment_method, gateway_fee, gateway_total_payment, proof_url, created_at").order("created_at", { ascending: false });
    if (error) { toast.show(`Gagal memuat Top Up: ${error.message}`, "error"); setTopups([]); setLoading(false); return; }
    const rows = rawTopups ?? [];
    const userIds = [...new Set(rows.map((t) => t.user_id))];
    const profileMap = new Map<string, { full_name: string | null; email: string }>();
    if (userIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
      for (const profile of profiles ?? []) profileMap.set(profile.id, { full_name: profile.full_name, email: profile.email });
    }
    setTopups(rows.map((t) => ({ ...t, profiles: profileMap.get(t.user_id) ?? null })) as Topup[]);
    const urls: Record<string, string> = {};
    for (const t of rows) if (t.proof_url) { const { data: signed } = await supabase.storage.from("topup-proofs").createSignedUrl(t.proof_url, 300); if (signed) urls[t.id] = signed.signedUrl; }
    setProofUrls(urls); setLoading(false);
  }
  useEffect(() => { load(); loadFee(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function handleApprove(id: string) {
    setActingId(id); try { const res = await fetch(`/api/topup/${id}/approve`, { method: "POST" }); const json = await res.json(); if (!res.ok) { toast.show(json.message || "Gagal menyetujui Top Up.", "error"); return; } toast.show("Top Up berhasil disetujui.", "success"); await load(); } catch { toast.show("Koneksi bermasalah.", "error"); } finally { setActingId(null); }
  }
  async function handleReject(id: string) {
    if (reason.trim().length < 3) { toast.show("Alasan penolakan wajib diisi.", "error"); return; }
    setActingId(id); try { const res = await fetch(`/api/topup/${id}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) }); const json = await res.json(); if (!res.ok) { toast.show(json.message || "Gagal menolak Top Up.", "error"); return; } toast.show("Top Up berhasil ditolak.", "success"); setRejectingId(null); setReason(""); await load(); } catch { toast.show("Koneksi bermasalah.", "error"); } finally { setActingId(null); }
  }

  return (
    <div className="animate-page-in">
      <div className="mb-5"><p className="text-xs font-black uppercase tracking-[.18em] text-gold-600">Keuangan</p><h1 className="mt-1 text-2xl font-black text-slate-900">Top Up & Biaya Admin</h1><p className="mt-1 text-sm text-slate-500">Atur biaya Top Up otomatis dan pantau seluruh transaksi wallet.</p></div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-slate-900">Biaya Top Up</h2><p className="text-xs text-slate-500">Biaya ini ditambahkan ke nominal pembayaran; saldo pengguna tetap menerima nominal Top Up.</p></div><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={fee.enabled} onChange={(e) => setFee({ ...fee, enabled: e.target.checked })} /> Aktif</label></div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="text-sm font-bold text-slate-700">Tipe<select value={fee.fee_type} onChange={(e) => setFee({ ...fee, fee_type: e.target.value as FeeConfig["fee_type"] })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"><option value="FIXED">Nominal tetap</option><option value="PERCENTAGE">Persentase</option></select></label>
          <label className="text-sm font-bold text-slate-700">Nilai {fee.fee_type === "PERCENTAGE" ? "(%)" : "(Rp)"}<input type="number" min="0" step={fee.fee_type === "PERCENTAGE" ? "0.01" : "100"} value={fee.fee_value} onChange={(e) => setFee({ ...fee, fee_value: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" /></label>
          <label className="text-sm font-bold text-slate-700">Minimal Top Up<input type="number" min="1000" value={fee.min_topup} onChange={(e) => setFee({ ...fee, min_topup: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" /></label>
          <label className="text-sm font-bold text-slate-700">Maksimal Top Up<input type="number" min="1000" value={fee.max_topup} onChange={(e) => setFee({ ...fee, max_topup: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" /></label>
          <label className="text-sm font-bold text-slate-700">Batas pembayaran (menit)<input type="number" min="5" max="1440" value={fee.deadline_minutes} onChange={(e) => setFee({ ...fee, deadline_minutes: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" /><span className="mt-1 block text-[11px] font-normal text-slate-500">Default AIDIL STORE: 10 menit. QRIS/VA tetap mengikuti batas gateway jika lebih singkat.</span></label>
        </div>
        <Button className="mt-4" onClick={saveFee} loading={savingFee}>Simpan Pengaturan</Button><a href="/admin/platform" className="ml-2 inline-flex rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">⚙️ Biaya QRIS / Bank / Bank Digital</a>
      </section>

      <div className="mt-6 flex items-end justify-between gap-3"><div><h2 className="text-xl font-black text-slate-900">Riwayat Top Up</h2><p className="text-sm text-slate-500">Top Up Pakasir yang sudah lunas masuk otomatis tanpa approve manual.</p></div><button onClick={load} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm">↻ Refresh</button></div>
      {loading ? <div className="mt-4 animate-pulse rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Memuat data Top Up...</div> : topups.length === 0 ? <div className="mt-4"><EmptyState title="Belum ada transaksi Top Up" description="Transaksi baru akan muncul di sini." /></div> : <div className="mt-4 space-y-3">{topups.map((t) => { const automatic = t.provider === "pakasir"; return <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-slate-800">{t.profiles?.full_name || t.profiles?.email || "Pengguna"}</p><p className="text-xs text-slate-500">{t.profiles?.email || ""} · {formatDate(t.created_at)}</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase text-slate-600">{automatic ? "PAKASIR OTOMATIS" : "MANUAL"}</span><StatusBadge status={t.status} /></div></div><div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-4"><div><p className="text-xs text-slate-400">Saldo masuk</p><p className="font-black">{formatRupiah(t.amount)}</p></div><div><p className="text-xs text-slate-400">Biaya AIDIL STORE</p><p className="font-black">{formatRupiah(t.admin_fee ?? 0)}</p></div><div><p className="text-xs text-slate-400">Biaya gateway</p><p className="font-black">{formatRupiah(t.gateway_fee ?? 0)}</p></div><div><p className="text-xs text-slate-400">Total dibayar</p><p className="font-black text-gold-600">{formatRupiah(t.gateway_total_payment ?? t.payment_amount ?? t.amount)}</p></div></div>{proofUrls[t.id] && <a href={proofUrls[t.id]} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-bold text-gold-600">Lihat bukti pembayaran →</a>}{!automatic && (t.status === "PENDING" || t.status === "VERIFYING") && <div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => handleApprove(t.id)} loading={actingId === t.id}>✓ Approve</Button><Button variant="danger" onClick={() => setRejectingId(rejectingId === t.id ? null : t.id)}>✕ Reject</Button></div>}{!automatic && rejectingId === t.id && <div className="mt-3 flex gap-2 rounded-xl border border-red-100 bg-red-50 p-3"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan penolakan..." className="min-w-0 flex-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm" /><Button variant="danger" onClick={() => handleReject(t.id)} loading={actingId === t.id}>Kirim</Button></div>}</div>})}</div>}
    </div>
  );
}
