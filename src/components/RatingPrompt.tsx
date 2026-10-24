"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STAR_LABELS = ["Sangat buruk", "Buruk", "Cukup", "Bagus", "Luar biasa"];
const MAX_COMMENT = 1000;

// Hanya dipasang di beranda/dashboard — jangan di checkout, transfer,
// tarik saldo, atau halaman transaksi lain agar tidak mengganggu alur.
export default function RatingPrompt() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);

  const markPrompted = useCallback(() => {
    fetch("/api/rating/dismiss", { method: "POST", keepalive: true }).catch(() => {});
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    fetch("/api/rating/status", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data?.shouldPrompt) return;
        setOpen(true);
        // Tandai saat modal benar-benar tampil supaya reload tidak memunculkannya lagi.
        markPrompted();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [markPrompted]);

  const dismiss = useCallback(() => {
    if (submitting) return;
    markPrompted();
    setOpen(false);
  }, [markPrompted, submitting]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, dismiss]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  async function submit() {
    if (!rating || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/rating/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(json.message || "Gagal mengirim rating. Coba lagi.");
        return;
      }

      setSubmitted(true);
      closeTimerRef.current = window.setTimeout(() => setOpen(false), 1800);
    } catch {
      setError("Jaringan gagal. Periksa koneksi lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const activeStars = hovered || rating;

  return (
    <div
      className="fixed inset-0 z-[210] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rating-modal-title"
      tabIndex={-1}
      ref={dialogRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div className="w-full max-w-md rounded-t-3xl border border-app-border bg-app-surface p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        {submitted ? (
          <div className="py-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gold-400/15 text-3xl">
              ⭐
            </div>
            <h2 id="rating-modal-title" className="mt-4 text-xl font-black text-app-text">
              Terima kasih!
            </h2>
            <p className="mt-2 text-sm leading-6 text-app-muted">
              Ulasanmu sudah kami terima dan membantu AIDIL STORE jadi lebih baik.
            </p>
            <p className="mt-3 text-xs text-app-subtle">Modal akan tertutup otomatis.</p>
          </div>
        ) : (
          <>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-app-border sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-app-kicker">
                  10 transaksi berhasil
                </p>
                <h2 id="rating-modal-title" className="mt-2 text-xl font-black leading-snug text-app-text">
                  Gimana pengalaman kamu pakai AIDIL STORE?
                </h2>
              </div>
              <button
                type="button"
                onClick={dismiss}
                disabled={submitting}
                aria-label="Tutup"
                className="shrink-0 rounded-full px-2 py-1 text-lg leading-none text-app-subtle transition hover:bg-app-inset hover:text-app-text disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <p className="mt-2 text-sm leading-6 text-app-muted">
              Pilih bintang dan tulis komentar bila mau. Ulasanmu bisa membantu pengguna lain.
            </p>

            <div className="mt-5" role="radiogroup" aria-label="Rating bintang">
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = star <= activeStars;
                  return (
                    <button
                      key={star}
                      type="button"
                      role="radio"
                      aria-checked={rating === star}
                      aria-label={`${star} bintang — ${STAR_LABELS[star - 1]}`}
                      onMouseEnter={() => setHovered(star)}
                      onMouseLeave={() => setHovered(0)}
                      onFocus={() => setHovered(star)}
                      onBlur={() => setHovered(0)}
                      onClick={() => setRating(star)}
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-2xl transition ${
                        active
                          ? "border-gold-400 bg-gold-400/15 text-gold-500 dark:text-gold-300"
                          : "border-app-border bg-app-inset text-app-subtle hover:border-gold-400/60"
                      }`}
                    >
                      ★
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 min-h-[20px] text-center text-sm font-bold text-app-text">
                {activeStars ? STAR_LABELS[activeStars - 1] : "Pilih 1 sampai 5 bintang"}
              </p>
            </div>

            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-bold text-app-text">
                Komentar <span className="font-medium text-app-subtle">(opsional)</span>
              </span>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value.slice(0, MAX_COMMENT))}
                rows={3}
                maxLength={MAX_COMMENT}
                placeholder="Ceritakan pengalamanmu memakai AIDIL STORE..."
                className="w-full resize-none rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"
              />
              <span className="mt-1 block text-right text-[11px] text-app-subtle">
                {comment.length}/{MAX_COMMENT}
              </span>
            </label>

            {error ? (
              <p role="alert" className="mt-3 rounded-xl border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs font-semibold text-danger-600 dark:text-danger-400">
                {error}
              </p>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={dismiss}
                disabled={submitting}
                className="rounded-xl border border-app-border px-4 py-2.5 text-sm font-bold text-app-text transition hover:bg-app-inset disabled:opacity-50"
              >
                Nanti saja
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!rating || submitting}
                className="btn-gold rounded-xl px-4 py-2.5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Mengirim..." : "Kirim"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
