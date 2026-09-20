"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import { isImageTooBlurry } from "@/lib/blur-check";

type Status = "PENDING" | "KTP_SUBMITTED" | "SUBMITTED" | "VERIFIED" | "REJECTED";
type Stage = "ktp" | "selfie";
type RejectedStage = "KTP" | "SELFIE" | null;

/** Ilustrasi panduan posisi KTP: kartu diletakkan rata di dalam bingkai, 4 sudut terlihat. */
function KtpPoseGuide() {
  return (
    <svg viewBox="0 0 320 200" className="mx-auto h-40 w-full max-w-xs text-gold-600">
      <rect x="4" y="4" width="312" height="192" rx="16" fill="#0f172a" />
      {/* bingkai target */}
      <rect x="40" y="46" width="240" height="108" rx="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="6 5" />
      {/* kartu KTP */}
      <rect x="52" y="58" width="216" height="84" rx="8" fill="#fef3c7" stroke="#78350f" strokeWidth="2" />
      <circle cx="80" cy="82" r="12" fill="#facc15" stroke="#78350f" strokeWidth="1.5" />
      <rect x="100" y="72" width="90" height="6" rx="3" fill="#78350f" opacity=".7" />
      <rect x="100" y="86" width="130" height="5" rx="2.5" fill="#78350f" opacity=".5" />
      <rect x="100" y="98" width="110" height="5" rx="2.5" fill="#78350f" opacity=".5" />
      <rect x="100" y="110" width="70" height="5" rx="2.5" fill="#78350f" opacity=".5" />
      {/* sudut penanda hijau di 4 ujung bingkai */}
      <path d="M40 46 h16 M40 46 v16" stroke="#34d399" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M280 46 h-16 M280 46 v16" stroke="#34d399" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M40 154 h16 M40 154 v-16" stroke="#34d399" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M280 154 h-16 M280 154 v-16" stroke="#34d399" strokeWidth="4" strokeLinecap="round" fill="none" />
      <text x="160" y="182" textAnchor="middle" fontSize="11" fill="#e5e7eb" fontWeight="700">
        Rata, terang, 4 sudut terlihat, tidak silau
      </text>
    </svg>
  );
}

/** Ilustrasi panduan posisi wajah: oval panduan di tengah bingkai kamera. */
function FacePoseGuide() {
  return (
    <svg viewBox="0 0 320 200" className="mx-auto h-40 w-full max-w-xs text-gold-600">
      <rect x="4" y="4" width="312" height="192" rx="16" fill="#0f172a" />
      <ellipse cx="160" cy="92" rx="58" ry="72" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="6 5" />
      {/* siluet wajah */}
      <ellipse cx="160" cy="88" rx="46" ry="58" fill="#fde68a" opacity=".9" />
      <circle cx="138" cy="80" r="5" fill="#78350f" />
      <circle cx="182" cy="80" r="5" fill="#78350f" />
      <path d="M144 106 q16 12 32 0" stroke="#78350f" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* garis bantu tengah */}
      <line x1="160" y1="20" x2="160" y2="164" stroke="#34d399" strokeWidth="1.5" strokeDasharray="3 4" opacity=".6" />
      <text x="160" y="182" textAnchor="middle" fontSize="11" fill="#e5e7eb" fontWeight="700">
        Wajah di dalam oval, lihat lurus ke kamera
      </text>
    </svg>
  );
}

