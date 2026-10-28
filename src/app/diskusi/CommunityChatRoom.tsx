"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import ErrorState from "@/components/ui/ErrorState";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import { useToast } from "@/components/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import {
  COMMUNITY_CHAT_MAX_LENGTH,
  COMMUNITY_CHAT_REALTIME_TOPIC,
  chatAdminErrorMessage,
  chatErrorMessage,
  chatMutedReason,
  mutedChatMessage,
  type CommunityChatMember,
  type CommunityChatMessage,
} from "@/lib/community-chat";

type MuteStatus = {
  is_muted: boolean;
  muted_reason: string | null;
};

function formatChatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const today = new Date().toDateString() === date.toDateString();
  return today
    ? time
    : `${date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })} ${time}`;
}

function sortMessages(rows: CommunityChatMessage[]) {
  return [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

function ChatModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-3xl border border-app-border bg-app-surface p-5 shadow-2xl"
      >
        <h2 className="text-base font-black text-app-text">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export default function CommunityChatRoom() {
  const toast = useToast();
  const supabase = createClient();
  const listRef = useRef<HTMLDivElement>(null);
  const namesRef = useRef<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [messages, setMessages] = useState<CommunityChatMessage[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [muted, setMuted] = useState<MuteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<CommunityChatMessage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommunityChatMessage | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [muteTarget, setMuteTarget] = useState<CommunityChatMessage | null>(null);
  const [muteReason, setMuteReason] = useState("");
  const [muteReasonError, setMuteReasonError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const removeMessage = useCallback((id: string) => {
    setMessages((previous) => previous.filter((row) => row.id !== id));
  }, []);

  const resolveNames = useCallback(async (ids: string[]) => {
    const missing = Array.from(new Set(ids.filter(Boolean))).filter(
      (id) => !namesRef.current[id]
    );
    if (!missing.length) return;

    const { data, error } = await supabase.rpc("community_chat_display_names", {
      p_user_ids: missing,
    });
    if (error || !Array.isArray(data)) return;

    const next = { ...namesRef.current };
    for (const row of data as CommunityChatMember[]) {
      if (row.user_id && row.display_name) next[row.user_id] = row.display_name;
    }
    namesRef.current = next;
    setNames(next);
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoadError("Sesi login tidak ditemukan. Silakan login ulang.");
      setLoading(false);
      return;
    }

    setUserId(user.id);

    const [profileResult, messagesResult, statusResult] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).single(),
      supabase
        .from("community_chat_messages")
        .select("id,user_id,message,is_deleted,created_at")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("chat_user_status")
        .select("is_muted,muted_reason")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (profileResult.data?.role) {
      setIsAdmin(["ADMIN", "SUPER_ADMIN"].includes(String(profileResult.data.role)));
    }

    if (messagesResult.error || statusResult.error) {
      setLoadError(
        "Ruang Diskusi belum tersedia. Pastikan migrasi v94 sudah dijalankan di Supabase."
      );
      setLoading(false);
      return;
    }

    const rows = sortMessages(
      ((messagesResult.data || []) as CommunityChatMessage[]).filter(
        (row) => !row.is_deleted
      )
    );
    setMessages(rows);

    const status = statusResult.data as MuteStatus | null;
    setMuted(
      status?.is_muted
        ? { is_muted: true, muted_reason: status.muted_reason || null }
        : null
    );

    await resolveNames(rows.map((row) => row.user_id));
    setLoading(false);
  }, [resolveNames, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(COMMUNITY_CHAT_REALTIME_TOPIC)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_chat_messages" },
        (payload) => {
          const row = payload.new as CommunityChatMessage;
          if (!row?.id || row.is_deleted) return;
          setMessages((previous) => {
            if (previous.some((message) => message.id === row.id)) return previous;
            return sortMessages([...previous, row]);
          });
          void resolveNames([row.user_id]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "community_chat_messages" },
        (payload) => {
          const row = payload.new as CommunityChatMessage;
          if (row?.is_deleted && row.id) removeMessage(row.id);
        }
      )
      .on("broadcast", { event: "message_deleted" }, (payload) => {
        const id = (payload.payload as { message_id?: string } | null)?.message_id;
        if (id) removeMessage(id);
      })
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      setConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [removeMessage, resolveNames, supabase, userId]);

  useEffect(() => {
    const element = listRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length, loading]);

  async function sendMessage() {
    if (!userId || sending || muted?.is_muted) return;

    const clean = text.trim();
    if (!clean) {
      setComposerError("Pesan tidak boleh kosong.");
      return;
    }
    if (clean.length > COMMUNITY_CHAT_MAX_LENGTH) {
      setComposerError("Pesan maksimal 1000 karakter.");
      return;
    }

    setSending(true);
    setComposerError(null);

    try {
      const { data, error } = await supabase.rpc("post_community_chat_message", {
        p_user_id: userId,
        p_message: clean,
      });

      if (error) {
        const message = chatErrorMessage(error.message);
        const reason = chatMutedReason(error.message);
        if (reason !== null) {
          setMuted({ is_muted: true, muted_reason: reason || null });
        }
        setComposerError(message);
        toast.show(message, "error");
        return;
      }

      setText("");

      if (data) {
        const { data: row } = await supabase
          .from("community_chat_messages")
          .select("id,user_id,message,is_deleted,created_at")
          .eq("id", String(data))
          .maybeSingle();

        if (row && !row.is_deleted) {
          const saved = row as CommunityChatMessage;
          setMessages((previous) =>
            previous.some((message) => message.id === saved.id)
              ? previous
              : sortMessages([...previous, saved])
          );
          void resolveNames([saved.user_id]);
        }
      }
    } catch {
      const message = "Jaringan gagal. Periksa koneksi lalu coba lagi.";
      setComposerError(message);
      toast.show(message, "error");
    } finally {
      setSending(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || actionBusy) return;
    setActionBusy(true);

    try {
      const response = await fetch(
        `/api/community-chat/messages/${deleteTarget.id}/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: deleteReason.trim() || null }),
        }
      );
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.show(chatAdminErrorMessage(json.message || ""), "error");
        return;
      }

      removeMessage(deleteTarget.id);
      setDeleteTarget(null);
      setDeleteReason("");
      toast.show("Pesan berhasil dihapus dari ruang diskusi.", "success");
    } catch {
      toast.show("Jaringan gagal. Periksa koneksi lalu coba lagi.", "error");
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmMute() {
    if (!muteTarget || actionBusy) return;

    const reason = muteReason.trim();
    if (!reason) {
      setMuteReasonError("Alasan wajib diisi saat membisukan pengguna.");
      return;
    }

    setActionBusy(true);
    setMuteReasonError(null);

    try {
      const response = await fetch("/api/admin/chat-moderation/mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: muteTarget.user_id,
          muted: true,
          reason,
        }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.show(chatAdminErrorMessage(json.message || ""), "error");
        return;
      }

      setMuteTarget(null);
      setMuteReason("");
      toast.show("Pengguna dibisukan dari ruang diskusi.", "success");
    } catch {
      toast.show("Jaringan gagal. Periksa koneksi lalu coba lagi.", "error");
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-app-kicker">
            Komunitas AIDIL STORE
          </p>
          <h1 className="mt-1 text-2xl font-black text-app-text sm:text-3xl">Ruang Diskusi</h1>
          <p className="mt-1 max-w-xl text-sm leading-6 text-app-muted">
            Satu ruang untuk semua pengguna. Jaga sopan santun dan jangan membagikan data pribadi.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-app-border bg-app-surface px-3 py-1.5 text-xs font-bold text-app-muted">
          <span
            aria-hidden
            className={`h-2 w-2 rounded-full ${connected ? "bg-success-500" : "bg-warning-500"}`}
          />
          {connected ? "Tersambung live" : "Menghubungkan..."}
        </span>
      </div>

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : loadError ? (
        <ErrorState
          title="Ruang Diskusi belum bisa dimuat"
          description={loadError}
          onRetry={() => void load()}
        />
      ) : (
        <>
          <section className="overflow-hidden rounded-3xl border border-app-border bg-app-surface shadow-sm">
            <div
              ref={listRef}
              className="h-[54vh] min-h-[300px] space-y-3 overflow-y-auto p-4 sm:h-[58vh]"
              aria-live="polite"
            >
              {messages.length === 0 ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center">
                  <p className="text-sm font-bold text-app-text">Belum ada pesan.</p>
                  <p className="mt-1 text-sm text-app-subtle">Jadilah yang pertama memulai percakapan.</p>
                </div>
              ) : (
                messages.map((message) => {
                  const mine = message.user_id === userId;
                  const name = mine ? "Anda" : names[message.user_id] || "Pengguna";
                  return (
                    <div
                      key={message.id}
                      className={`flex ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[86%] rounded-2xl px-4 py-3 sm:max-w-[75%] ${
                          mine
                            ? "border border-gold-400/35 bg-gold-400/15"
                            : "border border-app-border bg-app-inset"
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span
                            className={`text-[11px] font-black ${
                              mine ? "text-app-kicker" : "text-app-text"
                            }`}
                          >
                            {name}
                          </span>
                          <span className="text-[10px] text-app-subtle">
                            {formatChatTime(message.created_at)}
                          </span>
                          {isAdmin && !mine && (
                            <button
                              type="button"
                              aria-label={`Moderasi pesan ${name}`}
                              onClick={() => setActionTarget(message)}
                              className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-app-subtle transition hover:bg-app-surface hover:text-app-text"
                            >
                              ⋯
                            </button>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-app-text">
                          {message.message}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <div className="sticky bottom-[76px] z-30 mt-3 rounded-3xl border border-app-border bg-app-surface/95 p-3 shadow-lg backdrop-blur md:bottom-4">
            {muted?.is_muted ? (
              <p
                role="status"
                className="rounded-2xl border border-danger-400/30 bg-danger-500/10 px-4 py-3 text-sm font-bold text-danger-600 dark:text-danger-400"
              >
                {mutedChatMessage(muted.muted_reason)}
              </p>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
              >
                <label htmlFor="community-chat-input" className="sr-only">
                  Tulis pesan
                </label>
                <textarea
                  id="community-chat-input"
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    if (composerError) setComposerError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  maxLength={COMMUNITY_CHAT_MAX_LENGTH}
                  rows={2}
                  disabled={sending}
                  placeholder="Tulis pesan untuk ruang diskusi..."
                  className="w-full resize-none rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20 disabled:opacity-60"
                />
                {composerError && (
                  <p role="alert" className="mt-1.5 text-xs font-medium text-danger-600 dark:text-danger-400">
                    {composerError}
                  </p>
                )}
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-app-subtle">
                    Enter kirim, Shift+Enter baris baru · {text.length}/{COMMUNITY_CHAT_MAX_LENGTH}
                  </p>
                  <Button type="submit" size="sm" loading={sending} disabled={!text.trim()}>
                    Kirim
                  </Button>
                </div>
              </form>
            )}
          </div>
        </>
      )}

      {actionTarget && (
        <ChatModal title="Moderasi pesan" onClose={() => setActionTarget(null)}>
          <p className="mt-2 line-clamp-3 rounded-xl bg-app-inset px-3 py-2 text-sm text-app-muted">
            {actionTarget.message}
          </p>
          <div className="mt-4 space-y-2">
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                setDeleteTarget(actionTarget);
                setActionTarget(null);
                setDeleteReason("");
              }}
            >
              Hapus pesan
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setMuteTarget(actionTarget);
                setActionTarget(null);
                setMuteReason("");
                setMuteReasonError(null);
              }}
            >
              Bisukan pengguna ini
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setActionTarget(null)}>
              Batal
            </Button>
          </div>
        </ChatModal>
      )}

      {deleteTarget && (
        <ChatModal title="Hapus pesan ini?" onClose={() => setDeleteTarget(null)}>
          <p className="mt-2 line-clamp-3 rounded-xl bg-app-inset px-3 py-2 text-sm text-app-muted">
            {deleteTarget.message}
          </p>
          <label htmlFor="delete-chat-reason" className="mt-4 block text-sm font-bold text-app-text">
            Alasan (opsional)
          </label>
          <textarea
            id="delete-chat-reason"
            value={deleteReason}
            onChange={(event) => setDeleteReason(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Contoh: mengandung ujaran kebencian"
            className="mt-2 w-full resize-none rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"
          />
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              loading={actionBusy}
              onClick={() => void confirmDelete()}
            >
              Hapus
            </Button>
          </div>
        </ChatModal>
      )}

      {muteTarget && (
        <ChatModal title="Bisukan pengguna ini?" onClose={() => setMuteTarget(null)}>
          <p className="mt-2 text-sm text-app-muted">
            {names[muteTarget.user_id] || "Pengguna ini"} tidak akan bisa mengirim pesan sampai dibuka oleh admin.
          </p>
          <label htmlFor="mute-chat-reason" className="mt-4 block text-sm font-bold text-app-text">
            Alasan <span className="text-danger-500">*</span>
          </label>
          <textarea
            id="mute-chat-reason"
            value={muteReason}
            onChange={(event) => {
              setMuteReason(event.target.value);
              if (muteReasonError) setMuteReasonError(null);
            }}
            maxLength={500}
            rows={3}
            placeholder="Alasan pembisuan wajib diisi"
            className="mt-2 w-full resize-none rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"
          />
          {muteReasonError && (
            <p role="alert" className="mt-1.5 text-xs font-medium text-danger-600 dark:text-danger-400">
              {muteReasonError}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setMuteTarget(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              loading={actionBusy}
              onClick={() => void confirmMute()}
            >
              Bisukan
            </Button>
          </div>
        </ChatModal>
      )}
    </div>
  );
}
