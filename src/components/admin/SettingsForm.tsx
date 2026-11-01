"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { useToast } from "@/components/ToastProvider";
import { formatDate } from "@/lib/utils";
import type { ManagedSettingState, SettingHistoryEntry } from "@/lib/managed-settings";

// Kerangka "Pengaturan Terkelola" yang dipakai semua halaman pengaturan admin.
//
//  - Siklus: draf -> terbitkan; riwayat versi tersimpan di server.
//  - Nilai divalidasi ulang di API (/api/admin/settings/[key]); komponen ini
//    hanya memberi peringatan dini lewat prop `validate`.
//  - Teks dari admin selalu dirender sebagai teks biasa (React), tidak pernah
//    lewat dangerouslySetInnerHTML, jadi tidak ada jalur XSS dari isi form.
//  - Pratinjau memakai lebar 360px, sama dengan ponsel terkecil yang didukung.

export type SettingsFormValue = Record<string, unknown>;

export type SettingsFormRenderArgs<T extends SettingsFormValue> = {
  value: T;
  set: <K extends keyof T & string>(key: K, next: T[K]) => void;
  dirty: boolean;
  /** Simpan nilai pengganti (mis. rekomendasi) sebagai draf baru. */
  saveDraft: (next?: T) => void;
  busy: boolean;
};

export type SettingsFormProps<T extends SettingsFormValue> = {
  settingKey: string;
  title: string;
  description: ReactNode;
  children: (args: SettingsFormRenderArgs<T>) => ReactNode;
  /** Slot pratinjau langsung; kolom 360px hanya dirender bila diisi. */
  renderPreview?: (value: T) => ReactNode;
  previewTitle?: string;
  previewDescription?: ReactNode;
  previewHint?: ReactNode;
  /** Validasi ringan di klien; server tetap memvalidasi ulang. */
  validate?: (value: T) => string | null;
  /**
   * Masalah yang hanya menghalangi Terbitkan (draf tetap boleh disimpan).
   * Server mengulang pemeriksaan yang sama saat action=publish.
   */
  publishError?: (value: T) => string | null;
};

type Action = "save_draft" | "publish" | "discard_draft" | "restore" | "reset_default";

type PendingConfirm =
  | { kind: "discard" }
  | { kind: "reset" }
  | { kind: "restore"; entry: SettingHistoryEntry }
  | { kind: "leave"; href: string }
  | { kind: "conflict" }
  | null;

const SUCCESS_MESSAGE: Record<Action, string> = {
  save_draft: "Draf tersimpan. Pengunjung masih melihat versi yang terbit sebelum ini.",
  publish: "Pengaturan diterbitkan dan langsung tampil tanpa deploy ulang.",
  discard_draft: "Draf dibuang. Formulir kembali ke versi yang sedang terbit.",
  restore: "Versi lama dipulihkan sebagai draf. Tekan Terbitkan untuk menampilkannya.",
  reset_default: "Nilai default disimpan sebagai draf. Tekan Terbitkan untuk menampilkannya.",
};

const HISTORY_ACTION_LABEL: Record<SettingHistoryEntry["action"], string> = {
  publish: "Diterbitkan",
  restore: "Dipulihkan",
};

