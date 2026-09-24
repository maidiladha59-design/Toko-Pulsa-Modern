import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ReceiptView from "@/components/ReceiptView";
import { formatReceiptDate, plainNumber, receiptStatusLabel, type ReceiptRow } from "@/lib/receipt-print";

const PAYMENT_LABEL: Record<string, string> = { QRIS: "QRIS", BANK_VA: "Virtual Account", WALLET: "Saldo AIDIL STORE" };

export default async function OrderReceiptPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: order } = await supabase.from("orders")
    .select("id,order_number,total_amount,status,created_at,payment_method,gateway_txn_id")
    .eq("id", params.id).eq("user_id", user.id).maybeSingle();
  if (!order) notFound();

  const { data: items } = await supabase.from("order_items")
    .select("id,product_id,product_name,unit_price,quantity,subtotal")
    .eq("order_id", order.id);

  const itemIds = (items || []).map((i) => i.id);
  const productIds = (items || []).map((i) => i.product_id).filter(Boolean) as string[];

  const { data: targets } = itemIds.length
    ? await supabase.from("ppob_order_targets").select("order_item_id,customer_no").in("order_item_id", itemIds)
    : { data: [] as any[] };
  const { data: txs } = await supabase.from("ppob_transactions")
    .select("order_item_id,customer_no,status,serial_number,provider_message")
    .eq("order_id", order.id);

  // "Untung" hanya untuk admin. Pelanggan tidak boleh melihat modal/keuntungan toko.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isAdmin = profile?.role === "ADMIN" || profile?.role === "SUPER_ADMIN";
  const { data: services } = isAdmin && productIds.length
    ? await createAdminClient().from("ppob_services").select("product_id,cost_price").in("product_id", productIds)
    : { data: [] as any[] };

  const targetMap = new Map((targets || []).map((t: any) => [t.order_item_id, t]));
  const txMap = new Map((txs || []).map((t: any) => [t.order_item_id, t]));
  const costMap = new Map<string, number>((services || []).map((s: any) => [String(s.product_id), Number(s.cost_price || 0)] as [string, number]));

  const rows: ReceiptRow[] = [
    { label: "Tanggal", value: formatReceiptDate(order.created_at) },
    { label: "ID Transaksi", value: order.order_number },
  ];
  if (order.gateway_txn_id) rows.push({ label: "ID Pembayaran", value: order.gateway_txn_id });
  if (order.payment_method) rows.push({ label: "Metode Bayar", value: PAYMENT_LABEL[order.payment_method] || order.payment_method });

  for (const item of items || []) {
    const target: any = targetMap.get(item.id);
    const tx: any = txMap.get(item.id);
    const statusKey = tx?.status || order.status;
    rows.push({ label: "Produk", value: item.quantity > 1 ? `${item.product_name} x${item.quantity}` : item.product_name });
    const customerNo = target?.customer_no || tx?.customer_no;
    if (customerNo) rows.push({ label: "Nomor Pelanggan", value: customerNo });
    rows.push({ label: "Status", value: receiptStatusLabel(statusKey) });
    if (tx?.serial_number) rows.push({ label: "SN/Ref", value: tx.serial_number });
    if (tx?.provider_message && tx.status !== "SUCCESS") rows.push({ label: "Keterangan", value: tx.provider_message });
    if (isAdmin) {
      const cost: number | undefined = item.product_id ? costMap.get(String(item.product_id)) : undefined;
      rows.push({ label: "Harga Jual", value: plainNumber(Number(item.subtotal)) });
      if (cost !== undefined) rows.push({ label: "Untung", value: plainNumber(Math.max(0, Number(item.subtotal) - Number(cost) * Number(item.quantity))) });
    }
  }

  return <ReceiptView title="Rincian Transaksi" rows={rows} total={{ label: "Harga", value: plainNumber(Number(order.total_amount)) }} backHref="/transactions" />;
}