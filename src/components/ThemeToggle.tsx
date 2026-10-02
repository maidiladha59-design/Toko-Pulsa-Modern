"use client";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";

type Mode = "light" | "dark" | "system";

const OPTIONS: { value: Mode; label: string; icon: string }[] = [
  { value: "light", label: "Terang", icon: "☀️" },
  { value: "dark", label: "Gelap", icon: "🌙" },
  { value: "system", label: "Sistem", icon: "🖥️" },
];

const isMode = (v: unknown): v is Mode => v === "light" || v === "dark" || v === "system";

export default function ThemeToggle({ variant = "compact" }: { variant?: "compact" | "block" }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const choseLocally = useRef(false);

  useEffect(() => setMounted(true), []);

  // Saat user login, preferensi di Supabase menang atas localStorage.
  useEffect(() => {
    if (!mounted) return;
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await supabase
          .from("user_app_settings")
          .select("theme_preference")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled || choseLocally.current) return;
        const pref = data?.theme_preference;
        if (isMode(pref)) setTheme(pref);
      } catch {
        // Kolom/belum termigrasi: tetap pakai localStorage, jangan ganggu tema.
      }
    })();
    return () => { cancelled = true; };
  }, [mounted, setTheme]);

  async function choose(value: Mode) {
    setOpen(false);
    choseLocally.current = true;
    setTheme(value);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("user_app_settings")
        .upsert({ user_id: user.id, theme_preference: value, updated_at: new Date().toISOString() });
    } catch {
      // Gagal sinkron ke Supabase: localStorage tetap tersimpan oleh next-themes.
    }
  }

  const current: Mode = isMode(theme) ? theme : "system";

  if (variant === "block") {
    return (
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(o => (
          <button
            key={o.value}
            onClick={() => choose(o.value)}
            aria-pressed={mounted && current === o.value}
            className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-3 text-xs font-black transition ${
              mounted && current === o.value
                ? "border-gold-400 bg-app-accent-soft text-app-text"
                : "border-app-border bg-app-inset text-app-muted hover:border-gold-400/50"
            }`}
          >
            <span className="text-xl leading-none">{o.icon}</span>
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Ganti tema"
        title="Ganti tema"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-app-border bg-app-surface text-lg text-app-muted transition hover:bg-app-accent-soft"
      >
        {mounted ? OPTIONS.find(o => o.value === current)?.icon : "◐"}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[90] mt-2 w-44 overflow-hidden rounded-2xl border border-app-border bg-app-surface p-1.5 shadow-2xl">
          {OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => choose(o.value)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition ${
                mounted && current === o.value
                  ? "bg-app-accent-soft text-app-text"
                  : "text-app-muted hover:bg-app-accent-soft hover:text-app-text"
              }`}
            >
              <span className="text-base leading-none">{o.icon}</span>
              <span className="flex-1">{o.label}</span>
              {mounted && current === o.value && <span className="text-app-kicker">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