export default function SettingsForm<T extends SettingsFormValue>({
  settingKey,
  title,
  description,
  children,
  renderPreview,
  previewTitle = "Pratinjau",
  previewDescription,
  previewHint,
  validate,
  publishError,
}: SettingsFormProps<T>) {
  const toast = useToast();
  const router = useRouter();
  const [state, setState] = useState<ManagedSettingState | null>(null);
  const [defaults, setDefaults] = useState<Record<string, unknown>>({});
  const [value, setValue] = useState<T | null>(null);
  const [baseline, setBaseline] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [openHistoryId, setOpenHistoryId] = useState<number | null>(null);

  const applyState = useCallback(
    (next: ManagedSettingState, baseDefaults: Record<string, unknown>) => {
      const base = { ...baseDefaults, ...(next.draft ?? next.published) } as T;
      setState(next);
      setValue(base);
      setBaseline(JSON.stringify(base));
      setOpenHistoryId(null);
    },
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/settings/${encodeURIComponent(settingKey)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.state) {
        setLoadError(json?.message || "Gagal memuat pengaturan.");
        return;
      }
      const nextDefaults = (json.defaults ?? {}) as Record<string, unknown>;
      setDefaults(nextDefaults);
      applyState(json.state as ManagedSettingState, nextDefaults);
    } catch {
      setLoadError("Gagal memuat pengaturan. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }, [settingKey, applyState]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(
    () => value !== null && JSON.stringify(value) !== baseline,
    [value, baseline]
  );
  const validationError = useMemo(
    () => (value && validate ? validate(value) : null),
    [value, validate]
  );
  const publishIssue = useMemo(
    () => (value && publishError ? publishError(value) : null),
    [value, publishError]
  );

  // Peringatan pindah halaman: tautan internal dicegat selama ada perubahan
  // yang belum disimpan; tutup/segarkan tab ditangani beforeunload.
  useEffect(() => {
    if (!dirty) return;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      const anchor = target?.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingConfirm({ kind: "leave", href: `${url.pathname}${url.search}${url.hash}` });
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty]);

  async function request(action: Action, extra: Record<string, unknown> = {}) {
    if (!state || !value) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/settings/${encodeURIComponent(settingKey)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, baseVersion: state.version, value, ...extra }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if (json?.code === "VERSION_CONFLICT") {
          setPendingConfirm({ kind: "conflict" });
          return;
        }
        toast.show(json?.message || "Gagal memproses pengaturan. Coba lagi.", "error");
        return;
      }
      applyState(json.state as ManagedSettingState, defaults);
      setPendingConfirm(null);
      toast.show(SUCCESS_MESSAGE[action], "success");
    } catch {
      toast.show("Koneksi gagal. Periksa jaringan Anda lalu coba lagi.", "error");
    } finally {
      setBusy(null);
    }
  }

  function set<K extends keyof T & string>(key: K, next: T[K]) {
    setValue((prev) => (prev ? ({ ...prev, [key]: next } as T) : prev));
  }

  function saveDraft(next?: T) {
    request("save_draft", next ? { value: next } : {});
  }

  function confirmRestore(entry: SettingHistoryEntry) {
    setPendingConfirm({ kind: "restore", entry });
  }

  function handleConfirm() {
    if (!pendingConfirm) return;
    if (pendingConfirm.kind === "discard") {
      request("discard_draft");
    } else if (pendingConfirm.kind === "reset") {
      request("reset_default");
    } else if (pendingConfirm.kind === "restore") {
      request("restore", { historyId: pendingConfirm.entry.id });
    } else if (pendingConfirm.kind === "leave") {
      const href = pendingConfirm.href;
      setPendingConfirm(null);
      router.push(href);
    } else {
      setPendingConfirm(null);
      load();
    }
  }

  const header = (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-app-kicker">PANEL ADMIN</p>
          <h1 className="mt-1 break-words text-xl font-black text-app-text sm:text-2xl">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-app-muted">{description}</p>
          {state && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {dirty && (
                <Badge tone="warning" className="px-2 py-0.5">
                  Belum tersimpan
                </Badge>
              )}
              {state.hasDraft && (
                <Badge tone="gold" className="px-2 py-0.5">
                  Ada draf belum diterbitkan
                </Badge>
              )}
              {!dirty && !state.hasDraft && (
                <Badge tone="success" className="px-2 py-0.5">
                  Tersimpan
                </Badge>
              )}
              <span className="text-xs text-app-subtle">
                Versi tayang {state.version}
                {state.updated_at ? ` · diperbarui ${formatDate(state.updated_at)}` : ""}
                {state.draft && state.draft_updated_at
                  ? ` · draf ${formatDate(state.draft_updated_at)}`
                  : ""}
              </span>
            </div>
          )}
        </div>
        <Button variant="outline" onClick={load} disabled={loading || busy !== null}>
          ↻ Muat ulang
        </Button>
      </div>
    </Card>
  );

  if (loading) {
    return (
      <div className="space-y-5">
        {header}
        <LoadingSkeleton rows={6} />
      </div>
    );
  }

  if (loadError || !state || !value) {
    return (
      <div className="space-y-5">
        {header}
        <Card>
          <p className="text-sm font-bold text-danger-600 dark:text-danger-400">
            {loadError || "Pengaturan tidak dapat dimuat."}
          </p>
          <p className="mt-1 text-sm text-app-muted">
            Halaman publik tetap memakai nilai terakhir yang tersimpan atau default bawaan.
          </p>
          <Button variant="outline" onClick={load} className="mt-3">
            Coba lagi
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}

      <div
        className={
          renderPreview
            ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]"
            : "grid gap-5"
        }
      >
        <div className="min-w-0 space-y-5">
          {children({ value, set, dirty, saveDraft, busy: busy !== null })}

          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => request("save_draft")}
                loading={busy === "save_draft"}
                disabled={!dirty || Boolean(validationError) || busy !== null}
              >
                Simpan Draf
              </Button>
              <Button
                variant="secondary"
                onClick={() => request("publish")}
                loading={busy === "publish"}
                disabled={
                  (!dirty && !state.hasDraft) ||
                  Boolean(validationError) ||
                  Boolean(publishIssue) ||
                  busy !== null
                }
              >
                Terbitkan
              </Button>
              <Button
                variant="outline"
                onClick={() => setPendingConfirm({ kind: "discard" })}
                disabled={!state.hasDraft || busy !== null}
              >
                Buang Draf
              </Button>
              <Button
                variant="ghost"
                onClick={() => setPendingConfirm({ kind: "reset" })}
                disabled={busy !== null}
              >
                Kembalikan Default
              </Button>
            </div>
            {validationError && (
              <p className="mt-3 text-xs font-bold text-danger-600 dark:text-danger-400">
                {validationError}
              </p>
            )}
            {publishIssue && (
              <p className="mt-3 rounded-xl border border-warning-400/40 bg-warning-50 px-3 py-2 text-xs font-bold leading-5 text-warning-800 dark:bg-warning-500/10 dark:text-warning-300">
                {publishIssue} Draf tetap bisa disimpan.
              </p>
            )}
            <p className="mt-3 text-xs leading-5 text-app-subtle">
              Draf hanya terlihat oleh admin. Pengunjung melihat versi terbit sampai Anda menekan
              Terbitkan; versi lama tetap tersimpan di Riwayat Versi.
            </p>
          </Card>
        </div>

        <div className="min-w-0 space-y-5 lg:sticky lg:top-5 lg:self-start">
          {renderPreview && (
            <Card>
              <CardTitle>{previewTitle}</CardTitle>
              {previewDescription && <CardDescription>{previewDescription}</CardDescription>}
              <div className="mt-3 flex justify-center">
                <div className="w-full min-w-0 max-w-[360px]">{renderPreview(value)}</div>
              </div>
              {previewHint && <div className="mt-3 text-xs leading-5 text-app-subtle">{previewHint}</div>}
            </Card>
          )}

          <Card>
            <CardTitle>Riwayat Versi</CardTitle>
            <CardDescription>
              30 versi terakhir. Memulihkan versi lama selalu membuat draf baru, belum langsung
              tampil sampai Anda menerbitkannya.
            </CardDescription>
            {state.history.length === 0 ? (
              <p className="mt-3 rounded-xl bg-app-inset px-3 py-2 text-xs text-app-muted">
                Belum ada versi yang diterbitkan. Versi pertama muncul setelah Anda menekan
                Terbitkan.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {state.history.map((entry) => {
                  const isOpen = openHistoryId === entry.id;
                  return (
                    <li key={entry.id} className="rounded-2xl border border-app-border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-black text-app-text">
                            Versi {entry.version}
                            {entry.action === "publish" && entry.version === state.version
                              ? " · sedang tampil"
                              : ""}
                          </p>
                          <p className="mt-0.5 text-xs text-app-subtle">
                            {formatDate(entry.created_at)} · {entry.created_by_name || "Admin"} ·{" "}
                            {HISTORY_ACTION_LABEL[entry.action]}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setOpenHistoryId(isOpen ? null : entry.id)}
                          >
                            {isOpen ? "Tutup isi" : "Lihat isi"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => confirmRestore(entry)}
                            disabled={busy !== null}
                          >
                            Pulihkan versi ini
                          </Button>
                        </div>
                      </div>
                      {isOpen && (
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-app-inset p-3 text-xs leading-5 text-app-text">
                          {JSON.stringify(entry.value, null, 2)}
                        </pre>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {pendingConfirm?.kind === "discard" && (
        <ConfirmDialog
          title="Buang draf?"
          confirmLabel="Buang Draf"
          danger
          busy={busy === "discard_draft"}
          onConfirm={handleConfirm}
          onCancel={() => setPendingConfirm(null)}
        >
          Draf yang belum diterbitkan akan dihapus. Versi yang sedang terbit tidak berubah.
        </ConfirmDialog>
      )}

      {pendingConfirm?.kind === "reset" && (
        <ConfirmDialog
          title="Kembalikan ke default?"
          confirmLabel="Kembalikan Default"
          busy={busy === "reset_default"}
          onConfirm={handleConfirm}
          onCancel={() => setPendingConfirm(null)}
        >
          Semua isian kembali ke nilai bawaan dan disimpan sebagai draf. Pengunjung baru melihatnya
          setelah Anda menekan Terbitkan.
        </ConfirmDialog>
      )}

      {pendingConfirm?.kind === "restore" && (
        <ConfirmDialog
          title={`Pulihkan versi ${pendingConfirm.entry.version}?`}
          confirmLabel="Pulihkan sebagai draf"
          busy={busy === "restore"}
          onConfirm={handleConfirm}
          onCancel={() => setPendingConfirm(null)}
        >
          Isi versi dari {formatDate(pendingConfirm.entry.created_at)} akan menjadi draf baru.
          Versi yang sedang terbit tetap tampil sampai Anda menerbitkan draf tersebut.
        </ConfirmDialog>
      )}

      {pendingConfirm?.kind === "leave" && (
        <ConfirmDialog
          title="Perubahan belum disimpan"
          confirmLabel="Tinggalkan halaman"
          danger
          onConfirm={handleConfirm}
          onCancel={() => setPendingConfirm(null)}
        >
          Perubahan pada formulir ini akan hilang bila Anda pindah halaman. Simpan draf terlebih
          dahulu bila ingin melanjutkannya nanti.
        </ConfirmDialog>
      )}

      {pendingConfirm?.kind === "conflict" && (
        <ConfirmDialog
          title="Pengaturan sudah diubah admin lain"
          confirmLabel="Muat ulang pengaturan"
          onConfirm={handleConfirm}
          onCancel={() => setPendingConfirm(null)}
        >
          Ada admin lain yang menyimpan atau menerbitkan pengaturan ini lebih dulu. Muat ulang untuk
          melihat versi terbaru; perubahan yang belum tersimpan di formulir ini akan dibuang.
        </ConfirmDialog>
      )}
    </div>
  );
}
