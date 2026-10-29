"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import InfoTicker from "@/components/InfoTicker";
import { useToast } from "@/components/ToastProvider";
import { formatDate } from "@/lib/utils";
import {
  TICKER_GAP_MAX,
  TICKER_GAP_MIN,
  TICKER_SPEED_MAX,
  TICKER_SPEED_MIN,
  TICKER_TEXT_MAX,
  isAllowedTickerLink,
  tickerShouldRender,
  type InfoTickerSettings,
} from "@/lib/info-ticker";

// Panel "Info Berjalan": satu-satunya tempat teks ticker beranda ditata.
// Nilai disimpan sebagai JSON di public.site_settings (kunci info_ticker) lewat
// /api/admin/info-ticker — role admin diperiksa di server, bukan hanya di UI.
// Teks tidak pernah dirender sebagai HTML, jadi tidak ada jalur XSS.

const TEXTAREA_CLASS =
  "w-full rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20";

const EMPTY: InfoTickerSettings = {
  enabled: true,
  text: "",
  speed: 40,
  direction: "left",
  pause_on_touch: true,
  gap: 48,
  link_url: null,
  icon: "megaphone",
  style: "default",
  start_at: null,
  end_at: null,
};

/** ISO -> nilai input datetime-local (waktu lokal browser admin). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** datetime-local -> ISO absolut, dikirim ke server agar tidak ambigu zona waktu. */
function fromLocalInput(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function speedLabel(speed: number): string {
  if (speed <= 25) return "Lambat";
  if (speed <= 70) return "Sedang";
  return "Cepat";
}

export default function AdminInfoTickerPage() {
  const toast = useToast();
  const [form, setForm] = useState<InfoTickerSettings>(EMPTY);
  const [saved, setSaved] = useState<InfoTickerSettings>(EMPTY);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/info-ticker", { cache: "no-store" }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (!res?.ok) {
      setLoadError(json?.message || "Gagal memuat pengaturan info berjalan.");
      setLoading(false);
      return;
    }
    const next: InfoTickerSettings = { ...EMPTY, ...(json.settings || {}) };
    setForm(next);
    setSaved(next);
    setUpdatedAt(json.updated_at || null);
    setLoadError(null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  const shownOnHome = useMemo(() => tickerShouldRender(form), [form]);
  const linkError =
    form.link_url && !isAllowedTickerLink(form.link_url)
      ? "Link hanya boleh alamat internal (diawali /) atau https."
      : null;

  function set<K extends keyof InfoTickerSettings>(key: K, value: InfoTickerSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!dirty || linkError) return;
    setSaving(true);
    const res = await fetch("/api/admin/info-ticker", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", ...form }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      toast.show(json?.message || "Gagal menyimpan pengaturan info berjalan.", "error");
      return;
    }
    const next: InfoTickerSettings = { ...EMPTY, ...(json.settings || {}) };
    setForm(next);
    setSaved(next);
    setUpdatedAt(json.updated_at || null);
    toast.show("Pengaturan info berjalan tersimpan dan langsung tampil di beranda.", "success");
  }

  async function resetDefaults() {
    setSaving(true);
    const res = await fetch("/api/admin/info-ticker", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      toast.show(json?.message || "Gagal mengembalikan pengaturan ke default.", "error");
      return;
    }
    const next: InfoTickerSettings = { ...EMPTY, ...(json.settings || {}) };
    setForm(next);
    setSaved(next);
    setUpdatedAt(json.updated_at || null);
    toast.show("Tampilan info berjalan dikembalikan ke pengaturan awal. Teks tetap disimpan.", "success");
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-app-kicker">PANEL ADMIN</p>
            <h1 className="mt-1 break-words text-xl font-black text-app-text sm:text-2xl">Info Berjalan</h1>
            <p className="mt-1 text-sm leading-5 text-app-muted">
              Teks satu baris di kartu hero beranda. Bila teks lebih lebar dari ruang yang tersedia, ia bergerak
              terus-menerus; bila muat, ia tampil statis. Perubahan tersimpan langsung tampil tanpa deploy ulang.
            </p>
            {updatedAt && <p className="mt-1 text-xs text-app-subtle">Terakhir diubah: {formatDate(updatedAt)}</p>}
          </div>
          <Button variant="outline" onClick={load} className="px-4 py-2.5">↻ Muat ulang</Button>
        </div>
      </Card>

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : loadError ? (
        <Card>
          <p className="text-sm font-bold text-danger-600 dark:text-danger-400">{loadError}</p>
          <p className="mt-1 text-sm text-app-muted">Beranda tetap menampilkan teks bawaan sampai pengaturan berhasil dimuat.</p>
          <Button variant="outline" onClick={load} className="mt-3 px-4 py-2.5">Coba lagi</Button>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="min-w-0 space-y-5">
            <Card>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle>Tampilkan info berjalan</CardTitle>
                  <CardDescription>
                    Matikan untuk menyembunyikan seluruh baris info beserta garis pemisah di atasnya.
                  </CardDescription>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.enabled}
                  aria-label="Ubah status tampil info berjalan"
                  onClick={() => set("enabled", !form.enabled)}
                  className={`relative h-8 w-14 shrink-0 rounded-full transition ${form.enabled ? "bg-gold-400" : "bg-zinc-300"}`}
                >
                  <span className={`absolute top-1 h-6 w-6 rounded-full bg-zinc-950 transition-all ${form.enabled ? "left-7" : "left-1"}`} />
                </button>
              </div>
            </Card>

            <Card>
              <CardTitle>Teks &amp; gaya</CardTitle>
              <div className="mt-3 space-y-4">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label htmlFor="ticker-text" className="text-sm font-bold text-app-text">Teks info</label>
                    <span className={`text-xs font-bold ${form.text.length > TICKER_TEXT_MAX ? "text-danger-600 dark:text-danger-400" : "text-app-subtle"}`}>
                      {form.text.length}/{TICKER_TEXT_MAX}
                    </span>
                  </div>
                  <textarea
                    id="ticker-text"
                    rows={3}
                    maxLength={TICKER_TEXT_MAX}
                    value={form.text}
                    onChange={(e) => set("text", e.target.value)}
                    placeholder="Mis. Semua transaksi digital bisa diproses langsung dari satu akun AIDIL STORE."
                    className={TEXTAREA_CLASS}
                  />
                  <p className="mt-1.5 text-xs text-app-subtle">
                    Teks ditampilkan apa adanya sebagai teks biasa — tanpa format, tautan, atau HTML.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="Ikon" value={form.icon} onChange={(e) => set("icon", e.target.value as InfoTickerSettings["icon"])}>
                    <option value="megaphone">Pengeras suara</option>
                    <option value="bell">Lonceng</option>
                    <option value="star">Bintang</option>
                    <option value="none">Tanpa ikon</option>
                  </Select>
                  <Select label="Gaya" value={form.style} onChange={(e) => set("style", e.target.value as InfoTickerSettings["style"])}>
                    <option value="default">Default (putih)</option>
                    <option value="emas">Emas (biru terang)</option>
                    <option value="peringatan">Peringatan (kuning)</option>
                  </Select>
                </div>

                <Input
                  label="Link saat teks ditekan (opsional)"
                  value={form.link_url ?? ""}
                  error={linkError}
                  hint="Kosongkan untuk membuka halaman Info. Contoh: /promo atau https://contoh.com/aturan"
                  onChange={(e) => set("link_url", e.target.value.trim() === "" ? null : e.target.value)}
                  placeholder="/notifications"
                />
              </div>
            </Card>

            <Card>
              <CardTitle>Gerak &amp; jadwal</CardTitle>
              <div className="mt-3 space-y-4">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="ticker-speed" className="text-sm font-bold text-app-text">Kecepatan berjalan</label>
                    <span className="text-xs font-bold text-app-muted">
                      {form.speed} px per detik · {speedLabel(form.speed)}
                    </span>
                  </div>
                  <input
                    id="ticker-speed"
                    type="range"
                    min={TICKER_SPEED_MIN}
                    max={TICKER_SPEED_MAX}
                    step={1}
                    value={form.speed}
                    onChange={(e) => set("speed", Number(e.target.value))}
                    className="w-full accent-gold-400"
                  />
                  <div className="mt-1 flex justify-between text-[11px] font-bold text-app-subtle">
                    <span>Lambat ({TICKER_SPEED_MIN})</span>
                    <span>Sedang</span>
                    <span>Cepat ({TICKER_SPEED_MAX})</span>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="Arah" value={form.direction} onChange={(e) => set("direction", e.target.value as InfoTickerSettings["direction"])}>
                    <option value="left">Kiri</option>
                    <option value="right">Kanan</option>
                  </Select>
                  <div className="min-w-0">
                    <label htmlFor="ticker-gap" className="mb-2 block text-sm font-bold text-app-text">
                      Jarak antar teks: {form.gap} px
                    </label>
                    <input
                      id="ticker-gap"
                      type="range"
                      min={TICKER_GAP_MIN}
                      max={TICKER_GAP_MAX}
                      step={4}
                      value={form.gap}
                      onChange={(e) => set("gap", Number(e.target.value))}
                      className="w-full accent-gold-400"
                    />
                    <p className="mt-1 text-[11px] font-bold text-app-subtle">
                      {TICKER_GAP_MIN} px rapat · {TICKER_GAP_MAX} px longgar
                    </p>
                  </div>
                </div>

                <label className="flex items-start gap-3 text-sm font-bold text-app-text">
                  <input
                    type="checkbox"
                    checked={form.pause_on_touch}
                    onChange={(e) => set("pause_on_touch", e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-gold-400"
                  />
                  <span className="min-w-0 break-words">
                    Jeda saat disentuh atau ditunjuk
                    <span className="mt-0.5 block text-xs font-medium text-app-muted">
                      Teks berhenti bergerak ketika kursor atau jari berada di atasnya, lalu lanjut sendiri.
                    </span>
                  </span>
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Tampil sejak (opsional)"
                    type="datetime-local"
                    value={toLocalInput(form.start_at)}
                    onChange={(e) => set("start_at", fromLocalInput(e.target.value))}
                  />
                  <Input
                    label="Sampai (opsional)"
                    type="datetime-local"
                    value={toLocalInput(form.end_at)}
                    onChange={(e) => set("end_at", fromLocalInput(e.target.value))}
                  />
                </div>
                <p className="text-xs text-app-subtle">
                  Luar jadwal atau teks kosong: seluruh baris info disembunyikan dari beranda.
                </p>
              </div>
            </Card>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={save} loading={saving} disabled={!dirty || Boolean(linkError)}>Simpan</Button>
              <Button variant="outline" onClick={resetDefaults} disabled={saving}>Kembalikan default</Button>
              <Button variant="ghost" onClick={load} disabled={saving}>Batalkan perubahan</Button>
              {dirty ? (
                <Badge tone="warning" className="px-2 py-0.5">Belum tersimpan</Badge>
              ) : (
                <Badge tone="success" className="px-2 py-0.5">Tersimpan</Badge>
              )}
            </div>
          </div>

          <div className="min-w-0 lg:sticky lg:top-5 lg:self-start">
            <Card>
              <CardTitle>Pratinjau</CardTitle>
              <CardDescription>Lebar 360px, sama dengan ponsel terkecil yang didukung.</CardDescription>
              <div className="mt-3 flex justify-center">
                <div className="w-full max-w-[360px] min-w-0">
                  <div className="app-hero rounded-[2rem] p-5 text-white">
                    <p className="text-[18px] font-semibold">Halo, Nama Pengguna</p>
                    <p className="mt-1 text-sm text-white/70">Semua transaksi digital, lebih praktis.</p>
                    <div className="mt-4 border-t border-white/10 pt-2">
                      {form.text.trim() ? (
                        <InfoTicker settings={form} previewMode />
                      ) : (
                        <p className="flex h-10 items-center text-xs text-white/50">
                          Isi teks untuk melihat pratinjau.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {!shownOnHome && form.text.trim() !== "" && (
                <p className="mt-3 rounded-xl bg-warning-100 px-3 py-2 text-xs font-bold text-warning-800 dark:bg-warning-500/15 dark:text-warning-300">
                  Dengan pengaturan ini, baris info sedang tidak tampil di beranda (nonaktif atau di luar jadwal tampil).
                </p>
              )}
              <p className="mt-3 text-xs leading-5 text-app-subtle">
                Pratinjau memakai komponen yang sama dengan beranda, jadi arah, kecepatan, jeda, gaya, dan ikon
                berubah seketika saat nilai diubah. Saat switch dimatikan, baris ini hilang dari beranda.
              </p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
