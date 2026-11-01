"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/icons/Icon";
import PaymentChannelFeesPage from "../payment-channel-fees/page";
import PlatformPage from "../platform/page";
import PricingPage from "../pricing/page";

type FeeTab = "channel" | "platform" | "harga";

const TABS: { key: FeeTab; label: string; icon: string }[] = [
  { key: "channel", label: "Biaya Channel", icon: "coin" },
  { key: "platform", label: "Platform & Biaya", icon: "settings" },
  { key: "harga", label: "Harga Transaksi", icon: "calculator" },
];

function isFeeTab(value: string | null): value is FeeTab {
  return value === "channel" || value === "platform" || value === "harga";
}

export default function AdminFeesPage() {
  const [tab, setTab] = useState<FeeTab>("channel");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (isFeeTab(requested)) setTab(requested);
  }, []);

  function changeTab(next: FeeTab) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Keuangan</p>
        <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Biaya</h1>
        <p className="mt-1 text-sm text-app-muted">
          Semua pengaturan biaya dalam satu tempat: biaya per channel pembayaran, biaya platform, dan harga transaksi PPOB.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => changeTab(item.key)}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
              tab === item.key
                ? "bg-gold-400 text-app-on-primary"
                : "border border-app-border bg-app-surface text-app-text hover:border-gold-400/60"
            }`}
          >
            <Icon name={item.icon} size={16} />
            <span className="break-words">{item.label}</span>
          </button>
        ))}
      </div>

      {tab === "channel" && <PaymentChannelFeesPage />}
      {tab === "platform" && <PlatformPage />}
      {tab === "harga" && <PricingPage />}
    </div>
  );
}
