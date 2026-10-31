import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReceiptView from "@/components/ReceiptView";
import { formatReceiptDate, plainNumber, type ReceiptRow } from "@/lib/receipt-print";
import { containsInternalTerm, safeProductName } from "@/lib/labels";

const TYPE_LABEL: Record<string, string> = {
  TOPUP: "Top Up Saldo", PURCHASE: "Pembelian dengan Saldo", REFUND: "Pengembalian Dana", ADJUSTMENT: "Penyesuaian Saldo", TRANSFER: "Transfer Saldo",
};

export default async function WalletReceiptPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: wallet } = await supabase.from("wallets").select("id").eq("user_id", user.id).maybeSingle();
  if (!wallet) notFound();

  const { data: tx } = await supabase.from("wallet_transactions")
    .select("id,type,amount,balance_after,reference_type,reference_id,description,created_at")
    .eq("id", params.id).eq("wallet_id", wallet.id).maybeSingle();
  if (!tx) notFound();

  // Refund/pembelian saldo yang terhubung ke order selalu menyebut produk asal.
  let refOrder: { id: string; order_number: string; product_name: string | null } | null = null;
  if (tx.reference_type === "order" && tx.reference_id) {
    const { data: order } = await supabase.from("orders")
      .select("id, order_number, order_items(product_name)")
      .eq("id", tx.reference_id).eq("user_id", user.id).maybeSingle();
    if (order) {
      const items = Array.isArray((order as any).order_items) ? (order as any).order_items : [];
      refOrder = {
        id: order.id,
        order_number: order.order_number,
        product_name: items[0]?.product_name ? safeProductName(items[0].product_name, "") : null,
      };
    }
  }

  const amount = Number(tx.amount);
  let title = TYPE_LABEL[tx.type] || "Transaksi Saldo";
  if (tx.type === "REFUND" && refOrder?.product_name) title = `Refund: ${refOrder.product_name}`;
  else if (tx.type === "PURCHASE" && refOrder?.product_name) title = `Pembayaran saldo: ${refOrder.product_name}`;
  else if (tx.type === "TRANSFER") title = amount < 0 ? "Transfer Saldo Keluar" : "Transfer Saldo Masuk";

  const description = String(tx.description || "").trim();
  const safeDescription = description && !containsInternalTerm(description) ? description : "";

  const rows: ReceiptRow[] = [
    { label: "Tanggal", value: formatReceiptDate(tx.created_at) },
    { label: "ID Transaksi", value: tx.id.slice(0, 8).toUpperCase() },
    { label: "Transaksi", value: title },
    { label: "Jenis", value: amount < 0 ? "Saldo keluar" : "Saldo masuk" },
    { label: "Status", value: "Berhasil" },
  ];
  if (refOrder?.order_number) rows.push({ label: "Invoice", value: refOrder.order_number });
  if (safeDescription) rows.push({ label: "Keterangan", value: safeDescription });
  if (tx.balance_after !== null && tx.balance_after !== undefined) rows.push({ label: "Saldo Akhir", value: plainNumber(Number(tx.balance_after)) });

  return <ReceiptView title="Rincian Transaksi" rows={rows} total={{ label: amount < 0 ? "Nominal Keluar" : "Nominal Masuk", value: plainNumber(Math.abs(amount)) }} backHref="/transactions" />;
}