function StepDots({ stage }: { stage: Stage }) {
  return (
    <div className="mt-4 flex items-center justify-center gap-2 text-xs font-black">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full ${stage === "ktp" ? "bg-gold-600 text-white" : "bg-emerald-500 text-white"}`}>
        {stage === "ktp" ? "1" : "✓"}
      </span>
      <span className={`h-0.5 w-8 ${stage === "selfie" ? "bg-emerald-500" : "bg-slate-200"}`} />
      <span className={`flex h-7 w-7 items-center justify-center rounded-full ${stage === "selfie" ? "bg-gold-600 text-white" : "bg-slate-200 text-slate-500"}`}>
        2
      </span>
    </div>
  );
}

export default function KYC() {
  const s = createClient();
  const toast = useToast();

  const [status, setStatus] = useState<Status>("PENDING");
  const [reviewNote, setReviewNote] = useState("");
  const [rejection, setRejection] = useState("");
  const [rejectedStage, setRejectedStage] = useState<RejectedStage>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Menyimpan...");

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await s.auth.getUser();
      if (!user) return;
      const { data } = await s.from("kyc_verifications")
        .select("status,review_note,rejection_reason,rejected_stage")
        .eq("user_id", user.id).maybeSingle();
      if (data) {
        setStatus(data.status as Status);
        setReviewNote(data.review_note || "");
        setRejection(data.rejection_reason || "");
        setRejectedStage((data.rejected_stage as RejectedStage) || null);
      }
    })();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }

  async function requestCamera(stage: Stage) {
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: stage === "selfie" ? "user" : "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraDenied(false);
      setCameraReady(true);
    } catch {
      setCameraDenied(true);
      toast.show("Akses kamera diperlukan untuk proses verifikasi. Aktifkan izin Kamera lalu coba lagi.", "error");
    }
  }

  function capture(stage: Stage): Promise<File | null> {
    return new Promise((resolve) => {
      if (!videoRef.current) return resolve(null);
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 720;
      canvas.height = video.videoHeight || 960;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return resolve(null);
        resolve(new File([blob], stage === "ktp" ? "ktp-kamera.jpg" : "selfie-kamera.jpg", { type: "image/jpeg" }));
      }, "image/jpeg", 0.92);
    });
  }

  /**
   * Cek tambahan khusus Tahap 1 (KTP): apakah teks di foto terbaca seperti
   * KTP (pola NIK 16 digit / kata kunci KTP). Bukan verifikasi keaslian resmi
   * — lihat catatan di src/lib/ktp-ocr.ts. Kalau proses OCR sendiri gagal
   * (server bermasalah dll), foto tetap diloloskan (fail-open) supaya KYC
   * tidak macet hanya gara-gara OCR — yang diblokir hanya kalau OCR berhasil
   * jalan tapi sama sekali tidak menemukan pola KTP di foto itu.
   */
  async function verifyKtpOcr(file: File): Promise<{ ok: boolean; looksLikeKtp: boolean; nik: string | null }> {
    // Batas waktu di sisi klien: kalau OCR di server lambat (mis. lagi
    // menyiapkan worker pertama kali), jangan bikin user menunggu sampai
    // 30 detik (maxDuration server). Setelah 10 detik, anggap saja gagal
    // dan lolos otomatis (fail-open) — foto tetap bisa disimpan, dan admin
    // yang akan memeriksa manual.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/kyc/verify-ktp", { method: "POST", body, signal: controller.signal });
      if (!res.ok) return { ok: false, looksLikeKtp: true, nik: null };
      const j = await res.json();
      return { ok: Boolean(j.ok), looksLikeKtp: j.looksLikeKtp !== false, nik: j.nik || null };
    } catch {
      return { ok: false, looksLikeKtp: true, nik: null };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** true = lolos (boleh lanjut simpan), false = sudah ditangani (toast + berhenti). */
  async function checkKtpLooksValid(file: File): Promise<{ pass: boolean; nik: string | null }> {
    const ocr = await verifyKtpOcr(file);
    if (ocr.ok && !ocr.looksLikeKtp) {
      toast.show(
        "Foto ini sepertinya bukan foto KTP (NIK/kata kunci KTP tidak terbaca). Pastikan seluruh KTP terlihat jelas dalam bingkai, lalu coba lagi.",
        "error"
      );
      return { pass: false, nik: null };
    }
    return { pass: true, nik: ocr.nik };
  }

  async function handleCaptureAndSave(stage: Stage) {
    setBusy(true);
    setBusyLabel("Mengambil foto...");
    const file = await capture(stage);
    if (!file) { setBusy(false); return; }
    stopCamera();
    setBusyLabel("Memeriksa kualitas foto...");
    const blurry = await isImageTooBlurry(file);
    if (blurry) {
      toast.show("Foto terlalu blur/buram, silakan ambil ulang dengan pencahayaan cukup dan tangan stabil. Foto blur tidak akan diterima.", "error");
      setBusy(false);
      return;
    }
    let nik: string | null = null;
    if (stage === "ktp") {
      setBusyLabel("Memindai KTP...");
      const check = await checkKtpLooksValid(file);
      if (!check.pass) { setBusy(false); return; }
      nik = check.nik;
    }
    setBusyLabel("Menyimpan...");
    await saveStage(stage, file, nik);
  }

  async function handleFileInput(stage: Stage, file: File | null) {
    if (!file) return;
    setBusy(true);
    setBusyLabel("Memeriksa kualitas foto...");
    const blurry = await isImageTooBlurry(file);
    if (blurry) {
      toast.show("Foto terlalu blur/buram, mohon pilih atau ambil foto yang lebih jelas. Foto blur tidak akan diterima.", "error");
      setBusy(false);
      return;
    }
    let nik: string | null = null;
    if (stage === "ktp") {
      setBusyLabel("Memindai KTP...");
      const check = await checkKtpLooksValid(file);
      if (!check.pass) { setBusy(false); return; }
      nik = check.nik;
    }
    setBusyLabel("Menyimpan...");
    await saveStage(stage, file, nik);
  }

  /** Simpan hasil satu tahap ke storage + DB. Tahap KTP langsung tersimpan begitu hasilnya bagus. */
  async function saveStage(stage: Stage, file: File, ocrNik?: string | null) {
    const { data: { user } } = await s.auth.getUser();
    if (!user) { setBusy(false); return; }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/${Date.now()}-${stage}.${ext}`;
    const up = await s.storage.from("kyc-private").upload(path, file, { upsert: false });
    if (up.error) { toast.show(up.error.message, "error"); setBusy(false); return; }

    if (stage === "ktp") {
      const { error } = await s.from("kyc_verifications").upsert({
        user_id: user.id,
        status: "KTP_SUBMITTED",
        kyc_method: "KTP_SELFIE",
        ktp_path: up.data.path,
        ocr_nik: ocrNik ?? null,
        ktp_saved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        rejection_reason: null,
        review_note: null,
        rejected_stage: null,
      });
      setBusy(false);
      if (error) { toast.show(error.message, "error"); return; }
      setStatus("KTP_SUBMITTED");
      setRejectedStage(null);
      toast.show("Foto KTP tersimpan dengan baik. Lanjut ke Tahap 2: verifikasi wajah.", "success");
    } else {
      const { error } = await s.from("kyc_verifications").upsert({
        user_id: user.id,
        status: "SUBMITTED",
        selfie_path: up.data.path,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        rejection_reason: null,
        review_note: null,
        rejected_stage: null,
      });
      setBusy(false);
      if (error) { toast.show(error.message, "error"); return; }
      setStatus("SUBMITTED");
      setRejectedStage(null);
      toast.show("Verifikasi wajah tersimpan. KYC lengkap dan dikirim untuk diperiksa admin.", "success");
    }
  }

  const locked = status === "SUBMITTED" || status === "VERIFIED";
  // Kalau admin cuma menolak Tahap 2 (wajah), KTP yang sudah tersimpan tidak
  // perlu difoto ulang — user langsung lanjut ke Tahap 2 saja.
  const stage: Stage =
    status === "KTP_SUBMITTED" || (status === "REJECTED" && rejectedStage === "SELFIE") ? "selfie" : "ktp";

  return (
    <div className="mx-auto max-w-xl brand-card p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <img src="/aidil-logo.png" className="h-14 w-14 rounded-2xl object-cover" alt="AIDIL STORE" />
        <div>
          <p className="section-kicker">Verifikasi Akun</p>
          <h1 className="mt-1 text-2xl font-black">KYC — KTP dan Verifikasi Wajah</h1>
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-500">
        Status: <b className="text-slate-800">{status}</b>. Data digunakan hanya untuk proses verifikasi akun.
      </p>

      {!locked && <StepDots stage={stage} />}

      {!locked && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-bold leading-5 text-red-700">
          ⚠️ Pastikan foto tidak blur/buram. Foto yang terdeteksi blur akan otomatis ditolak sistem dan tidak akan diterima.
          {stage === "ktp" && " Sistem juga mengecek apakah foto terbaca seperti KTP (NIK/kata kunci KTP) sebelum disimpan."}
        </div>
      )}

      {status === "SUBMITTED" && (
        <div className="mt-4 rounded-2xl border border-gold-200 bg-gold-50 p-4 text-sm text-zinc-950">
          <b>Sedang diperiksa.</b><br />Admin akan memeriksa KTP dan foto wajah yang sudah kamu kirim.
        </div>
      )}
      {status === "VERIFIED" && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <b>Verifikasi berhasil.</b><br />Akun kamu sudah terverifikasi.
        </div>
      )}
      {status === "REJECTED" && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <b>KYC belum disetujui.</b>{rejection && <><br />Alasan: {rejection}</>}
          <br />
          <span className="text-xs">
            {rejectedStage === "KTP" && "Yang ditolak: foto KTP. Silakan ulangi Tahap 1 (foto KTP), lalu lanjut ke Tahap 2 seperti biasa."}
            {rejectedStage === "SELFIE" && "Yang ditolak: verifikasi wajah. KTP kamu sudah oke, cukup ulangi Tahap 2 (foto wajah) saja."}
            {!rejectedStage && "Silakan ajukan ulang mulai dari Tahap 1."}
          </span>
        </div>
      )}
      {reviewNote && (status === "REJECTED" || status === "VERIFIED") && (
        <p className="mt-2 text-xs text-slate-500">Catatan admin: {reviewNote}</p>
      )}

      {!locked && (
        <div className="mt-6 space-y-4">
          <p className="text-center text-sm font-black text-slate-700">
            {stage === "ktp" ? "Tahap 1 dari 2 — Scan KTP" : "Tahap 2 dari 2 — Verifikasi Wajah"}
          </p>

          {stage === "ktp" ? <KtpPoseGuide /> : <FacePoseGuide />}

          <div className="rounded-2xl border border-gold-200 bg-gold-50 p-4">
            <p className="font-black text-zinc-950">🔐 Izin kamera</p>
            <p className="mt-1 text-xs leading-5 text-zinc-900">
              {stage === "ktp"
                ? "Ikuti panduan di atas: letakkan KTP rata di dalam bingkai, pastikan 4 sudut terlihat dan tidak silau."
                : "Ikuti panduan di atas: posisikan wajah tepat di dalam oval, lihat lurus ke kamera, pencahayaan cukup."}
            </p>
            {!cameraReady && (
              <button type="button" onClick={() => requestCamera(stage)} className="mt-3 rounded-xl bg-gold-700 px-4 py-3 text-sm font-black text-white">
                📷 Izinkan Kamera & Mulai
              </button>
            )}
            {cameraDenied && <p className="mt-2 text-xs font-bold text-red-700">Akses kamera ditolak. Aktifkan izin Kamera pada pengaturan browser/perangkat.</p>}
          </div>

          <div className={`overflow-hidden rounded-2xl border bg-black p-3 ${cameraReady ? "" : "hidden"}`}>
            <div className="relative">
              <video ref={videoRef} playsInline muted className="aspect-video w-full rounded-xl object-cover" />
              {stage === "selfie" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="aspect-[3/4] h-[70%] rounded-[50%] border-2 border-dashed border-emerald-400" />
                </div>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => handleCaptureAndSave(stage)} disabled={busy} className="rounded-xl bg-yellow-400 px-4 py-3 font-black text-black disabled:opacity-50">
                {busy ? busyLabel : "Ambil & Simpan Foto"}
              </button>
              <button type="button" onClick={stopCamera} className="rounded-xl bg-white px-4 py-3 font-black">Batal</button>
            </div>
            {busy && (
              <p className="mt-2 text-center text-xs font-bold text-white">
                ⏳ {busyLabel} {busyLabel === "Memindai KTP..." && "(bisa sampai ±10 detik, mohon tunggu)"}
              </p>
            )}
          </div>

          <label className="block text-sm font-bold">
            atau pilih dari galeri <span className="text-xs font-normal text-slate-500">(pastikan tidak blur/buram)</span>
            <input
              disabled={busy}
              type="file"
              accept="image/jpeg,image/png"
              capture={stage === "selfie" ? "user" : "environment"}
              onChange={(e) => handleFileInput(stage, e.target.files?.[0] || null)}
              className="mt-2 block w-full rounded-xl border border-gold-100 bg-white p-3 disabled:opacity-50"
            />
          </label>
        </div>
      )}

      <div className="mt-5 rounded-2xl border bg-slate-50 p-4 text-xs leading-5 text-slate-500">
        Dokumen KTP dan foto wajah disimpan pada penyimpanan privat dan tidak ditampilkan secara publik.
      </div>
    </div>
  );
}