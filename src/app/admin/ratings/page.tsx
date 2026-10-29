"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import Icon from "@/components/icons/Icon";
import StarRating from "@/components/icons/StarRating";

type RatingRow = {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string | null;
  rating: number;
  comment: string | null;
  transaction_count_at_rating: number;
  is_published: boolean;
  created_at: string;
};

type Summary = {
  average: number;
  total_count: number;
  published_count: number;
  pending_count: number;
  distribution: { rating: number; count: number }[];
};

type Filter = "ALL" | 1 | 2 | 3 | 4 | 5;

function Stars({ rating }: { rating: number }) {
  return <StarRating value={rating} total={5} size={16} />;
}

export default function AdminRatingsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<RatingRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/ratings", { cache: "no-store" });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.show(json.message || "Gagal memuat rating.", "error");
        setRows([]);
        setSummary(null);
        return;
      }

      setRows(json.ratings || []);
      setSummary(json.summary || null);
    } catch {
      toast.show("Jaringan gagal. Periksa koneksi lalu coba lagi.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function togglePublished(row: RatingRow) {
    setActing(row.id);
    try {
      const response = await fetch("/api/admin/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating_id: row.id, published: !row.is_published }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.show(json.message || "Gagal memoderasi ulasan.", "error");
        return;
      }

      setRows((previous) =>
        previous.map((item) =>
          item.id === row.id ? { ...item, is_published: !row.is_published } : item
        )
      );
      setSummary((previous) => {
        if (!previous) return previous;
        const delta = row.is_published ? -1 : 1;
        return {
          ...previous,
          published_count: previous.published_count + delta,
          pending_count: previous.pending_count - delta,
        };
      });
      toast.show(
        row.is_published ? "Ulasan disembunyikan dari publik." : "Ulasan ditayangkan ke publik.",
        "success"
      );
    } catch {
      toast.show("Jaringan gagal. Periksa koneksi lalu coba lagi.", "error");
    } finally {
      setActing(null);
    }
  }

  const filtered = useMemo(
    () => (filter === "ALL" ? rows : rows.filter((row) => row.rating === filter)),
    [rows, filter]
  );

  const distribution = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of rows) map.set(row.rating, (map.get(row.rating) || 0) + 1);
    return [5, 4, 3, 2, 1].map((star) => ({ star, count: map.get(star) || 0 }));
  }, [rows]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Layanan</p>
        <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Rating &amp; Ulasan</h1>
        <p className="mt-1 text-sm text-app-muted">
          Pantau rating pengguna dan setujui komentar sebelum tampil di halaman ulasan publik.
        </p>
      </div>

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs font-bold text-app-muted">Rata-rata</p>
              <p className="mt-1 flex items-center gap-1.5 text-2xl font-black tabular-nums text-app-kicker">
                <Icon name="star_fill" size={24} />{Number(summary?.average || 0).toFixed(1)}
              </p>
              <p className="mt-1 text-[11px] text-app-subtle">Dari semua rating masuk</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-bold text-app-muted">Total ulasan</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-app-text">
                {summary?.total_count ?? 0}
              </p>
              <p className="mt-1 text-[11px] text-app-subtle">Rating 1–5 bintang</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-bold text-app-muted">Tayang</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-success-600 dark:text-success-400">
                {summary?.published_count ?? 0}
              </p>
              <p className="mt-1 text-[11px] text-app-subtle">Terlihat di /ulasan</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-bold text-app-muted">Menunggu</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-warning-600 dark:text-warning-400">
                {summary?.pending_count ?? 0}
              </p>
              <p className="mt-1 text-[11px] text-app-subtle">Belum disetujui admin</p>
            </Card>
          </section>

          <Card className="p-4">
            <p className="text-sm font-black text-app-text">Filter rating</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={filter === "ALL"}
                onClick={() => setFilter("ALL")}
                className={`rounded-xl border px-3 py-2 text-xs font-black transition ${
                  filter === "ALL"
                    ? "border-gold-400 bg-gold-400/15 text-app-kicker"
                    : "border-app-border bg-app-inset text-app-muted hover:border-gold-400/60 hover:text-app-text"
                }`}
              >
                Semua ({rows.length})
              </button>
              {distribution.map(({ star, count }) => (
                <button
                  key={star}
                  type="button"
                  aria-pressed={filter === star}
                  onClick={() => setFilter(star as Filter)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition ${
                    filter === star
                      ? "border-gold-400 bg-gold-400/15 text-app-kicker"
                      : "border-app-border bg-app-inset text-app-muted hover:border-gold-400/60 hover:text-app-text"
                  }`}
                >
                  {star} <Icon name="star_fill" size={14} />({count})
                </button>
              ))}
            </div>
          </Card>

          {filtered.length === 0 ? (
            <EmptyState
              icon="star_fill"
              title={rows.length === 0 ? "Belum ada rating masuk" : "Tidak ada rating pada filter ini"}
              description={
                rows.length === 0
                  ? "Rating akan muncul otomatis setelah pengguna menyelesaikan 10 transaksi berhasil dan mengirim ulasan."
                  : "Coba pilih filter bintang lain."
              }
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((row) => (
                <Card key={row.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Stars rating={row.rating} />
                        <Badge tone={row.is_published ? "success" : "warning"}>
                          {row.is_published ? "Tayang" : "Menunggu"}
                        </Badge>
                        <span className="text-xs font-bold text-app-subtle">
                          {row.transaction_count_at_rating} transaksi saat menilai
                        </span>
                      </div>
                      <p className="mt-2 truncate text-sm font-black text-app-text">
                        {row.user_name}
                        {row.user_email ? (
                          <span className="ml-2 font-medium text-app-subtle">{row.user_email}</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-app-subtle">
                        {new Date(row.created_at).toLocaleString("id-ID", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={row.is_published ? "outline" : "primary"}
                      disabled={acting === row.id}
                      onClick={() => togglePublished(row)}
                    >
                      {acting === row.id
                        ? "Menyimpan..."
                        : row.is_published
                          ? "Sembunyikan"
                          : "Tayangkan"}
                    </Button>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words rounded-2xl border border-app-border bg-app-inset px-3 py-2.5 text-sm leading-6 text-app-text">
                    {row.comment || <span className="italic text-app-muted">Tanpa komentar.</span>}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
