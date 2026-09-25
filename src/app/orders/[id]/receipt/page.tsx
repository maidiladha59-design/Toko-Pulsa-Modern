import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatRupiah, formatDate } from "@/lib/utils";
import Link from "next/link";
import PrintButton from "@/components/PrintButton";

const labels: Record<string, string> = {
  SUCCESS: "OK", PROCESSING: "DIPROSES", FAILED: "GAGAL",
  REFUNDED: "DIKEMBALIKAN", WAITING: "MENUNGGU",
  COMPLETED: "OK", PENDING: "MENUNGGU", CANCELLED: "DIBATALKAN",
};

/** Angka polos ala struk PPOB (tanpa "Rp"), contoh: 18.766 */
function plainNumber(n: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(n)));
}

function Row({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className={`break-all text-right ${bold ? "font-black" : "font-bold text-zinc-950"}`}>{value}</span>
    </div>
  );
}

function StatusPill({ text, ok }: { text: string; ok: boolean }) {
  return (
    <span className={`rounded-full px-3 py-0.5 text-xs font-black tracking-wide ${ok ? "bg-gold-400 text-black" : "bg-zinc-950 text-gold-400"}`}>
      {text}
    </span>
  );
}

export default async function PPOBReceiptPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: order } = await supabase.from("orders")
    .select("id,order_number,total_amount,status,created_at,payment_method,gateway_txn_id,gateway_total_payment,gateway_fee")
    .eq("id", params.id).eq("user_id", user.id).maybeSingle();
  if (!order) notFound();

  const { data: items } = await supabase.from("order_items")
    .select("id,product_id,product_name,unit_price,quantity,subtotal")
    .eq("order_id", order.id);

  const itemIds = (items || []).map((i) => i.id);
  const productIds = (items || []).map((i) => i.product_id).filter(Boolean) as string[];

  const { data: targets } = itemIds.length
    ? await supabase.from("ppob_order_targets").select("order_item_id,customer_no,target_data").in("order_item_id", itemIds)
    : { data: [] };
  const { data: txs } = await supabase.from("ppob_transactions")
    .select("order_item_id,customer_no,status,response_code,serial_number,provider_message,completed_at")
    .eq("order_id", order.id);
  // cost_price (modal) hanya bisa dibaca lewat service role, bukan lewat client
  // yang tunduk RLS/hak akses kolom milik user biasa — lihat migrations_v70.
  const { data: services } = productIds.length
    ? await createAdminClient().from("ppob_services").select("product_id,cost_price").in("product_id", productIds)
    : { data: [] };

  const targetMap = new Map((targets || []).map((t) => [t.order_item_id, t]));
  const txMap = new Map((txs || []).map((t) => [t.order_item_id, t]));
  const costMap = new Map((services || []).map((s) => [s.product_id, Number(s.cost_price || 0)]));

  return (
    <main className="mx-auto max-w-md animate-page-in pb-8 print:max-w-none print:pb-0" style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
      <div className="no-print flex items-center justify-between rounded-t-3xl bg-zinc-950 px-5 pb-5 pt-4 text-gold-400">
        <Link href={`/orders/${order.id}`} aria-label="Kembali" className="text-2xl font-black leading-none">←</Link>
        <span className="text-[11px] font-black uppercase tracking-[.25em]">Struk Digital</span>
      </div>
      <div
        className="no-print h-3 bg-white"
        style={{ backgroundImage: "radial-gradient(circle at 10px 0, #09090b 7px, transparent 8px)", backgroundSize: "20px 12px", backgroundRepeat: "repeat-x" }}
      />

      <div className="bg-white px-5 pb-6 pt-4 text-zinc-950 shadow-lg print:shadow-none">
        <div className="border-b-2 border-gold-400 pb-5 text-center">
          <img src="/aidil-logo.png" alt="AIDIL STORE" className="mx-auto h-20 w-20 rounded-2xl object-cover ring-2 ring-gold-400" />
          <p className="mt-3 text-xs font-black tracking-[.25em] text-gold-700">AIDIL STORE</p>
          <h1 className="mt-1 text-2xl font-black text-zinc-950">Rincian Transaksi</h1>
        </div>

        <div className="mt-5 space-y-3 border-b border-dashed border-gold-500 pb-5">
          <Row label="Tanggal" value={formatDate(order.created_at)} />
          <Row label="ID Transaksi" value={order.order_number} />
          {order.gateway_txn_id && <Row label="ID Transaksi Gateway" value={order.gateway_txn_id} />}
          {order.payment_method && <Row label="Metode Bayar" value={order.payment_method === "QRIS" ? "QRIS · FR3 NEWERA" : order.payment_method} />}
        </div>

        <div className="mt-5 space-y-5">
          {(items || []).map((item) => {
            const target = targetMap.get(item.id);
            const tx = txMap.get(item.id);
            const statusKey = tx?.status || order.status;
            const costPrice = item.product_id ? costMap.get(item.product_id) : undefined;
            const hargaJual = Number(item.subtotal);
            const untung = costPrice !== undefined ? Math.max(0, hargaJual - costPrice * item.quantity) : null;

            return (
              <section key={item.id} className="space-y-3">
                <Row label="Produk" value={item.product_name} />
                {(target?.customer_no || tx?.customer_no) && (
                  <Row label="Nomor Pelanggan" value={target?.customer_no || tx?.customer_no} />
                )}
                <Row label="Status" value={<StatusPill text={labels[statusKey] || statusKey} ok={["SUCCESS", "COMPLETED"].includes(statusKey)} />} />
                {tx?.serial_number && <Row label="SN/Ref" value={tx.serial_number} />}
                {tx?.provider_message && tx.status !== "SUCCESS" && (
                  <p className="text-xs text-zinc-500">{tx.provider_message}</p>
                )}
                <Row label="Harga Jual" value={plainNumber(hargaJual)} />
                {untung !== null && <Row label="Untung" value={plainNumber(untung)} />}
                {item.quantity > 1 && (
                  <p className="text-right text-xs text-zinc-400">{item.quantity} × {formatRupiah(item.unit_price)}</p>
                )}
              </section>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between rounded-2xl bg-zinc-950 px-5 py-4 text-xl">
          <span className="font-black text-gold-400">Harga</span>
          <b className="text-gold-400">{plainNumber(order.total_amount)}</b>
        </div>

        <p className="mt-5 text-center text-[11px] leading-5 text-zinc-500">
          Terima kasih telah menggunakan AIDIL STORE. Simpan struk ini sebagai bukti transaksi.
        </p>
      </div>
      <div className="h-1.5 rounded-b-3xl bg-gold-400 print:hidden" />

      <div className="px-5">
        <PrintButton
          receiptText={`AIDIL STORE\nRincian Transaksi\nTanggal: ${formatDate(order.created_at)}\nID Transaksi: ${order.order_number}\n${order.gateway_txn_id ? `ID Transaksi Gateway: ${order.gateway_txn_id}\n` : ""}${order.payment_method ? `Metode Bayar: ${order.payment_method === "QRIS" ? "QRIS · FR3 NEWERA" : order.payment_method}\n` : ""}${(items || [])
            .map((item) => {
              const target = targetMap.get(item.id);
              const tx = txMap.get(item.id);
              const statusKey = tx?.status || order.status;
              return `Produk: ${item.product_name}\n${target?.customer_no ? `Nomor Pelanggan: ${target.customer_no}\n` : ""}Status: ${labels[statusKey] || statusKey}\n${tx?.serial_number ? `SN/Ref: ${tx.serial_number}\n` : ""}Harga Jual: ${plainNumber(Number(item.subtotal))}\n`;
            })
            .join("\n")}\nHarga: ${plainNumber(order.total_amount)}\n\nTerima kasih telah menggunakan AIDIL STORE.\n`}
        />
      </div>
    </main>
  );
}