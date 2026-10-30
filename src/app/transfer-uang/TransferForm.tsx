"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ToastProvider";
import { calcTransferFee } from "@/lib/transfer/utils";
import { formatRupiah } from "@/lib/utils";
import Icon from "@/components/icons/Icon";

type Settings = {
  enabled: boolean;
  fee_type: "FIXED" | "PERCENTAGE";
  fee_value: number;
  min_transfer: number;
  max_transfer: number;
  daily_limit: number;
  monthly_limit: number;
  used_today: number;
  used_this_month: number;
  balance: number;
};

type Recipient = { recipient_id: string; display_name: string; via: "qr" | "search" | "contact" };
type SearchResult = { recipient_id: string; display_name_masked: string; email_masked: string; phone_masked: string | null };
type Contact = { contact_user_id: string; alias: string | null; display_name: string; avatar_url: string | null };
type TransferResult = { transfer_number?: string | null; amount: number; fee?: number; total?: number; recipient_name?: string; message: string };

const QUICK_AMOUNTS = [10000, 25000, 50000, 100000];

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `trf-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs font-bold text-app-muted">{label}</span>
      <span className={`text-sm font-black ${strong ? "text-app-kicker" : "text-app-text"}`}>{value}</span>
    </div>
  );
}

export default function TransferForm({ initialQr, initialAmount }: { initialQr: string | null; initialAmount: number | null }) {
  const toast = useToast();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsError, setSettingsError] = useState("");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [qrNotice, setQrNotice] = useState("");
  const [qrLoading, setQrLoading] = useState(Boolean(initialQr));

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searchError, setSearchError] = useState("");
  const [savedFavorite, setSavedFavorite] = useState(false);

  const [amount, setAmount] = useState(initialAmount ? String(initialAmount) : "");
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TransferResult | null>(null);

  // Key idempotensi stabil per percobaan: retry setelah gagal jaringan
  // memakai key yang sama sehingga tidak membuat transfer ganda.
  const idemRef = useRef<string>("");
  if (!idemRef.current) idemRef.current = newIdempotencyKey();

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/transfer/settings");
      const json = await res.json();
      if (!res.ok) { setSettingsError(json.message || "Gagal memuat pengaturan transfer."); return; }
      setSettings(json);
      setSettingsError("");
    } catch {
      setSettingsError("Gagal memuat pengaturan transfer. Periksa koneksi Anda.");
    }
  }, []);

  const loadContacts = useCallback(async () => {
    try {
      const res = await fetch("/api/transfer/contacts");
      if (!res.ok) return;
      const json = await res.json();
      setContacts(json.contacts || []);
    } catch {
      // Daftar favorit bersifat opsional.
    }
  }, []);

  useEffect(() => { loadSettings(); loadContacts(); }, [loadSettings, loadContacts]);

  useEffect(() => {
    if (!initialQr) return;
    let active = true;
    (async () => {
      setQrLoading(true);
      try {
        const res = await fetch(`/api/transfer/qr/resolve?token=${encodeURIComponent(initialQr)}`);
        const json = await res.json();
        if (!active) return;
        if (!res.ok) { setQrNotice(json.message || "QR tidak valid atau sudah tidak berlaku."); return; }
        if (json.is_self) { setQrNotice("QR ini milik akun Anda sendiri. Gunakan QR pengguna lain untuk menerima saldo."); return; }
        setRecipient({ recipient_id: json.recipient.recipient_id, display_name: json.recipient.display_name, via: "qr" });
        setQrNotice("");
      } catch {
        if (active) setQrNotice("Gagal membaca QR. Coba muat ulang halaman.");
      } finally {
        if (active) setQrLoading(false);
      }
    })();
    return () => { active = false; };
  }, [initialQr]);

  async function handleSearch() {
    const q = query.trim();
    if (q.length < 3) { setSearchError("Masukkan minimal 3 karakter (email atau nomor HP)."); return; }
    setSearching(true);
    setSearchError("");
    setSearchResult(null);
    setSavedFavorite(false);
    try {
      const res = await fetch(`/api/transfer/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) { setSearchError(json.message || "Penerima tidak ditemukan."); return; }
      setSearchResult(json.recipient);
    } catch {
      setSearchError("Koneksi bermasalah saat mencari penerima.");
    } finally {
      setSearching(false);
    }
  }

  function chooseSearchResult() {
    if (!searchResult) return;
    setRecipient({ recipient_id: searchResult.recipient_id, display_name: searchResult.display_name_masked, via: "search" });
    setSearchResult(null);
    setQuery("");
    setSavedFavorite(false);
  }

  async function saveFavorite() {
    if (!recipient) return;
    try {
      const res = await fetch("/api/transfer/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_user_id: recipient.recipient_id }),
      });
      const json = await res.json();
      if (!res.ok) { toast.show(json.message || "Gagal menyimpan favorit.", "error"); return; }
      toast.show("Kontak favorit disimpan.", "success");
      setSavedFavorite(true);
      loadContacts();
    } catch {
      toast.show("Koneksi bermasalah.", "error");
    }
  }

  async function removeContact(id: string) {
    try {
      const res = await fetch("/api/transfer/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_user_id: id }),
      });
      if (!res.ok) { const json = await res.json(); toast.show(json.message || "Gagal menghapus kontak.", "error"); return; }
      if (recipient?.recipient_id === id) setRecipient(null);
      loadContacts();
    } catch {
      toast.show("Koneksi bermasalah.", "error");
    }
  }

  const amountNumber = Number(amount || 0) || 0;
  const fee = settings ? calcTransferFee(settings.fee_type, settings.fee_value, amountNumber) : 0;
  const total = amountNumber + fee;
  const remainingDaily = settings ? Math.max(settings.daily_limit - settings.used_today, 0) : 0;
  const remainingMonthly = settings ? Math.max(settings.monthly_limit - settings.used_this_month, 0) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!settings || !settings.enabled) { setError("Fitur transfer saldo sedang dinonaktifkan sementara."); return; }
    if (!recipient) { setError("Pilih penerima transfer terlebih dahulu."); return; }
    if (amountNumber <= 0) { setError("Masukkan nominal transfer."); return; }
    if (amountNumber < settings.min_transfer) { setError(`Minimal transfer ${formatRupiah(settings.min_transfer)}.`); return; }
    if (amountNumber > settings.max_transfer) { setError(`Maksimal transfer ${formatRupiah(settings.max_transfer)} per transaksi.`); return; }
    if (amountNumber > remainingDaily) { setError(`Melebihi limit harian. Sisa limit hari ini ${formatRupiah(remainingDaily)}.`); return; }
    if (amountNumber > remainingMonthly) { setError(`Melebihi limit bulanan. Sisa limit bulan ini ${formatRupiah(remainingMonthly)}.`); return; }
    if (total > settings.balance) { setError("Saldo Anda tidak mencukupi (termasuk biaya admin)."); return; }
    if (!pin.trim()) { setError("Masukkan PIN transaksi."); return; }

    setBusy(true);
    try {
      const res = await fetch("/api/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_id: recipient.recipient_id,
          amount: amountNumber,
          note: note.trim() ? note.trim() : undefined,
          pin: pin.trim(),
          idempotency_key: idemRef.current,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.message || "Transfer gagal. Coba lagi."); return; }
      setResult(json);
      setPin("");
      setNote("");
      idemRef.current = newIdempotencyKey();
      loadSettings();
    } catch {
      setError("Koneksi bermasalah. Transfer mungkin belum terkirim — tekan Kirim Transfer sekali lagi dengan data yang sama, sistem mencegah transfer ganda.");
    } finally {
      setBusy(false);
    }
  }

  async function copyReceipt() {
    if (!result) return;
    const text = [
      "AIDIL STORE - Bukti Transfer Saldo",
      `No. Referensi: ${result.transfer_number || "-"}`,
      `Penerima: ${result.recipient_name || recipient?.display_name || "-"}`,
      `Nominal: ${formatRupiah(result.amount)}`,
      `Biaya Admin: ${formatRupiah(result.fee || 0)}`,
      `Total: ${formatRupiah(result.total ?? result.amount)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.show("Bukti transfer disalin.", "success");
    } catch {
      toast.show("Gagal menyalin bukti transfer.", "error");
    }
  }

  if (result) {
    return (
      <section className="rounded-3xl border border-success-500/30 bg-app-surface p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-300"><Icon name="check_circle" size={24} /></span>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-success-600 dark:text-success-400">Transfer Berhasil</p>
            <h2 className="text-xl font-black text-app-text">{result.message}</h2>
          </div>
        </div>

        <div className="mt-4 divide-y divide-app-border rounded-2xl border border-app-border bg-app-inset px-4">
          <Row label="No. Referensi" value={result.transfer_number || "-"} />
          <Row label="Penerima" value={result.recipient_name || recipient?.display_name || "-"} />
          <Row label="Nominal" value={formatRupiah(result.amount)} />
          <Row label="Biaya Admin" value={formatRupiah(result.fee || 0)} />
          <Row label="Total" value={formatRupiah(result.total ?? result.amount)} strong />
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <button type="button" onClick={copyReceipt} className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white"><Icon name="clipboard" size={16} /> Salin Bukti</button>
          <button type="button" onClick={() => setResult(null)} className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-app-border px-4 py-3 text-sm font-bold text-app-muted hover:bg-app-inset"><Icon name="refresh" size={16} /> Transfer Lagi</button>
          <Link href="/wallet" className="btn-gold-metal inline-flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-center text-sm font-black"><Icon name="wallet" size={16} /> Lihat Saldo</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-app-border bg-app-surface p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black text-app-text">Kirim Saldo</h2>
        {settings && (
          <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase ${settings.enabled ? "bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "bg-danger-100 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300"}`}>
            {settings.enabled ? "Aktif" : "Nonaktif"}
          </span>
        )}
      </div>

      {settingsError && <div className="mt-3 rounded-2xl border border-danger-500/30 bg-danger-500/10 p-4 text-sm font-bold text-danger-600 dark:text-danger-400">{settingsError}</div>}
      {!settings && !settingsError && <div className="mt-4 animate-pulse rounded-2xl bg-app-inset p-6 text-sm text-app-muted">Memuat pengaturan transfer...</div>}

      {settings && !settings.enabled && (
        <div className="mt-3 rounded-2xl border border-warning-500/30 bg-warning-500/10 p-4 text-sm text-warning-700 dark:text-warning-300">
          <p className="font-black">Transfer saldo dinonaktifkan sementara</p>
          <p className="mt-1 text-xs leading-5">Admin sedang menonaktifkan fitur transfer. Silakan coba lagi nanti.</p>
        </div>
      )}

      {settings && settings.enabled && (
        <form onSubmit={submit} className="mt-4 space-y-4">
          {qrLoading && <div className="rounded-2xl bg-app-inset p-3 text-sm font-bold text-app-muted">Membaca QR Pribadi...</div>}
          {qrNotice && <div className="rounded-2xl border border-warning-500/30 bg-warning-500/10 p-4 text-sm font-bold text-warning-700 dark:text-warning-300">{qrNotice}</div>}

          {recipient ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-success-500/30 bg-success-500/10 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-gold-200">
                  {recipient.display_name.charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-black text-app-text">{recipient.display_name}</p>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-success-700 dark:text-success-300">
                    {recipient.via === "qr" ? "Dari QR Pribadi" : recipient.via === "contact" ? "Dari kontak favorit" : "Hasil pencarian"}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setRecipient(null)} className="shrink-0 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-xs font-bold text-app-muted hover:bg-app-inset">Ganti</button>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-app-border bg-app-inset p-4">
              {contacts.length > 0 && (
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-app-muted">Kontak Favorit</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {contacts.map((c) => (
                      <span key={c.contact_user_id} className="flex items-center overflow-hidden rounded-xl border border-gold-200 bg-app-surface">
                        <button
                          type="button"
                          onClick={() => setRecipient({ recipient_id: c.contact_user_id, display_name: c.alias || c.display_name, via: "contact" })}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-black text-app-text hover:bg-app-accent-soft"
                        >
                          <Icon name="star_fill" size={16} /> {c.alias || c.display_name}
                        </button>
                        <button type="button" onClick={() => removeContact(c.contact_user_id)} aria-label="Hapus kontak" className="border-l border-app-border px-2 py-2 text-xs font-bold text-app-muted hover:bg-danger-500/10 hover:text-danger-600 dark:hover:text-danger-400"><Icon name="close" size={14} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-black uppercase tracking-wide text-app-muted">Cari Penerima (email / nomor HP)</p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
                    placeholder="email@contoh.com atau 0812xxxxxxx"
                    className="min-w-0 flex-1 rounded-xl border border-app-border bg-app-surface px-3 py-2.5 text-sm text-app-text outline-none placeholder:text-app-subtle focus:border-gold-400 focus:ring-2 focus:ring-gold-400/20"
                  />
                  <button type="button" onClick={handleSearch} disabled={searching} className="shrink-0 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
                    {searching ? "Mencari..." : "Cari"}
                  </button>
                </div>
                {searchError && <p className="mt-2 text-xs font-bold text-danger-600 dark:text-danger-400">{searchError}</p>}
                {searchResult && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-gold-200 bg-app-accent-soft p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-app-text">{searchResult.display_name_masked}</p>
                      <p className="truncate text-xs text-app-muted">
                        {searchResult.email_masked}{searchResult.phone_masked ? ` · ${searchResult.phone_masked}` : ""}
                      </p>
                    </div>
                    <button type="button" onClick={chooseSearchResult} className="btn-gold-metal shrink-0 rounded-xl px-3 py-2 text-xs font-black">Pilih</button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-black uppercase tracking-wide text-app-muted">Nominal Transfer</label>
            <div className="mt-2 flex items-center rounded-xl border border-app-border bg-app-inset px-3">
              <span className="text-sm font-bold text-app-muted">Rp</span>
              <input
                type="text"
                inputMode="numeric"
                value={amount ? Number(amount).toLocaleString("id-ID") : ""}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 12))}
                placeholder="0"
                className="w-full bg-transparent px-2 py-2.5 text-lg font-black text-app-text outline-none placeholder:text-app-subtle"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((v) => (
                <button key={v} type="button" onClick={() => setAmount(String(v))} className="rounded-lg border border-app-border bg-app-surface px-3 py-1.5 text-xs font-bold text-app-muted hover:bg-app-accent-soft">
                  {formatRupiah(v)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wide text-app-muted">Catatan (opsional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={140}
              placeholder="Contoh: bayar utang, jajan, dll."
              className="mt-2 w-full rounded-xl border border-app-border bg-app-inset px-3 py-2.5 text-sm text-app-text outline-none placeholder:text-app-subtle focus:border-gold-400 focus:ring-2 focus:ring-gold-400/20"
            />
          </div>

          {amountNumber > 0 && (
            <div className="divide-y divide-app-border rounded-2xl border border-app-border bg-app-inset px-4">
              <Row label="Biaya Admin" value={fee > 0 ? formatRupiah(fee) : "Gratis"} />
              <Row label="Total Dibayar" value={formatRupiah(total)} strong />
              <Row label="Saldo Tersedia" value={formatRupiah(settings.balance)} />
              <Row label="Sisa Limit Harian" value={formatRupiah(remainingDaily)} />
              <Row label="Sisa Limit Bulanan" value={formatRupiah(remainingMonthly)} />
            </div>
          )}

          {total > settings.balance && amountNumber > 0 && (
            <p className="rounded-xl border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs font-bold text-danger-600 dark:text-danger-400">Saldo tidak mencukupi. Kurangi nominal atau top up terlebih dahulu.</p>
          )}

          {recipient && recipient.via !== "contact" && !savedFavorite && (
            <button type="button" onClick={saveFavorite} className="inline-flex items-center gap-1.5 rounded-xl border border-gold-200 bg-app-accent-soft px-4 py-2.5 text-xs font-black text-app-kicker hover:bg-app-accent-soft">
              <Icon name="star_fill" size={16} /> Simpan {recipient.display_name} ke Kontak Favorit
            </button>
          )}

          <div>
            <label className="text-xs font-black uppercase tracking-wide text-app-muted">PIN Transaksi</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••••"
              className="mt-2 w-full rounded-xl border border-app-border bg-app-inset px-3 py-3 text-center text-xl font-black tracking-[.4em] text-app-text outline-none placeholder:text-app-subtle focus:border-gold-400 focus:ring-2 focus:ring-gold-400/20"
            />
            <p className="mt-1 text-[11px] text-app-muted">Belum punya PIN? Atur PIN transaksi di halaman <Link href="/settings" className="font-bold text-app-kicker">Pengaturan</Link>.</p>
          </div>

          {error && <div className="rounded-2xl border border-danger-500/30 bg-danger-500/10 p-4 text-sm font-bold text-danger-600 dark:text-danger-400">{error}</div>}

          <button type="submit" disabled={busy} className="btn-gold w-full rounded-2xl px-5 py-3.5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "Memproses Transfer..." : "Kirim Transfer"}
          </button>
        </form>
      )}
    </section>
  );
}
