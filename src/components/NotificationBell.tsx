"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import Icon from "@/components/icons/Icon";

type Notice = {
  id: string; type: string; title: string; subtitle?: string;
  message: string; order_id: string | null; is_read: boolean; created_at: string;
};

export default function NotificationBell() {
  const [items, setItems] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);

  // API sudah memvalidasi sesi (401 bila belum login), jadi tidak perlu
  // round-trip getUser() tambahan di setiap polling.
  async function load() {
    const r = await fetch("/api/notifications", { cache: "no-store" });
    if (r.status === 401) { setItems([]); return; }
    if (r.ok) {
      const d = await r.json();
      setItems(d.notifications || []);
    }
  }

  // 60 detik + berhenti saat tab tidak terlihat: tab yang ditinggal di
  // belakang tidak lagi menghabiskan kuota dan CPU ponsel.
  useEffect(() => {
    let timer: number | undefined;
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      timer = window.setInterval(load, 60000);
    };
    const sync = () => {
      if (document.visibilityState === "visible") { load(); start(); }
      else stop();
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => { stop(); document.removeEventListener("visibilitychange", sync); };
  }, []);

  const unread = items.filter(x => !x.is_read).length;

  // Bagikan ke komponen lain (badge menu cepat di hero beranda).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("aidil:notifications-updated", { detail: { unread } }));
  }, [unread]);

  async function readAll() {
    if (!unread) return;
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setItems(v => v.map(x => ({ ...x, is_read: true })));
  }

  const body = (n: Notice) => (
    <>
      <p className="text-sm font-black text-app-text">{n.title}</p>
      {n.subtitle && <p className="mt-1 text-xs font-semibold text-app-muted">{n.subtitle}</p>}
      <p className="mt-1 text-xs leading-5 text-app-subtle">{n.message}</p>
    </>
  );

  return (
    <div className="sm:relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-app-border bg-app-surface text-app-muted transition hover:bg-app-inset"
      >
        <Icon name="bell" size={18} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1 text-center text-[10px] font-black leading-5 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute inset-x-3 top-full z-[80] mt-2 overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-2xl sm:inset-x-auto sm:right-0 sm:w-[360px]">
          <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
            <p className="font-black text-app-text">Notifikasi</p>
            <button onClick={readAll} className="text-xs font-bold text-app-kicker">Tandai dibaca</button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-5 text-sm text-app-muted">Belum ada notifikasi.</p>
            ) : (
              items.slice(0, 12).map(n => (
                <div key={n.id} className={`border-b border-app-border/60 px-4 py-3 ${n.is_read ? "" : "bg-gold-400/10"}`}>
                  {n.order_id ? (
                    <Link href={`/orders/${n.order_id}`} onClick={() => setOpen(false)} className="block">
                      {body(n)}
                    </Link>
                  ) : body(n)}
                  <p className="mt-1 text-[10px] text-app-subtle">
                    {formatDate(n.created_at)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}