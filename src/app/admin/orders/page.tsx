"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import { formatRupiah, formatDate } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import Button from "@/components/Button";

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

  return <div className="animate-page-in"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.18em] text-gold-600">Operasional</p><h1 className="mt-1 text-2xl font-black text-slate-900">Kelola Pesanan</h1><p className="mt-1 text-sm text-slate-500">Tandai pesanan selesai, gagal, dibatalkan, atau refund bila diperlukan.</p></div><button onClick={load} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold shadow-sm">↻ Refresh</button></div>{loading?<div className="animate-pulse rounded-2xl bg-white p-6 text-sm text-slate-500">Memuat pesanan...</div>:orders.length===0?<EmptyState title="Belum ada order"/>:<div className="space-y-3">{orders.map(o=><div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><p className="font-black text-slate-900">{o.order_number}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${o.payment_method === "QRIS" ? "bg-gold-100 text-gold-700" : "bg-slate-100 text-slate-600"}`}>{o.payment_method === "QRIS" ? "📱 QRIS" : "💰 Saldo"}</span></div><p className="text-xs text-slate-500">{o.profiles?.full_name||o.profiles?.email||"Pengguna"} · {formatDate(o.created_at)}</p></div><div className="flex items-center gap-3"><b className="text-gold-600">{formatRupiah(o.total_amount)}</b><StatusBadge status={o.status}/></div></div><button onClick={()=>toggleDetail(o.id)} className="mt-2 text-xs font-bold text-gold-600 hover:underline">{expanded===o.id?"Sembunyikan detail ▲":"Lihat detail pesanan ▼"}</button>{expanded===o.id&&<div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm">{detailLoading===o.id?<p className="text-slate-500">Memuat detail...</p>:<>{detail[o.id]?.items.map(it=><div key={it.id} className="flex items-center justify-between border-b border-slate-200 py-1.5 last:border-0"><span>{it.product_name} {it.products?.product_type==="jasa"&&<span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">JASA</span>} × {it.quantity}</span><span className="font-semibold">{formatRupiah(it.subtotal)}</span></div>)}{detail[o.id]?.submission&&(detail[o.id]?.submission?.target_text||detail[o.id]?.submission?.target_file_path)&&<div className="mt-2 rounded-lg bg-amber-50 p-3"><p className="text-xs font-bold text-amber-800">🎯 Target dari pelanggan:</p>{detail[o.id]?.submission?.target_text&&<p className="mt-1 text-sm text-amber-900">{detail[o.id]?.submission?.target_text}</p>}{detail[o.id]?.fileUrl&&<a href={detail[o.id]?.fileUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-bold text-gold-600 underline">📎 Buka file yang dikirim pelanggan</a>}</div>}</>}</div>}<div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]"><input value={notes[o.id]||""} onChange={e=>setNotes(v=>({...v,[o.id]:e.target.value}))} placeholder="Catatan admin (opsional)" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-gold-500"/><select value={o.status} disabled={acting===o.id} onChange={e=>updateStatus(o.id,e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-gold-500">{STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>{o.status!=="REFUNDED"&&<div className="mt-2 flex flex-wrap gap-2"><Button onClick={()=>updateStatus(o.id,"COMPLETED")} loading={acting===o.id}>✓ Tandai Selesai</Button>{o.status!=="FAILED"&&<button onClick={()=>updateStatus(o.id,"FAILED")} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-bold text-red-600">Gagal</button>}{o.status!=="CANCELLED"&&<button onClick={()=>updateStatus(o.id,"CANCELLED")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600">Batalkan</button>}{o.status!=="COMPLETED"&&<button onClick={()=>updateStatus(o.id,"REFUNDED")} className="rounded-xl border border-amber-200 px-3 py-2 text-sm font-bold text-amber-700">Refund</button>}</div>}</div>)}</div>}</div>;
}
