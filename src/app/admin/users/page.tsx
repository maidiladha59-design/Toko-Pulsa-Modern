"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import { formatBalanceCompact, formatDate, formatRupiah } from "@/lib/utils";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";

const ROLES = ["USER", "ADMIN", "SUPER_ADMIN"] as const;
const TEXTAREA_CLASS =
  "w-full rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20";
const OVERLAY_CLASS =
  "fixed inset-0 z-[200] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center";

type AccountStatus = "ACTIVE" | "BLOCKED";

type User = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  created_at: string;
  account_status: AccountStatus;
  blocked_at: string | null;
  blocked_reason: string | null;
  balance: number;
};

type BalanceDirection = "CREDIT" | "DEBIT";

type BalanceDraft = {
  user: User;
  direction: BalanceDirection;
  amount: string;
  reason: string;
};

type StatusDraft = {
  user: User;
  mode: "BLOCK" | "UNBLOCK";
  reason: string;
};

export default function AdminUsersPage() {
  const supabase = createClient();
  const toast = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [balanceDraft, setBalanceDraft] = useState<BalanceDraft | null>(null);
  const [statusDraft, setStatusDraft] = useState<StatusDraft | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function load() {
    setLoading(true);

    const [profilesRes, walletsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, full_name, email, role, created_at, account_status, blocked_at, blocked_reason"
        )
        .order("created_at", { ascending: false }),
      supabase.from("wallets").select("user_id, balance"),
    ]);

    if (profilesRes.error) toast.show(profilesRes.error.message, "error");
    if (walletsRes.error) toast.show(walletsRes.error.message, "error");

    const balances = new Map<string, number>();
    for (const row of (walletsRes.data as { user_id: string; balance: number | string }[] | null) ||
      []) {
      balances.set(row.user_id, Number(row.balance) || 0);
    }

    const rows = ((profilesRes.data as Omit<User, "balance">[] | null) || []).map((row) => ({
      ...row,
      account_status: (row.account_status || "ACTIVE") as AccountStatus,
      balance: balances.get(row.id) ?? 0,
    }));

    setUsers(rows);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openBalanceModal(user: User) {
    setBalanceError(null);
    setBalanceDraft({ user, direction: "CREDIT", amount: "", reason: "" });
  }

  function openStatusModal(user: User) {
    setStatusError(null);
    setStatusDraft({
      user,
      mode: user.account_status === "BLOCKED" ? "UNBLOCK" : "BLOCK",
      reason: "",
    });
  }

  async function changeRole(user: User, role: string) {
    setActing(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.show(json.message || "Gagal mengubah role.", "error");
        return;
      }
      toast.show(json.message || "Role pengguna berhasil diperbarui.", "success");
      await load();
    } catch {
      toast.show("Koneksi bermasalah.", "error");
    } finally {
      setActing(null);
    }
  }

  async function submitBalance() {
    if (!balanceDraft) return;

    const amount = Number(balanceDraft.amount);
    const reason = balanceDraft.reason.trim();

    if (!Number.isInteger(amount) || amount <= 0) {
      setBalanceError("Nominal harus bilangan bulat lebih dari 0.");
      return;
    }
    if (reason.length < 5) {
      setBalanceError("Alasan penyesuaian wajib diisi minimal 5 karakter.");
      return;
    }
    if (balanceDraft.direction === "DEBIT" && amount > balanceDraft.user.balance) {
      setBalanceError("Pengurangan melebihi saldo pengguna saat ini.");
      return;
    }

    setBalanceError(null);
    setActing(balanceDraft.user.id);

    try {
      const res = await fetch(`/api/admin/users/${balanceDraft.user.id}/wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: balanceDraft.direction, amount, reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBalanceError(json.message || "Gagal menyesuaikan saldo. Silakan coba lagi.");
        return;
      }
      toast.show(
        balanceDraft.direction === "CREDIT"
          ? "Saldo pengguna berhasil ditambahkan."
          : "Saldo pengguna berhasil dikurangi.",
        "success"
      );
      setBalanceDraft(null);
      await load();
    } catch {
      setBalanceError("Koneksi bermasalah. Silakan coba lagi.");
    } finally {
      setActing(null);
    }
  }

  async function submitStatus() {
    if (!statusDraft) return;

    const reason = statusDraft.reason.trim();
    if (statusDraft.mode === "BLOCK" && reason.length < 5) {
      setStatusError("Alasan blokir wajib diisi minimal 5 karakter.");
      return;
    }

    setStatusError(null);
    setActing(statusDraft.user.id);

    try {
      const res = await fetch(`/api/admin/users/${statusDraft.user.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          statusDraft.mode === "BLOCK"
            ? { status: "BLOCKED", reason }
            : { status: "ACTIVE" }
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusError(json.message || "Gagal mengubah status akun. Silakan coba lagi.");
        return;
      }
      toast.show(
        statusDraft.mode === "BLOCK"
          ? "Pengguna berhasil diblokir."
          : "Blokir pengguna berhasil dibuka.",
        "success"
      );
      setStatusDraft(null);
      await load();
    } catch {
      setStatusError("Koneksi bermasalah. Silakan coba lagi.");
    } finally {
      setActing(null);
    }
  }

  const parsedAmount = Number(balanceDraft?.amount);
  const validAmount = Number.isInteger(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0;
  const afterBalance = balanceDraft
    ? balanceDraft.user.balance +
      (balanceDraft.direction === "CREDIT" ? validAmount : -validAmount)
    : 0;
  const overspent = Boolean(balanceDraft?.direction === "DEBIT" && afterBalance < 0);

  return (
    <div className="animate-page-in space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Akun</p>
          <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Kelola Pengguna</h1>
          <p className="mt-1 text-sm text-app-muted">
            Atur role, saldo, dan status blokir pengguna.
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          ↻ Refresh
        </Button>
      </div>

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="border-b border-app-border text-left text-xs font-bold uppercase tracking-widest text-app-subtle">
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Saldo</th>
                  <th className="px-4 py-3">Bergabung</th>
                  <th className="px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-app-muted">
                      Belum ada pengguna.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="border-b border-app-border last:border-0">
                      <td className="px-4 py-3 font-bold text-app-text">{u.full_name || "-"}</td>
                      <td className="max-w-[14rem] truncate px-4 py-3 text-app-muted" title={u.email}>
                        {u.email}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            tone={
                              u.role === "SUPER_ADMIN"
                                ? "gold"
                                : u.role === "ADMIN"
                                  ? "warning"
                                  : "neutral"
                            }
                            className="px-2 py-0.5"
                          >
                            {u.role}
                          </Badge>
                          <Select
                            disabled={acting === u.id}
                            value={u.role}
                            onChange={(e) => changeRole(u, e.target.value)}
                            className="w-36 px-3 py-2 text-xs"
                          >
                            {ROLES.map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </Select>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={u.account_status === "BLOCKED" ? "danger" : "success"}
                          className="px-2 py-0.5"
                        >
                          {u.account_status === "BLOCKED" ? "Diblokir" : "Aktif"}
                        </Badge>
                        {u.account_status === "BLOCKED" && u.blocked_reason && (
                          <p
                            className="mt-1 max-w-[12rem] truncate text-[11px] text-app-subtle"
                            title={u.blocked_reason}
                          >
                            {u.blocked_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="block max-w-[9rem] truncate font-bold tabular-nums text-app-text"
                          title={formatRupiah(u.balance)}
                        >
                          {formatBalanceCompact(u.balance)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-app-muted">
                        {formatDate(u.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={acting === u.id}
                            onClick={() => openBalanceModal(u)}
                          >
                            Atur Saldo
                          </Button>
                          <Button
                            size="sm"
                            variant={u.account_status === "BLOCKED" ? "secondary" : "destructive"}
                            disabled={acting === u.id}
                            onClick={() => openStatusModal(u)}
                          >
                            {u.account_status === "BLOCKED" ? "Buka Blokir" : "Blokir"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {balanceDraft && (
        <div
          className={OVERLAY_CLASS}
          role="dialog"
          aria-modal="true"
          aria-labelledby="balance-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && acting === null) setBalanceDraft(null);
          }}
        >
          <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto shadow-2xl">
            <h2 id="balance-modal-title" className="text-xl font-black text-app-text">
              Sesuaikan Saldo
            </h2>
            <p className="mt-1 text-sm text-app-muted">
              {balanceDraft.user.full_name || "-"} · {balanceDraft.user.email}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl border border-app-border bg-app-inset p-1">
              <button
                type="button"
                aria-pressed={balanceDraft.direction === "CREDIT"}
                onClick={() => setBalanceDraft({ ...balanceDraft, direction: "CREDIT" })}
                className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                  balanceDraft.direction === "CREDIT"
                    ? "bg-success-600 text-white shadow-sm"
                    : "text-app-muted hover:text-app-text"
                }`}
              >
                + Tambah
              </button>
              <button
                type="button"
                aria-pressed={balanceDraft.direction === "DEBIT"}
                onClick={() => setBalanceDraft({ ...balanceDraft, direction: "DEBIT" })}
                className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                  balanceDraft.direction === "DEBIT"
                    ? "bg-danger-600 text-white shadow-sm"
                    : "text-app-muted hover:text-app-text"
                }`}
              >
                − Kurangi
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <Input
                label="Nominal (Rp)"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={balanceDraft.amount}
                onChange={(e) => setBalanceDraft({ ...balanceDraft, amount: e.target.value })}
                placeholder="Contoh: 50000"
                hint="Masukkan angka tanpa titik atau koma."
              />

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-app-text">
                  Alasan Penyesuaian <span className="text-danger-500">*</span>
                </span>
                <textarea
                  rows={3}
                  value={balanceDraft.reason}
                  onChange={(e) => setBalanceDraft({ ...balanceDraft, reason: e.target.value })}
                  placeholder="Contoh: kompensasi kendala transaksi"
                  className={TEXTAREA_CLASS}
                />
              </label>

              <div className="grid gap-2 rounded-2xl border border-app-border bg-app-inset p-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-app-subtle">
                    Saldo saat ini
                  </p>
                  <p className="mt-1 font-black tabular-nums text-app-text">
                    {formatRupiah(balanceDraft.user.balance)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-app-subtle">
                    Saldo setelah perubahan
                  </p>
                  <p
                    className={`mt-1 font-black tabular-nums ${
                      overspent ? "text-danger-600 dark:text-danger-400" : "text-app-kicker"
                    }`}
                  >
                    {formatRupiah(afterBalance)}
                  </p>
                </div>
              </div>

              {overspent && (
                <p className="text-xs font-medium text-danger-600 dark:text-danger-400">
                  Pengurangan melebihi saldo pengguna. Kurangi nominal atau pilih Tambah.
                </p>
              )}

              {balanceError && (
                <p
                  role="alert"
                  className="rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm font-medium text-danger-600 dark:text-danger-400"
                >
                  {balanceError}
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                disabled={acting === balanceDraft.user.id}
                onClick={() => setBalanceDraft(null)}
              >
                Batal
              </Button>
              <Button
                onClick={submitBalance}
                loading={acting === balanceDraft.user.id}
                disabled={overspent || (acting !== null && acting !== balanceDraft.user.id)}
              >
                Konfirmasi
              </Button>
            </div>
          </Card>
        </div>
      )}

      {statusDraft && (
        <div
          className={OVERLAY_CLASS}
          role="dialog"
          aria-modal="true"
          aria-labelledby="status-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && acting === null) setStatusDraft(null);
          }}
        >
          <Card className="max-h-[90vh] w-full max-w-md overflow-y-auto shadow-2xl">
            <h2 id="status-modal-title" className="text-xl font-black text-app-text">
              {statusDraft.mode === "BLOCK" ? "Blokir Pengguna" : "Buka Blokir Pengguna"}
            </h2>
            <p className="mt-1 text-sm text-app-muted">
              {statusDraft.user.full_name || "-"} · {statusDraft.user.email}
            </p>

            {statusDraft.mode === "BLOCK" ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-xs leading-5 text-danger-700 dark:text-danger-300">
                  Pengguna tidak bisa login dan tidak bisa melakukan transaksi sampai blokir
                  dibuka.
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-app-text">
                    Alasan Blokir <span className="text-danger-500">*</span>
                  </span>
                  <textarea
                    rows={3}
                    value={statusDraft.reason}
                    onChange={(e) => setStatusDraft({ ...statusDraft, reason: e.target.value })}
                    placeholder="Contoh: indikasi penyalahgunaan akun"
                    className={TEXTAREA_CLASS}
                  />
                </label>

                {statusError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm font-medium text-danger-600 dark:text-danger-400"
                  >
                    {statusError}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {statusDraft.user.blocked_reason && (
                  <div className="rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-muted">
                    <span className="font-bold text-app-text">Alasan blokir sebelumnya: </span>
                    {statusDraft.user.blocked_reason}
                  </div>
                )}
                <p className="text-sm text-app-muted">
                  Pengguna akan bisa login dan bertransaksi kembali setelah blokir dibuka.
                </p>

                {statusError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm font-medium text-danger-600 dark:text-danger-400"
                  >
                    {statusError}
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                disabled={acting === statusDraft.user.id}
                onClick={() => setStatusDraft(null)}
              >
                Batal
              </Button>
              <Button
                variant={statusDraft.mode === "BLOCK" ? "destructive" : "primary"}
                onClick={submitStatus}
                loading={acting === statusDraft.user.id}
                disabled={acting !== null && acting !== statusDraft.user.id}
              >
                {statusDraft.mode === "BLOCK" ? "Blokir Pengguna" : "Buka Blokir"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
