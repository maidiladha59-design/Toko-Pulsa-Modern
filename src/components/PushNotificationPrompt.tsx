"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export default function PushNotificationPrompt() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unknown">("unknown");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    setSupported("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
    if ("Notification" in window) setPermission(Notification.permission);
  }, []);

  async function enablePush() {
    if (!supported || busy) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Silakan login terlebih dahulu.");

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("VAPID public key belum dikonfigurasi.");

      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") throw new Error("Izin notifikasi belum diberikan.");

      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const response = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!response.ok) throw new Error("Gagal mengaktifkan notifikasi.");
      setDone(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Gagal mengaktifkan notifikasi.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported || done || permission === "granted") return null;

  return (
    <button type="button" onClick={enablePush} disabled={busy}
      className="rounded-xl border border-gold-200 bg-gold-50 px-3 py-2 text-xs font-bold text-gold-700 hover:bg-gold-100 disabled:opacity-60">
      {busy ? "Mengaktifkan..." : "🔔 Aktifkan Notifikasi"}
    </button>
  );
}
