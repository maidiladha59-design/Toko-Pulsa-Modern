"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraFacing = "user" | "environment";
export type CameraErrorKind = "denied" | "unavailable" | "insecure";

const RESOLUTION = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
} as const;

function errorName(error: unknown): string {
  return (error as { name?: string } | null)?.name || "";
}

function mapCameraError(error: unknown): CameraErrorKind {
  const name = errorName(error);
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  return "unavailable";
}

/** Kamera cadangan saat facingMode tidak didukung: cocokkan label, lalu pilih kamera lain. */
async function deviceIdFor(facing: CameraFacing, skipDeviceId?: string): Promise<string | null> {
  if (!navigator.mediaDevices?.enumerateDevices) return null;
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput" && d.deviceId);
    if (!devices.length) return null;
    const hint = facing === "user" ? /front|user|depan|face/i : /back|rear|belakang|environment/i;
    const labelled = devices.find((d) => hint.test(d.label) && d.deviceId !== skipDeviceId);
    if (labelled) return labelled.deviceId;
    const other = devices.find((d) => d.deviceId !== skipDeviceId);
    return (other || devices[0]).deviceId;
  } catch {
    return null;
  }
}

/**
 * Urutan percobaan: facingMode (ideal, tidak gagal di perangkat yang tidak
 * mendukung), lalu deviceId hasil enumerateDevices, terakhir video: true.
 * Izin ditolak tidak diulang karena hasilnya pasti sama.
 */
async function openMedia(facing: CameraFacing, skipDeviceId?: string): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error("Kamera butuh koneksi aman (HTTPS)."), { name: "InsecureContextError" });
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, ...RESOLUTION },
      audio: false,
    });
  } catch (error) {
    if (mapCameraError(error) === "denied") throw error;
    const deviceId = await deviceIdFor(facing, skipDeviceId);
    if (deviceId) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId }, ...RESOLUTION },
          audio: false,
        });
      } catch {
        // lanjut ke fallback terakhir
      }
    }
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<CameraFacing>("environment");
  const activeRef = useRef(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const resumeOnVisibleRef = useRef(false);
  const lastDeviceIdRef = useRef<string | undefined>(undefined);

  const [facing, setFacing] = useState<CameraFacing>("environment");
  const [active, setActiveState] = useState(false);
  const [starting, setStarting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<CameraErrorKind | null>(null);
  const [cameraCount, setCameraCount] = useState(0);

  const setActive = useCallback((next: boolean) => {
    activeRef.current = next;
    setActiveState(next);
  }, []);

  /** Hentikan SEMUA track, lepas srcObject, dan tandai kamera tidak aktif. */
  const release = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    setActive(false);
  }, [setActive]);

  const attach = useCallback(
    async (stream: MediaStream) => {
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      lastDeviceIdRef.current = stream.getVideoTracks()[0]?.getSettings().deviceId || undefined;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          // iOS kadang menolak play() saat tab belum fokus; atribut autoPlay menyusul.
        }
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const total = devices.filter((d) => d.kind === "videoinput").length;
        if (mountedRef.current) setCameraCount(total);
      } catch {
        // jumlah kamera hanya untuk menyembunyikan tombol; abaikan bila gagal
      }
      setError(null);
      setActive(true);
    },
    [setActive]
  );

  const begin = useCallback(
    async (target: CameraFacing) => {
      if (busyRef.current) return;
      busyRef.current = true;
      release();
      setStarting(true);
      try {
        const stream = await openMedia(target, lastDeviceIdRef.current);
        facingRef.current = target;
        setFacing(target);
        await attach(stream);
      } catch (error) {
        console.error("[kamera] gagal membuka kamera", error);
        if (mountedRef.current) {
          setError(errorName(error) === "InsecureContextError" ? "insecure" : mapCameraError(error));
        }
      } finally {
        busyRef.current = false;
        if (mountedRef.current) setStarting(false);
      }
    },
    [attach, release]
  );

  const start = useCallback(
    async (preferred?: CameraFacing) => {
      await begin(preferred ?? facingRef.current);
    },
    [begin]
  );

  const stop = useCallback(() => {
    release();
  }, [release]);

  const switchCamera = useCallback(async () => {
    if (busyRef.current || !activeRef.current) return;
    const previous = facingRef.current;
    const target: CameraFacing = previous === "user" ? "environment" : "user";
    busyRef.current = true;
    setSwitching(true);
    release();
    try {
      const stream = await openMedia(target, lastDeviceIdRef.current);
      facingRef.current = target;
      setFacing(target);
      await attach(stream);
    } catch (error) {
      console.error("[kamera] gagal mengganti kamera, kembali ke kamera sebelumnya", error);
      // Jangan biarkan layar hitam: buka lagi kamera yang tadi dipakai.
      try {
        const fallback = await openMedia(previous);
        facingRef.current = previous;
        setFacing(previous);
        await attach(fallback);
      } catch (fallbackError) {
        console.error("[kamera] kamera sebelumnya juga gagal dibuka", fallbackError);
        if (mountedRef.current) {
          setError(errorName(fallbackError) === "InsecureContextError" ? "insecure" : mapCameraError(fallbackError));
        }
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setSwitching(false);
    }
  }, [attach, release]);

  useEffect(() => {
    mountedRef.current = true;
    const videoOnMount = videoRef.current;

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        resumeOnVisibleRef.current = activeRef.current;
        release();
        return;
      }
      if (resumeOnVisibleRef.current) {
        resumeOnVisibleRef.current = false;
        void begin(facingRef.current);
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      const stream = streamRef.current;
      streamRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoOnMount) {
        videoOnMount.pause();
        videoOnMount.srcObject = null;
      }
    };
  }, [begin, release]);

  return {
    videoRef,
    facing,
    active,
    starting,
    switching,
    error,
    hasMultipleCameras: cameraCount > 1,
    start,
    stop,
    switchCamera,
  };
}
