import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatRupiah, formatDate } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";
import DownloadButton from "@/components/DownloadButton";
import GatewayPayment from "@/components/GatewayPayment";
import PPOBReceiptButton from "@/components/PPOBReceiptButton";
import PPOBStatusPoller from "@/components/PPOBStatusPoller";
import { renderQrImage } from "@/lib/qr-image";

const ORDER_MESSAGE: Record<string, string> = {
  PENDING: "Pesanan Anda sedang menunggu pembayaran.",
  PROCESSING: "Pembayaran sudah terdeteksi. Pesanan sedang diproses.",
  COMPLETED: "Pembayaran berhasil dan produk siap diambil.",
  FAILED: "Pesanan gagal diproses.",
  CANCELLED: "Pesanan telah dibatalkan.",
  REFUNDED: "Dana telah dikembalikan ke saldo Anda.",
};

const bankNames: Record<string, string> = {
  bca_va: "BCA Virtual Account",
  bri_va: "BRI Virtual Account", bni_va: "BNI Virtual Account",
  cimb_niaga_va: "CIMB Niaga Virtual Account", sampoerna_va: "Sampoerna Virtual Account",
  bnc_va: "BNC Virtual Account", maybank_va: "Maybank Virtual Account",
  permata_va: "Permata Virtual Account", atm_bersama_va: "ATM Bersama Virtual Account",
  artha_graha_va: "Artha Graha Virtual Account",
};

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: order } = await supabase.from("orders")
    .select("id, order_number, total_amount, status, created_at, user_id, payment_method, gateway_method, gateway_txn_id, payment_number, qris_payload, qris_expired_at, gateway_fee, gateway_total_payment")
    .eq("id", params.id).single();

  if (!order || order.user_id !== user.id) notFound();

  const { data: items } = await supabase.from("order_items")
    .select("id, product_id, product_name, unit_price, quantity, subtotal, products(product_type)")
    .eq("order_id", order.id);

  const { data: ppobTransactions } = await supabase.from("ppob_transactions")
    .select("id, order_item_id, customer_no, status, response_code, serial_number, provider_message, completed_at")
    .eq("order_id", order.id);

  const { data: ppobTargets } = await supabase.from("ppob_order_targets")
    .select("order_item_id, customer_no, target_data")
    .in("order_item_id", (items || []).map((item) => item.id));

  // cost_price (modal) hanya bisa dibaca lewat service role, bukan lewat client
  // yang tunduk RLS/hak akses kolom milik user biasa — lihat migrations_v70.
  const ppobProductIds = (items || []).map((item) => item.product_id).filter(Boolean) as string[];
  const { data: ppobServices } = ppobProductIds.length
    ? await createAdminClient().from("ppob_services").select("product_id, cost_price").in("product_id", ppobProductIds)
    : { data: [] };

  const ppobTxMap = new Map((ppobTransactions || []).map((tx) => [tx.order_item_id, tx]));
  const ppobTargetMap = new Map((ppobTargets || []).map((target) => [target.order_item_id, target]));
  const ppobCostMap = new Map((ppobServices || []).map((svc) => [svc.product_id, Number(svc.cost_price || 0)]));

  const { data: submission } = await supabase.from("order_submissions")
    .select("target_text, target_file_path, created_at")
    .eq("order_id", order.id).maybeSingle();

  const showGateway = ["QRIS", "BANK_VA"].includes(order.payment_method) &&
    order.status === "PENDING" && order.payment_number && order.qris_expired_at &&
    new Date(order.qris_expired_at).getTime() > Date.now();

  const qrisImage = showGateway && order.payment_method === "QRIS" && order.qris_payload
    ? await renderQrImage(order.qris_payload as string, 360)
    : null;

  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px] animate-page-in lg:max-w-4xl">
        <div className="mb-6 flex items-center gap-3">
          <img src="/aidil-logo.png" alt="Aidil Store" className="h-12 w-12 rounded-2xl object-cover shadow-lg" />
          <div><p className="text-xs font-black uppercase tracking-[.2em] text-app-kicker">AIDIL STORE</p><h1 className="text-2xl font-black text-app-text">Pesanan {order.order_number}</h1><p className="text-sm text-app-muted">{formatDate(order.created_at)}</p></div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-app-border bg-app-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><StatusBadge status={order.status} /><p className="text-sm font-medium text-app-muted">{ORDER_MESSAGE[order.status]}</p></div>
            </div>

            {showGateway && (
              <GatewayPayment
                orderId={order.id}
                paymentMethod={order.payment_method as "QRIS" | "BANK_VA"}
                gatewayMethod={order.gateway_method || "qris"}
                paymentNumber={order.payment_number as string}
                qrisImage={qrisImage}
                amount={Number(order.gateway_total_payment || order.total_amount)}
                expiredAt={order.qris_expired_at as string}
              />
            )}

            {ppobTransactions && ppobTransactions.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-400/25 bg-app-accent-soft p-4 text-app-kicker">
                <div><p className="font-black text-app-text">🧾 Struk Transaksi</p><p className="mt-1 text-xs text-app-kicker/80">Nomor tujuan, status, dan kode SN tersedia di struk.</p></div>
                <div><PPOBReceiptButton orderId={order.id} />{ppobTransactions.some((tx) => ["WAITING", "PROCESSING"].includes(tx.status)) && <PPOBStatusPoller active />}</div>
              </div>
            )}

            <div className="space-y-3">
              {items?.map((item) => (
                <div key={item.id} className="rounded-2xl border border-app-border bg-app-surface p-5">
                  <div className="flex justify-between gap-4"><p className="font-black text-app-text">{item.product_name}</p><p className="font-bold tabular-nums text-app-text">{formatRupiah(item.subtotal)}</p></div>
                  <p className="mt-1 text-sm tabular-nums text-app-subtle">{item.quantity} × {formatRupiah(item.unit_price)}</p>

                  {order.status === "COMPLETED" && (item.products as any)?.product_type === "digital" && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-500/10 p-4 text-emerald-600 dark:text-emerald-400">
                      <div><p className="font-black">✓ Produk siap diambil</p><p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Link download dibuat aman dan sementara.</p></div>
                      <DownloadButton productId={item.product_id} />
                    </div>
                  )}

                  {ppobTxMap.has(item.id) && (() => {
                    const tx = ppobTxMap.get(item.id);
                    const target = ppobTargetMap.get(item.id);
                    const cost = item.product_id ? ppobCostMap.get(item.product_id) : undefined;
                    const hargaJual = Number(item.subtotal);
                    const untung = cost !== undefined ? Math.max(0, hargaJual - cost * item.quantity) : null;
                    return (
                      <div className="mt-4 rounded-2xl border border-gold-400/25 bg-app-accent-soft p-4 text-app-kicker">
                        <div className="flex items-center justify-between gap-3"><p className="font-black text-app-text">⚡ Rincian Transaksi</p></div>
                        <div className="mt-3 space-y-1.5 text-sm">
                          <div className="flex justify-between gap-3"><span className="text-app-muted">Nomor Pelanggan</span><b className="text-app-text">{target?.customer_no || tx?.customer_no || "-"}</b></div>
                          <div className="flex justify-between gap-3"><span className="text-app-muted">Status</span><b className="text-app-text">{tx?.status}</b></div>
                          <div className="flex justify-between gap-3"><span className="text-app-muted">Harga Jual</span><b className="tabular-nums text-app-text">{formatRupiah(hargaJual)}</b></div>

                        </div>
                        {tx?.serial_number && <div className="mt-3 rounded-xl bg-app-inset p-3"><p className="text-[10px] font-black uppercase tracking-wider text-app-subtle">SN/Ref</p><p className="mt-1 break-all font-black text-app-kicker">{tx.serial_number}</p></div>}
                        {tx?.provider_message && tx.status !== "SUCCESS" && <p className="mt-2 text-xs text-app-muted">{tx.provider_message}</p>}
                      </div>
                    );
                  })()}

                  {(item.products as any)?.product_type === "jasa" && (
                    <div className="mt-4 rounded-2xl border border-gold-400/25 bg-app-accent-soft p-4 text-app-kicker">
                      <p className="font-black">🎯 Status jasa: {order.status === "PROCESSING" ? "sedang dikerjakan" : order.status === "COMPLETED" ? "selesai" : "menunggu diproses"}</p>
                      {submission?.target_text && <p className="mt-2 text-xs text-app-kicker/80">Target: {submission.target_text}</p>}
                      {submission?.target_file_path && <p className="mt-1 text-xs text-app-kicker/80">📎 File target sudah dikirim.</p>}
                      <a href="/bantuan" className="mt-2 inline-block text-xs font-bold underline">Butuh bantuan terkait pesanan ini?</a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <aside className="h-fit rounded-2xl border border-app-border bg-app-surface p-5 lg:sticky lg:top-24">
            <p className="text-xs font-black uppercase tracking-widest text-app-subtle">Rincian Transaksi</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3"><span className="text-app-subtle">Tanggal</span><b className="text-app-text">{formatDate(order.created_at)}</b></div>
              <div className="flex justify-between gap-3"><span className="shrink-0 text-app-subtle">ID Pesanan</span><b className="break-all text-right text-app-text">{order.order_number}</b></div>
              <div className="flex justify-between gap-3"><span className="text-app-subtle">Metode</span><b className="text-right text-app-text">{order.payment_method === "BANK_VA" ? (bankNames[order.gateway_method || ""] || "Virtual Account") : order.payment_method === "QRIS" ? "QRIS" : order.payment_method || "Wallet"}</b></div>
              <div className="flex justify-between"><span className="text-app-subtle">Status</span><StatusBadge status={order.status} /></div>
              <div className="flex justify-between border-t border-app-border pt-4"><span className="text-app-subtle">Subtotal produk</span><b className="tabular-nums text-app-text">{formatRupiah(order.total_amount)}</b></div>
              <div className="flex justify-between text-lg"><span className="font-black text-app-text">Total dibayar</span><b className="tabular-nums text-app-kicker">{formatRupiah(order.gateway_total_payment || order.total_amount)}</b></div>
            </div>
            {order.status === "COMPLETED" && <div className="mt-5 rounded-2xl bg-emerald-500/10 p-4 text-xs font-bold text-emerald-600 dark:text-emerald-400">📥 Produk digital yang tersedia sudah bisa diambil dari kartu produk di atas.</div>}
          </aside>
        </div>
      </div>
    </div>
  );
}
