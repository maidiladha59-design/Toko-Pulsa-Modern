import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah, formatDate } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";

const TX_LABEL: Record<string, string> = {
  TOPUP: "Top Up",
  PURCHASE: "Pembelian",
  REFUND: "Refund",
  ADJUSTMENT: "Penyesuaian",
};

export default async function WalletPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: wallet } = await supabase.from("wallets").select("id, balance").eq("user_id", user.id).single();

  const { data: history } = wallet
    ? await supabase
        .from("wallet_transactions")
        .select("id, type, amount, balance_after, description, created_at")
        .eq("wallet_id", wallet.id)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };

  const { data: pendingTopups } = await supabase
    .from("topups")
    .select("id, amount, status, created_at")
    .eq("user_id", user.id)
    .in("status", ["PENDING", "VERIFYING"])
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="rounded-2xl bg-navy p-6 text-white">
        <p className="text-sm text-white/70">Saldo Anda saat ini</p>
        <p className="mt-1 text-3xl font-bold">{formatRupiah(wallet?.balance || 0)}</p>
        <Link
          href="/wallet/topup"
          className="mt-4 inline-block rounded-lg bg-brand px-4 py-2.5 text-sm font-medium hover:bg-brand-dark"
        >
          + Top Up Saldo
        </Link>
      </div>

      {pendingTopups && pendingTopups.length > 0 && (
        <div className="mt-6 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-sm font-medium text-yellow-800">Top Up dalam proses</p>
          <ul className="mt-2 space-y-2">
            {pendingTopups.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-sm">
                <span>{formatRupiah(t.amount)} — {formatDate(t.created_at)}</span>
                <StatusBadge status={t.status} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="mt-8 text-base font-semibold">Riwayat Saldo</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {history && history.length > 0 ? (
          <table className="w-full text-sm">
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{TX_LABEL[h.type] || h.type}</p>
                    <p className="text-xs text-gray-500">{h.description || "-"} · {formatDate(h.created_at)}</p>
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${h.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {h.amount >= 0 ? "+" : ""}{formatRupiah(h.amount)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500">Saldo: {formatRupiah(h.balance_after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-4">
            <EmptyState title="Belum ada riwayat" description="Riwayat saldo Anda akan muncul di sini." />
          </div>
        )}
      </div>
    </div>
  );
}
