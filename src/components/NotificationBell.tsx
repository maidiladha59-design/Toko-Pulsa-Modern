"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Notice = {
  id: string; type: string; title: string; subtitle?: string;
  message: string; order_id: string | null; is_read: boolean; created_at: string;
};

export default function NotificationBell() {
  const supabase = createClient();
  const [items, setItems] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setItems([]); return; }
    const r = await fetch("/api/notifications", { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setItems(d.notifications || []);
    }
  }

  useEffect(() => {
    load();
    const t = window.setInterval(load, 20000);
    return () => window.clearInterval(t);
  }, []);

  const unread = items.filter(x => !x.is_read).length;

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
      <p className="text-sm font-black text-slate-800">{n.title}</p>
      {n.subtitle && <p className="mt-1 text-xs font-semibold text-slate-600">{n.subtitle}</p>}
      <p className="mt-1 text-xs leading-5 text-slate-500">{n.message}</p>
    </>
  );

  return (
    <div className="sm:relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg text-slate-600 hover:bg-slate-50"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1 text-center text-[10px] font-black leading-5 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute inset-x-3 top-full z-[80] mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:right-0 sm:w-[360px]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-black">Notifikasi</p>
            <button onClick={readAll} className="text-xs font-bold text-gold-600">Tandai dibaca</button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Belum ada notifikasi.</p>
            ) : (
              items.slice(0, 12).map(n => (
                <div key={n.id} className={`border-b border-slate-50 px-4 py-3 ${n.is_read ? "" : "bg-gold-50/60"}`}>
                  {n.order_id ? (
                    <Link href={`/orders/${n.order_id}`} onClick={() => setOpen(false)} className="block">
                      {body(n)}
                    </Link>
                  ) : body(n)}
                  <p className="mt-1 text-[10px] text-slate-400">
                    {new Date(n.created_at).toLocaleString("id-ID")}
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