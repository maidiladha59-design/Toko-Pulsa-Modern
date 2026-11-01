"use client";

import { useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { useToast } from "@/components/ToastProvider";
import { formatDate } from "@/lib/utils";
import {
  BANNER_CACHE_TAGS,
  CATALOG_CACHE_TAGS,
  allSettingsCacheTags,
} from "@/lib/managed-settings";

// Halaman Sistem: alat operasional yang tidak mengubah data bisnis.
// Satu-satunya aksi saat ini adalah membersihkan cache tampilan (pengaturan,
// katalog, banner). Data transaksi, saldo, dan pesanan tidak disentuh.

type ClearResult = { cleared_at: string; tags: string[] };

export default function AdminSystemPage() {
  const toast = useToast();
  const [confirmed, setConfirmed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState<ClearResult | null>(null);

  const groups = useMemo(
    () => [
      { title: "Pengaturan", tags: allSettingsCacheTags() },
      { title: "Katalog", tags: [...CATALOG_CACHE_TAGS] },
      { title: "Banner", tags: [...BANNER_CACHE_TAGS] },
    ],
    []
  );

  async function clearCache() {
    setClearing(true);
    try {
      const res = await fetch("/api/admin/system/cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.show(json?.message || "Gagal membersihkan cache. Coba lagi.", "error");
        return;
      }
      setResult({
        cleared_at: String(json?.cleared_at || new Date().toISOString()),
        tags: Array.isArray(json?.tags) ? json.tags.map(String) : [],
      });
      setDialogOpen(false);
      setConfirmed(false);
      toast.show(
        "Cache dibersihkan. Halaman publik akan memuat data terbaru pada kunjungan berikutnya.",
        "success"
      );
    } catch {
      toast.show("Koneksi gagal. Periksa jaringan Anda lalu coba lagi.", "error");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-xs font-black uppercase tracking-widest text-app-kicker">PANEL ADMIN</p>
        <h1 className="mt-1 break-words text-xl font-black text-app-text sm:text-2xl">Sistem</h1>
        <p className="mt-1 max-w-2xl text-sm leading-5 text-app-muted">
          Alat operasional untuk menjaga halaman publik menampilkan data terbaru. Semua aksi di sini
          hanya menyentuh cache tampilan dan tidak mengubah saldo, pesanan, atau pembayaran.
        </p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <Card className="min-w-0">
          <CardTitle>Bersihkan Cache</CardTitle>
          <CardDescription>
            Menghapus cache tag pengaturan, katalog, dan banner supaya perubahan langsung terbaca
            tanpa menunggu masa berlaku cache. Cache akan terisi ulang otomatis saat halaman dibuka.
          </CardDescription>

          <div className="mt-4 space-y-3">
            {groups.map((group) => (
              <div key={group.title} className="rounded-2xl border border-app-border bg-app-inset p-3">
                <p className="text-xs font-black uppercase tracking-widest text-app-kicker">
                  {group.title}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {group.tags.map((tag) => (
                    <code
                      key={tag}
                      className="break-all rounded-lg bg-app-surface px-2 py-1 text-[11px] font-bold text-app-muted"
                    >
                      {tag}
                    </code>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <label className="mt-4 flex items-start gap-3 text-sm font-bold text-app-text">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-gold-400"
            />
            <span className="min-w-0 break-words">
              Saya memahami cache hanya mempercepat pemuatan ulang dan tidak mengubah data
              transaksi.
            </span>
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="destructive"
              onClick={() => setDialogOpen(true)}
              disabled={!confirmed || clearing}
            >
              Bersihkan Cache
            </Button>
            <span className="text-xs text-app-subtle">
              Wajib konfirmasi. Setiap pembersihan dicatat di Audit Log.
            </span>
          </div>
        </Card>

        <Card className="min-w-0 lg:sticky lg:top-5 lg:self-start">
          <CardTitle>Status terakhir</CardTitle>
          <CardDescription>
            Ringkasan pembersihan cache pada sesi ini. Riwayat lengkap ada di Audit Log.
          </CardDescription>
          {result ? (
            <div className="mt-3 space-y-3">
              <Badge tone="success" className="px-2 py-0.5">
                Cache dibersihkan
              </Badge>
              <p className="text-sm font-bold text-app-text">{formatDate(result.cleared_at)}</p>
              <div className="flex flex-wrap gap-1.5">
                {result.tags.map((tag) => (
                  <code
                    key={tag}
                    className="break-all rounded-lg bg-app-inset px-2 py-1 text-[11px] font-bold text-app-muted"
                  >
                    {tag}
                  </code>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 rounded-xl bg-app-inset px-3 py-2 text-xs leading-5 text-app-muted">
              Belum ada cache yang dibersihkan dari halaman ini. Cache normalnya kedaluwarsa sendiri
              dalam 60 detik; tombol ini dipakai bila perubahan harus langsung terlihat.
            </p>
          )}
          <p className="mt-3 text-xs leading-5 text-app-subtle">
            Pemakaian aman kapan saja. Bila situs sedang ramai, halaman pertama setelah pembersihan
            mungkin sedikit lebih lambat karena data diambil ulang.
          </p>
        </Card>
      </div>

      {dialogOpen && (
        <ConfirmDialog
          title="Bersihkan cache tampilan?"
          confirmLabel="Ya, bersihkan"
          danger
          busy={clearing}
          onConfirm={clearCache}
          onCancel={() => setDialogOpen(false)}
        >
          Cache pengaturan, katalog, dan banner akan dihapus. Pengunjung berikutnya memuat data
          terbaru langsung dari database. Saldo, pesanan, dan pembayaran tidak berubah.
        </ConfirmDialog>
      )}
    </div>
  );
}
