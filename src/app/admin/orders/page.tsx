"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import { formatRupiah, formatDate } from "@/lib/utils";
import Badge, { statusLabel, statusTone } from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

const STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED", "REFUNDED"] as const;
type Order = { id: string; order_number: string; total_amount: number; status: string; created_at: string; payment_method: string; profiles: { full_name: string | null; email: string } | null };
type OrderItem = { id: string; product_name: string; quantity: number; subtotal: number; products: { product_type: string } | null };
type Submission = { target_text: string | null; target_file_path: string | null };

export default function AdminOrdersPage() {
  const supabase = createClient(); const toast = useToast();
  const [orders, setOrders] = useState<Order[]>([]); const [loading, setLoading] = useState(true); const [acting, setActing] = useState<string | null>(null); const [notes, setNotes] = useState<Record<string,string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, { items: OrderItem[]; submission: Submission | null; fileUrl?: string }>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  async function load() { setLoading(true); const { data, error } = await supabase.from("orders").select("id, order_number, total_amount, status, created_at, payment_method, profiles(full_name, email)").order("created_at", { ascending: false }).limit(100); if (error) toast.show(error.message, "error"); setOrders((data as Order[]) || []); setLoading(false); }
  useEffect(()=>{load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */},[]);
  async function updateStatus(id:string,status:string) { setActing(id); try { const res=await fetch(`/api/admin/orders/${id}/status`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,note:notes[id]||undefined})}); const json=await res.json(); if(!res.ok){toast.show(json.message||"Gagal mengubah status.","error");return;} toast.show(json.message,"success"); await load(); } catch { toast.show("Koneksi bermasalah.","error"); } finally {setActing(null);} }

  async function toggleDetail(orderId: string) {
    if (expanded === orderId) { setExpanded(null); return; }
    setExpanded(orderId);
    if (detail[orderId]) return;
    setDetailLoading(orderId);
    const [{ data: items }, { data: submission }] = await Promise.all([
      supabase.from("order_items").select("id, product_name, quantity, subtotal, products(product_type)").eq("order_id", orderId),
      supabase.from("order_submissions").select("target_text, target_file_path").eq("order_id", orderId).maybeSingle(),
    ]);
    let fileUrl: string | undefined;
    if (submission?.target_file_path) {
      const { data: signed } = await supabase.storage.from("order-submissions").createSignedUrl(submission.target_file_path, 300);
      fileUrl = signed?.signedUrl;
    }
    setDetail((v) => ({ ...v, [orderId]: { items: (items as OrderItem[]) || [], submission: (submission as Submission) || null, fileUrl } }));
    setDetailLoading(null);
  }

  return (
    <div className="animate-page-in space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Operasional</p>
          <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Kelola Pesanan</h1>
          <p className="mt-1 text-sm text-app-muted">Tandai pesanan selesai, gagal, dibatalkan, atau refund bila diperlukan.</p>
        </div>
        <Button variant="outline" onClick={load}>↻ Refresh</Button>
      </div>
      {loading ? <LoadingSkeleton rows={6} /> : orders.length === 0 ? <EmptyState icon="🧾" title="Belum ada order" /> : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Card key={o.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black text-app-text">{o.order_number}</p>
                    <Badge tone={o.payment_method === "QRIS" ? "gold" : "neutral"} className="px-2 py-0.5">{o.payment_method === "QRIS" ? "📱 QRIS" : "💰 Saldo"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-app-muted">{o.profiles?.full_name || o.profiles?.email || "Pengguna"} · {formatDate(o.created_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <b className="tabular-nums text-app-kicker">{formatRupiah(o.total_amount)}</b>
                  <Badge tone={statusTone(o.status)}>{statusLabel(o.status)}</Badge>
                </div>
              </div>
              <button onClick={() => toggleDetail(o.id)} className="mt-3 text-xs font-bold text-app-kicker hover:underline">{expanded === o.id ? "Sembunyikan detail ▲" : "Lihat detail pesanan ▼"}</button>
              {expanded === o.id && (
                <div className="mt-2 rounded-2xl bg-app-inset p-3 text-sm">
                  {detailLoading === o.id ? <p className="text-app-muted">Memuat detail...</p> : (
                    <>
                      {detail[o.id]?.items.map((it) => (
                        <div key={it.id} className="flex items-center justify-between border-b border-app-border py-2 last:border-0">
                          <span className="text-app-text">{it.product_name} {it.products?.product_type === "jasa" && <Badge tone="warning" className="ml-1 px-2 py-0.5">JASA</Badge>} × {it.quantity}</span>
                          <span className="font-bold tabular-nums text-app-text">{formatRupiah(it.subtotal)}</span>
                        </div>
                      ))}
                      {detail[o.id]?.submission && (detail[o.id]?.submission?.target_text || detail[o.id]?.submission?.target_file_path) && (
                        <div className="mt-3 rounded-xl border border-warning-500/30 bg-warning-500/10 p-3">
                          <p className="text-xs font-bold text-warning-800 dark:text-warning-300">🎯 Target dari pelanggan:</p>
                          {detail[o.id]?.submission?.target_text && <p className="mt-1 text-sm text-app-text">{detail[o.id]?.submission?.target_text}</p>}
                          {detail[o.id]?.fileUrl && <a href={detail[o.id]?.fileUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-bold text-app-kicker underline">📎 Buka file yang dikirim pelanggan</a>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                <Input value={notes[o.id] || ""} onChange={(e) => setNotes((v) => ({ ...v, [o.id]: e.target.value }))} placeholder="Catatan admin (opsional)" className="bg-app-inset" />
                <Select value={o.status} disabled={acting === o.id} onChange={(e) => updateStatus(o.id, e.target.value)} className="bg-app-inset md:w-56">{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
              </div>
              {o.status !== "REFUNDED" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => updateStatus(o.id, "COMPLETED")} loading={acting === o.id}>✓ Tandai Selesai</Button>
                  {o.status !== "FAILED" && <Button size="sm" variant="destructive" onClick={() => updateStatus(o.id, "FAILED")}>Gagal</Button>}
                  {o.status !== "CANCELLED" && <Button size="sm" variant="outline" onClick={() => updateStatus(o.id, "CANCELLED")}>Batalkan</Button>}
                  {o.status !== "COMPLETED" && <Button size="sm" variant="outline" onClick={() => updateStatus(o.id, "REFUNDED")}>Refund</Button>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
