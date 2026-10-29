import type { Metadata } from "next";
import { getPublishedRatings, getRatingSummary } from "@/lib/ratings";
import { formatDateOnly } from "@/lib/utils";
import Icon from "@/components/icons/Icon";
import StarRating from "@/components/icons/StarRating";

export const metadata: Metadata = {
  title: "Ulasan Pelanggan — AIDIL STORE",
  description:
    "Ulasan pelanggan AIDIL STORE yang sudah disetujui admin. Nama ditampilkan singkat untuk menjaga privasi.",
};

export default async function UlasanPage() {
  const [summary, ratings] = await Promise.all([
    getRatingSummary(),
    getPublishedRatings(30),
  ]);

  return (
    <div className="mx-auto max-w-3xl animate-page-in space-y-5">
      <section className="overflow-hidden rounded-3xl border border-app-border bg-gradient-to-br from-zinc-950 via-zinc-950 to-gold-700 p-6 text-white shadow-xl">
        <h1 className="text-3xl font-black">Ulasan Pelanggan</h1>
        <p className="mt-2 text-sm leading-6 text-white/70">
          Penilaian dari pengguna yang sudah menyelesaikan transaksi. Hanya ulasan yang disetujui
          admin yang ditampilkan.
        </p>
        <div className="mt-5 flex flex-wrap items-end gap-x-3 gap-y-1">
          <p className="inline-flex gap-1.5 text-5xl font-black leading-none whitespace-nowrap">
            <Icon name="star_fill" size={36} className="text-gold-400" />{summary.average.toFixed(1)}
          </p>
          <p className="pb-1 text-sm font-bold text-white/70">
            dari {summary.totalCount} ulasan
          </p>
        </div>
      </section>

      {ratings.length === 0 ? (
        <div className="rounded-3xl border border-app-border bg-app-surface p-8 text-center">
          <Icon name="star_fill" size={30} className="mx-auto text-gold-400" />
          <p className="mt-3 font-black text-app-text">Belum ada ulasan yang ditampilkan</p>
          <p className="mt-1 text-sm text-app-muted">
            Ulasan akan muncul di sini setelah disetujui admin.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {ratings.map((review, index) => (
            <article
              key={`${review.displayName}-${review.createdAt}-${index}`}
              className="rounded-3xl border border-app-border bg-app-surface p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StarRating value={review.rating} size={18} />
                {review.createdAt ? (
                  <time className="text-xs text-app-subtle" dateTime={review.createdAt}>
                    {formatDateOnly(review.createdAt)}
                  </time>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-app-text">
                {review.comment ? `"${review.comment}"` : <span className="italic text-app-muted">Tanpa komentar.</span>}
              </p>
              <p className="mt-3 text-xs font-black text-app-text">— {review.displayName}</p>
            </article>
          ))}
        </div>
      )}

      <p className="px-1 text-xs leading-5 text-app-subtle">
        Nama ditampilkan dalam bentuk singkat dan tidak menyertakan email atau data pribadi lain.
        Rating dikirim hanya setelah pengguna menyelesaikan minimal 10 transaksi berhasil.
      </p>
    </div>
  );
}
