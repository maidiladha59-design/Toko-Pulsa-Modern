import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatRupiah, formatDate } from "@/lib/utils";
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
      <span className="text-slate-500">{label}</span>
      <span className={`break-all text-right ${bold ? "font-black" : "font-bold text-slate-900"}`}>{value}</span>
    </div>
  );
}

export default async function PPOBReceiptPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: order } = await supabase.from("orders")
    .select("id,order_number,total_amount,status,created_at,payment_method")
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
    <main className="mx-auto max-w-md animate-page-in bg-white px-5 py-6 text-slate-900 print:max-w-none print:px-0">
      <div className="border-b-2 border-zinc-950 pb-5 text-center">
        <img src="/aidil-logo.png" alt="AIDIL STORE" className="mx-auto h-20 w-20 rounded-2xl object-cover" />
        <p className="mt-3 text-xs font-black tracking-[.25em] text-gold-700">AIDIL STORE</p>
        <h1 className="mt-1 text-2xl font-black">Rincian Transaksi</h1>
      </div>

      <div className="mt-5 space-y-3 border-b border-dashed border-slate-300 pb-5">
        <Row label="Tanggal" value={formatDate(order.created_at)} />
        <Row label="ID Transaksi" value={order.order_number} />
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
              <Row label="Status" value={labels[statusKey] || statusKey} />
              {tx?.serial_number && <Row label="SN/Ref" value={tx.serial_number} />}
              {tx?.provider_message && tx.status !== "SUCCESS" && (
                <p className="text-xs text-slate-500">{tx.provider_message}</p>
              )}
              <Row label="Harga Jual" value={plainNumber(hargaJual)} />
              {untung !== null && <Row label="Untung" value={plainNumber(untung)} />}
              {item.quantity > 1 && (
                <p className="text-right text-xs text-slate-400">{item.quantity} × {formatRupiah(item.unit_price)}</p>
              )}
            </section>
          );
        })}
      </div>

      <div className="mt-6 border-t-2 border-slate-900 pt-4">
        <div className="flex justify-between text-xl">
          <span className="font-black">Harga</span>
          <b>{plainNumber(order.total_amount)}</b>
        </div>
      </div>

      <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">
        Terima kasih telah menggunakan AIDIL STORE. Simpan struk ini sebagai bukti transaksi.
      </p>

      <PrintButton
        receiptText={`AIDIL STORE\nRincian Transaksi\nTanggal: ${formatDate(order.created_at)}\nID Transaksi: ${order.order_number}\n${(items || [])
          .map((item) => {
            const target = targetMap.get(item.id);
            const tx = txMap.get(item.id);
            const statusKey = tx?.status || order.status;
            return `Produk: ${item.product_name}\n${target?.customer_no ? `Nomor Pelanggan: ${target.customer_no}\n` : ""}Status: ${labels[statusKey] || statusKey}\n${tx?.serial_number ? `SN/Ref: ${tx.serial_number}\n` : ""}Harga Jual: ${plainNumber(Number(item.subtotal))}\n`;
          })
          .join("\n")}\nHarga: ${plainNumber(order.total_amount)}\n\nTerima kasih telah menggunakan AIDIL STORE.\n`}
      />
    </main>
  );
}
