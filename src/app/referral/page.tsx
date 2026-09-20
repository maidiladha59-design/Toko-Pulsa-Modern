"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah } from "@/lib/utils";

export default function Referral() {
  const s = createClient();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await s.auth.getUser();
      if (!user) { setErr("Silakan login terlebih dahulu."); return; }

      let { data: r, error: selErr } = await s
        .from("referrals")
        .select("id,code")
        .eq("referrer_id", user.id)
        .maybeSingle();
      if (selErr) { setErr(selErr.message); return; }

      if (!r) {
        const code = (user.id.replaceAll("-", "").slice(0, 6) + "AIDIL").toUpperCase();
        const x = await s.from("referrals").insert({ referrer_id: user.id, code }).select("id,code").single();
        if (x.error) { setErr(x.error.message); return; }
        r = x.data;
      }

      if (r) {
        const { data: u, error: uErr } = await s
          .from("referral_uses")
          .select("referred_user_id,registered_at,qualified_at")
          .eq("referral_id", r.id)
          .order("registered_at", { ascending: false });
        if (uErr) { setErr(uErr.message); return; }

        const { data: rw, error: rwErr } = await s
          .from("referral_rewards")
          .select("qualified_count,threshold,reward_amount,claimed_at")
          .eq("referral_id", r.id)
          .maybeSingle();
        if (rwErr) { setErr(rwErr.message); return; }

        setD({ r, u: u || [], rw });
      }
    })();
  }, [s]);

  if (err) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl bg-white p-8">
        <p className="font-black text-red-700">Gagal memuat referral.</p>
        <p className="mt-1 text-sm text-slate-500">{err}</p>
      </div>
    );
  }

  if (!d) return <div className="mx-auto max-w-lg rounded-3xl bg-white p-8">Memuat referral...</div>;

  const link = typeof window !== "undefined" ? `${window.location.origin}/register?ref=${d.r.code}` : `/register?ref=${d.r.code}`;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-3xl bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-widest text-amber-300">Undang Teman</p>
        <h1 className="mt-2 text-3xl font-black">Ajak 20 teman, bonus Rp5.000</h1>
        <p className="mt-2 text-sm text-white/60">Teman harus mendaftar melalui link kamu dan menyelesaikan transaksi agar dihitung.</p>
      </div>

      <div className="rounded-3xl border bg-white p-5">
        <p className="text-sm font-bold">Kode referral</p>
        <div className="mt-2 flex gap-2">
          <input readOnly value={d.r.code} className="flex-1 rounded-xl border bg-slate-50 p-3 font-black" />
          <button onClick={() => navigator.clipboard.writeText(link)} className="rounded-xl bg-slate-950 px-4 text-sm font-black text-white">
            Salin Link
          </button>
        </div>
        <p className="mt-2 break-all text-xs text-slate-400">{link}</p>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-amber-400" style={{ width: `${Math.min(100, ((d.rw?.qualified_count || 0) / 20) * 100)}%` }} />
        </div>
        <p className="mt-2 text-sm font-black">{d.rw?.qualified_count || 0}/20 teman memenuhi syarat</p>
        <p className="mt-1 text-xs text-slate-500">
          Hadiah: {formatRupiah(d.rw?.reward_amount || 5000)} {d.rw?.claimed_at ? "• Sudah cair" : ""}
        </p>
      </div>

      <div className="rounded-3xl border bg-white p-5">
        <h2 className="font-black">Riwayat referral</h2>
        <div className="mt-3 space-y-2">
          {d.u.length ? (
            d.u.map((x: any) => (
              <div key={x.referred_user_id} className="rounded-xl bg-slate-50 p-3 text-xs">
                <b>{x.referred_user_id.slice(0, 8)}…</b>
                <span className="ml-2 text-slate-500">{x.qualified_at ? "Sudah transaksi" : "Belum memenuhi syarat"}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-400">Belum ada teman.</p>
          )}
        </div>
      </div>
    </div>
  );
}