"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import { useToast } from "@/components/ToastProvider";
import { chatAdminErrorMessage } from "@/lib/community-chat";

type MutedUser = {
  user_id: string;
  name: string;
  email: string | null;
  reason: string | null;
  muted_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminChatModerationPage() {
  const toast = useToast();
  const [users, setUsers] = useState<MutedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/chat-moderation/muted", { cache: "no-store" });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(json.message || "Gagal memuat daftar pengguna yang dibisukan.");
        return;
      }

      setUsers(json.users || []);
    } catch {
      setError("Jaringan gagal. Periksa koneksi lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function unmute(user: MutedUser) {
    if (busyId) return;
    setBusyId(user.user_id);

    try {
      const response = await fetch("/api/admin/chat-moderation/mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.user_id, muted: false }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.show(chatAdminErrorMessage(json.message || ""), "error");
        return;
      }

      setUsers((previous) => previous.filter((row) => row.user_id !== user.user_id));
      toast.show(`Bisuan ${user.name} dibuka. Pengguna bisa mengirim pesan lagi.`, "success");
    } catch {
      toast.show("Jaringan gagal. Periksa koneksi lalu coba lagi.", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-app-kicker">
            Moderasi
          </p>
          <h1 className="mt-1 text-2xl font-black text-app-text">Ruang Diskusi</h1>
          <p className="mt-1 max-w-xl text-sm leading-6 text-app-muted">
            Daftar pengguna yang sedang dibisukan. Hapus pesan dan bisukan pengguna langsung dari
            halaman Ruang Diskusi.
          </p>
        </div>
        <Link
          href="/diskusi"
          className="inline-flex min-h-[44px] items-center rounded-xl border border-app-border bg-app-surface px-4 py-2.5 text-sm font-black text-app-text transition hover:border-gold-400 hover:text-app-kicker"
        >
          Buka Ruang Diskusi
        </Link>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border pb-4">
          <div>
            <h2 className="text-base font-black text-app-text">Pengguna Dibisukan</h2>
            <p className="mt-1 text-sm text-app-muted">
              Bisuan hanya membatasi pengiriman pesan di Ruang Diskusi, bukan blokir akun.
            </p>
          </div>
          <Badge tone="danger">{users.length} pengguna</Badge>
        </div>

        <div className="pt-4">
          {loading ? (
            <LoadingSkeleton rows={4} className="border-0 bg-transparent p-0" />
          ) : error ? (
            <ErrorState
              title="Gagal memuat daftar"
              description={error}
              onRetry={() => void load()}
              className="border-0 bg-transparent p-4"
            />
          ) : users.length === 0 ? (
            <EmptyState
              title="Tidak ada pengguna dibisukan"
              description="Semua pengguna saat ini bisa mengirim pesan di Ruang Diskusi."
              className="border-0 bg-transparent"
            />
          ) : (
            <ul className="space-y-3">
              {users.map((user) => (
                <li
                  key={user.user_id}
                  className="flex flex-col gap-3 rounded-2xl border border-app-border bg-app-inset p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-black text-app-text">{user.name}</p>
                      <Badge tone="danger">Dibisukan</Badge>
                    </div>
                    {user.email && (
                      <p className="mt-0.5 truncate text-xs text-app-subtle">{user.email}</p>
                    )}
                    <p className="mt-2 text-sm text-app-muted">
                      Alasan: {user.reason || "tidak disebutkan"}
                    </p>
                    <p className="mt-1 text-[11px] text-app-subtle">
                      Dibisukan: {formatDate(user.muted_at)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    loading={busyId === user.user_id}
                    onClick={() => void unmute(user)}
                    className="shrink-0"
                  >
                    Buka bisu
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
