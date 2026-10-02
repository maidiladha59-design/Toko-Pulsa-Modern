"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { calcEqualShares, equalSplitRemainder, type SplitMode } from "@/lib/splitbill/utils";
import { formatRupiah } from "@/lib/utils";

type Bill = {
  id: string;
  bill_number: string;
  title: string;
  total_amount: number;
  split_mode: SplitMode;
  status: "ACTIVE" | "COMPLETED";
  is_creator: boolean;
  created_at: string;
  completed_at: string | null;
  participant_count: number;
  paid_count: number;
  collected_amount: number;
};

type Contact = { contact_user_id: string; alias: string | null; display_name: string; avatar_url: string | null };
type SearchResult = { recipient_id: string; display_name_masked: string; email_masked: string; phone_masked: string | null };
type Selected = { user_id: string; display_name: string; share: string };

const MAX_PARTICIPANTS = 20;

export default function SplitBillClient() {
  const toast = useToast();
  const router = useRouter();

  const [bills, setBills] = useState<Bill[] | null>(null);
  const [billsError, setBillsError] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("");
  const [mode, setMode] = useState<SplitMode>("EQUAL");
  const [selected, setSelected] = useState<Selected[]>([]);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searchError, setSearchError] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadBills = useCallback(async () => {
    try {
      const res = await fetch("/api/split-bills");
      if (!res.ok) { const json = await res.json(); setBillsError(json.message || "Gagal memuat tagihan."); return; }
      const json = await res.json();
      setBills(json.bills || []);
      setBillsError("");
    } catch {
      setBillsError("Gagal memuat tagihan. Periksa koneksi Anda.");
    }
  }, []);

  const loadContacts = useCallback(async () => {
    try {
      const res = await fetch("/api/transfer/contacts");
      if (!res.ok) return;
      const json = await res.json();
      setContacts(json.contacts || []);
    } catch {
      // Kontak favorit bersifat opsional.
    }
  }, []);

  useEffect(() => { loadBills(); loadContacts(); }, [loadBills, loadContacts]);

  function addParticipant(user_id: string, display_name: string) {
    if (selected.some((p) => p.user_id === user_id)) { toast.show("Peserta sudah dipilih.", "error"); return; }
    if (selected.length >= MAX_PARTICIPANTS) { toast.show(`Maksimal ${MAX_PARTICIPANTS} peserta per tagihan.`, "error"); return; }
    setSelected((prev) => [...prev, { user_id, display_name, share: "" }]);
  }

  async function handleSearch() {
    const q = query.trim();
    if (q.length < 3) { setSearchError("Masukkan minimal 3 karakter (email atau nomor HP)."); return; }
    setSearching(true);
    setSearchError("");
    setSearchResult(null);
    try {
      const res = await fetch(`/api/transfer/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) { setSearchError(json.message || "Penerima tidak ditemukan."); return; }
      setSearchResult(json.recipient);
    } catch {
      setSearchError("Koneksi bermasalah saat mencari peserta.");
    } finally {
      setSearching(false);
    }
  }

  const totalNumber = Number(total || 0) || 0;
  const shares = mode === "EQUAL" && totalNumber > 0 && selected.length > 0
    ? calcEqualShares(totalNumber, selected.length)
    : [];
  const remainder = mode === "EQUAL" ? equalSplitRemainder(totalNumber, selected.length) : 0;
  const customSum = selected.reduce((acc, p) => acc + (Number(p.share || 0) || 0), 0);
  const customRemaining = totalNumber - customSum;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (title.trim().length < 3) { setError("Judul tagihan minimal 3 karakter."); return; }
    if (totalNumber <= 0) { setError("Masukkan total tagihan."); return; }
    if (selected.length < 1) { setError("Pilih minimal 1 peserta."); return; }
    if (mode === "CUSTOM") {
      if (selected.some((p) => !p.share || (Number(p.share) || 0) <= 0)) { setError("Isi nominal bagian setiap peserta."); return; }
      if (customSum !== totalNumber) { setError(`Jumlah bagian (${formatRupiah(customSum)}) harus sama dengan total tagihan (${formatRupiah(totalNumber)}).`); return; }
    }

    setBusy(true);
    try {
      const res = await fetch("/api/split-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          total_amount: totalNumber,
          mode,
          participants: selected.map((p) => (
            mode === "CUSTOM" ? { user_id: p.user_id, share_amount: Number(p.share) } : { user_id: p.user_id }
          )),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.message || "Gagal membuat tagihan."); return; }
      toast.show("Tagihan patungan dibuat.", "success");
      router.push(`/split-bill/${json.bill_id}`);
    } catch {
      setError("Koneksi bermasalah. Tagihan mungkin belum dibuat — cek daftar tagihan sebelum membuat ulang.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-black text-slate-900">Buat Tagihan Patungan</h2>
        <p className="mt-1 text-sm text-slate-500">Setiap peserta menerima permintaan bayar ke Anda dan membayar lewat transfer saldo (dengan PIN, biaya admin, dan limit transfer).</p>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-black uppercase tracking-wide text-slate-400">Judul Tagihan</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="Contoh: Makan malam tim, Sewa lapangan..."
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wide text-slate-400">Total Tagihan</label>
            <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3">
              <span className="text-sm font-bold text-slate-400">Rp</span>
              <input
                type="text"
                inputMode="numeric"
                value={total ? Number(total).toLocaleString("id-ID") : ""}
                onChange={(e) => setTotal(e.target.value.replace(/\D/g, "").slice(0, 12))}
                placeholder="0"
                className="w-full bg-transparent px-2 py-2.5 text-lg font-black text-slate-900 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wide text-slate-400">Cara Pembagian</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("EQUAL")}
                className={`rounded-xl border px-3 py-2.5 text-sm font-black ${mode === "EQUAL" ? "border-gold-500 bg-gold-50 text-gold-700" : "border-slate-200 bg-white text-slate-600"}`}
              >
                ⚖️ Dibagi Rata
              </button>
              <button
                type="button"
                onClick={() => setMode("CUSTOM")}
                className={`rounded-xl border px-3 py-2.5 text-sm font-black ${mode === "CUSTOM" ? "border-gold-500 bg-gold-50 text-gold-700" : "border-slate-200 bg-white text-slate-600"}`}
              >
                ✏️ Nominal Custom
              </button>
            </div>
            {mode === "EQUAL" && remainder > 0 && selected.length > 0 && (
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                Total tidak habis dibagi rata — sisa {formatRupiah(remainder)} dibebankan ke peserta pertama dalam daftar.
              </p>
            )}
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            {contacts.length > 0 && (
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Kontak Favorit</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {contacts.map((c) => (
                    <button
                      key={c.contact_user_id}
                      type="button"
                      onClick={() => addParticipant(c.contact_user_id, c.alias || c.display_name)}
                      className="rounded-xl border border-gold-200 bg-white px-3 py-2 text-xs font-black text-slate-800 hover:bg-gold-50"
                    >
                      ⭐ {c.alias || c.display_name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Cari Peserta (email / nomor HP)</p>
              <div className="mt-2 flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
                  placeholder="email@contoh.com atau 0812xxxxxxx"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                />
                <button type="button" onClick={handleSearch} disabled={searching} className="shrink-0 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
                  {searching ? "Mencari..." : "Cari"}
                </button>
              </div>
              {searchError && <p className="mt-2 text-xs font-bold text-red-600">{searchError}</p>}
              {searchResult && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-gold-200 bg-gold-50 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{searchResult.display_name_masked}</p>
                    <p className="truncate text-xs text-slate-500">
                      {searchResult.email_masked}{searchResult.phone_masked ? ` · ${searchResult.phone_masked}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { addParticipant(searchResult.recipient_id, searchResult.display_name_masked); setSearchResult(null); setQuery(""); }}
                    className="shrink-0 rounded-xl bg-gold-600 px-3 py-2 text-xs font-black text-white hover:bg-gold-700"
                  >
                    Tambah
                  </button>
                </div>
              )}
            </div>

            {selected.length > 0 && (
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Peserta ({selected.length})</p>
                <div className="mt-2 space-y-2">
                  {selected.map((p, i) => (
                    <div key={p.user_id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-yellow-300">
                        {p.display_name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-slate-900">{p.display_name}</p>
                        <p className="text-[11px] font-bold text-slate-400">
                          {mode === "EQUAL"
                            ? shares.length > 0 ? `Bagian: ${formatRupiah(shares[i] || 0)}${i === 0 && remainder > 0 ? " (termasuk sisa pembagian)" : ""}` : "Bagian dihitung setelah total diisi"
                            : "Nominal custom"}
                        </p>
                      </div>
                      {mode === "CUSTOM" && (
                        <div className="flex shrink-0 items-center rounded-lg border border-slate-200 bg-slate-50 px-2">
                          <span className="text-[11px] font-bold text-slate-400">Rp</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={p.share ? Number(p.share).toLocaleString("id-ID") : ""}
                            onChange={(e) => setSelected((prev) => prev.map((q, j) => (j === i ? { ...q, share: e.target.value.replace(/\D/g, "").slice(0, 12) } : q)))}
                            placeholder="0"
                            className="w-24 bg-transparent px-1 py-1.5 text-sm font-black text-slate-900 outline-none"
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelected((prev) => prev.filter((_, j) => j !== i))}
                        aria-label="Hapus peserta"
                        className="shrink-0 rounded-lg px-2 py-2 text-xs font-bold text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                {mode === "CUSTOM" && (
                  <p className={`mt-2 rounded-xl px-3 py-2 text-xs font-bold ${customRemaining === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                    {customRemaining === 0
                      ? "Semua bagian teralokasi — jumlahnya sama dengan total tagihan."
                      : customRemaining > 0
                        ? `Belum teralokasi: ${formatRupiah(customRemaining)}.`
                        : `Kelebihan alokasi: ${formatRupiah(-customRemaining)}.`}
                  </p>
                )}
              </div>
            )}
          </div>

          {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-gold-500 px-4 py-3.5 text-sm font-black text-slate-950 hover:bg-gold-400 disabled:opacity-50"
          >
            {busy ? "Membuat tagihan..." : "🧾 Buat Tagihan Patungan"}
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-black text-slate-900">Tagihan Saya</h2>
        {billsError && <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{billsError}</div>}
        {!bills && !billsError && <div className="mt-4 animate-pulse rounded-2xl bg-slate-100 p-6 text-sm text-slate-400">Memuat tagihan...</div>}
        {bills && bills.length === 0 && (
          <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada tagihan patungan. Buat tagihan pertama Anda di atas.</p>
        )}
        {bills && bills.length > 0 && (
          <div className="mt-4 space-y-3">
            {bills.map((b) => {
              const progress = b.total_amount > 0 ? Math.min(Math.round((b.collected_amount / b.total_amount) * 100), 100) : 0;
              return (
                <a
                  key={b.id}
                  href={`/split-bill/${b.id}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-4 hover:border-gold-300 hover:bg-gold-50/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{b.title}</p>
                      <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                        {b.bill_number} · {b.is_creator ? "Anda pembuat" : "Anda peserta"}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black uppercase ${b.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {b.status === "COMPLETED" ? "Selesai" : "Aktif"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Terkumpul</p>
                      <p className="text-sm font-black text-slate-900">{formatRupiah(b.collected_amount)} <span className="text-xs font-bold text-slate-400">/ {formatRupiah(b.total_amount)}</span></p>
                    </div>
                    <p className="text-xs font-bold text-slate-500">{b.paid_count}/{b.participant_count} bayar</p>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gold-500" style={{ width: `${progress}%` }} />
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
