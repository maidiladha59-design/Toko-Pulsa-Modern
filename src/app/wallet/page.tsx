import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah, formatDate } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";

const TX_LABEL: Record<string, string> = {
  TOPUP: "Top Up",
  PURCHASE: "Pembelian",
  REFUND: "Refund",
  ADJUSTMENT: "Penyesuaian",
  TRANSFER: "Transfer",
};

const TX_ICON: Record<string, string> = {
  TOPUP: "＋",
  PURCHASE: "🛍️",
  REFUND: "↩️",
  ADJUSTMENT: "⚙️",
  TRANSFER: "🔁",
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
    <div className="customer-shell"><div className="mx-auto w-full max-w-[480px] animate-page-in">
      <section className="app-hero rounded-[2rem] p-6">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-400">Saldo Anda saat ini</p>
        <p className="mt-2 text-4xl font-black tabular-nums text-gold-400">{formatRupiah(wallet?.balance || 0)}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/wallet/topup"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gold-400 px-4 py-3 text-sm font-black text-zinc-950 transition hover:bg-gold-300"
          >
            + Top Up Saldo
          </Link>
          <Link
            href="/transfer-uang"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:border-gold-400/60 hover:text-gold-400"
          >
            📤 Transfer
          </Link>
          <Link
            href="/transfer-uang/qr"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-200 transition hover:border-gold-400/60 hover:text-gold-400"
          >
            📥 Terima Saldo
          </Link>
        </div>
      </section>

      {pendingTopups && pendingTopups.length > 0 && (
        <section className="mt-4 rounded-2xl border border-gold-400/25 bg-app-accent-soft p-4">
          <p className="text-sm font-black text-app-kicker">Top Up dalam proses</p>
          <ul className="mt-2 space-y-2">
            {pendingTopups.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="tabular-nums text-app-text">{formatRupiah(t.amount)} — {formatDate(t.created_at)}</span>
                <StatusBadge status={t.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <p className="text-[10px] font-black uppercase tracking-[.18em] text-app-kicker">Aktivitas</p>
        <h2 className="mt-1 text-base font-black text-app-text">Riwayat Saldo</h2>
      </section>
      <div className="mt-3 overflow-hidden rounded-2xl border border-app-border bg-app-surface">
        {history && history.length > 0 ? (
          <ul className="divide-y divide-app-border">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-4 py-3.5">
                <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-app-border bg-app-inset text-base">
                  {TX_ICON[h.type] || "💳"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-app-text">{TX_LABEL[h.type] || h.type}</p>
                  <p className="mt-0.5 truncate text-xs text-app-subtle">{h.description || "-"} · {formatDate(h.created_at)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-black tabular-nums ${h.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {h.amount >= 0 ? "+" : ""}{formatRupiah(h.amount)}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-app-subtle">Saldo: {formatRupiah(h.balance_after)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-12 text-center">
            <p aria-hidden className="text-3xl">🪙</p>
            <p className="mt-2 text-sm font-bold text-app-text">Belum ada riwayat</p>
            <p className="mt-1 text-xs text-app-subtle">Riwayat saldo Anda akan muncul di sini.</p>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
