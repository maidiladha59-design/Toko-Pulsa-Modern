"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";

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
      <div className="customer-shell"><div className="mx-auto w-full max-w-[480px]">
      <ErrorState title="Gagal memuat referral" description={err} />
      </div></div>
    );
  }

  if (!d) return <div className="customer-shell"><div className="mx-auto w-full max-w-[480px]"><LoadingSkeleton rows={4} /></div></div>;

  const link = typeof window !== "undefined" ? `${window.location.origin}/register?ref=${d.r.code}` : `/register?ref=${d.r.code}`;

  return (
    <div className="customer-shell"><div className="mx-auto w-full max-w-[480px] space-y-5 animate-page-in lg:max-w-2xl">
      <Card className="p-6">
        <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Undang Teman</p>
        <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Ajak 20 teman, bonus Rp5.000</h1>
        <p className="mt-2 text-sm text-app-muted">Teman harus mendaftar melalui link kamu dan menyelesaikan transaksi agar dihitung.</p>
      </Card>

      <Card>
        <p className="text-sm font-bold text-app-text">Kode referral</p>
        <div className="mt-2 flex gap-2">
          <input readOnly value={d.r.code} className="flex-1 rounded-xl border border-app-border bg-app-inset p-3 font-black tracking-widest text-app-kicker outline-none" />
          <Button onClick={() => navigator.clipboard.writeText(link)} className="min-h-[44px] px-4">
            Salin Link
          </Button>
        </div>
        <p className="mt-2 break-all text-xs text-app-subtle">{link}</p>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-app-inset">
          <div className="h-full bg-gold-400" style={{ width: `${Math.min(100, ((d.rw?.qualified_count || 0) / 20) * 100)}%` }} />
        </div>
        <p className="mt-2 text-sm font-black tabular-nums text-app-text">{d.rw?.qualified_count || 0}/20 teman memenuhi syarat</p>
        <p className="mt-1 text-xs text-app-subtle">
          Hadiah: <span className="font-bold tabular-nums text-app-kicker">{formatRupiah(d.rw?.reward_amount || 5000)}</span> {d.rw?.claimed_at ? "• Sudah cair" : ""}
        </p>
      </Card>

      <Card>
        <h2 className="text-base font-black text-app-text">Riwayat referral</h2>
        <div className="mt-3 space-y-2">
          {d.u.length ? (
            d.u.map((x: any) => (
              <div key={x.referred_user_id} className="flex items-center justify-between gap-3 rounded-xl border border-app-border bg-app-inset p-3 text-xs">
                <b className="text-app-text">{x.referred_user_id.slice(0, 8)}…</b>
                <Badge tone={x.qualified_at ? "success" : "neutral"}>{x.qualified_at ? "Sudah transaksi" : "Belum memenuhi syarat"}</Badge>
              </div>
            ))
          ) : (
            <EmptyState icon="👥" title="Belum ada teman" description="Bagikan link referral di atas untuk mulai mengundang." />
          )}
        </div>
      </Card>
    </div></div>
  );
}