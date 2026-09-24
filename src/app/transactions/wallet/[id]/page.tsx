import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReceiptView from "@/components/ReceiptView";
import { formatReceiptDate, plainNumber, type ReceiptRow } from "@/lib/receipt-print";

const TYPE_LABEL: Record<string, string> = {
  TOPUP: "Top Up Saldo", PURCHASE: "Pembelian dengan Saldo", REFUND: "Pengembalian Dana", ADJUSTMENT: "Penyesuaian Saldo",
};

export default async function WalletReceiptPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: wallet } = await supabase.from("wallets").select("id").eq("user_id", user.id).maybeSingle();
  if (!wallet) notFound();

  const { data: tx } = await supabase.from("wallet_transactions")
    .select("id,type,amount,balance_after,reference_id,description,created_at")
    .eq("id", params.id).eq("wallet_id", wallet.id).maybeSingle();
  if (!tx) notFound();

  const amount = Number(tx.amount);
  const rows: ReceiptRow[] = [
    { label: "Tanggal", value: formatReceiptDate(tx.created_at) },
    { label: "ID Transaksi", value: tx.id.slice(0, 8).toUpperCase() },
    { label: "Produk", value: TYPE_LABEL[tx.type] || "Transaksi Saldo" },
    { label: "Jenis", value: amount < 0 ? "Saldo keluar" : "Saldo masuk" },
    { label: "Status", value: "Berhasil" },
  ];
  if (tx.reference_id) rows.push({ label: "No. Referensi", value: String(tx.reference_id).slice(0, 8).toUpperCase() });
  if (tx.description) rows.push({ label: "Keterangan", value: tx.description });
  if (tx.balance_after !== null && tx.balance_after !== undefined) rows.push({ label: "Saldo Akhir", value: plainNumber(Number(tx.balance_after)) });

  return <ReceiptView title="Rincian Transaksi" rows={rows} total={{ label: amount < 0 ? "Nominal Keluar" : "Nominal Masuk", value: plainNumber(Math.abs(amount)) }} backHref="/transactions" />;
}