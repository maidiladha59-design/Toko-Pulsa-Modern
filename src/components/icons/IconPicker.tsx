"use client";

import { useMemo, useState } from "react";
import Icon from "./Icon";
import IconTile from "./IconTile";
import { ICON_NAMES } from "./registry";
import { mapEmojiToIcon } from "./emoji-map";
import type { IconName } from "./registry";
import Input from "@/components/ui/Input";

/** Pemilih ikon untuk panel admin: admin hanya bisa memilih dari registry, bukan mengetik emoji. */
export default function IconPicker({
  value,
  onChange,
  label = "Ikon",
  disabled = false,
  allowNone = false,
}: {
  value: string;
  onChange: (name: IconName | "none") => void;
  label?: string;
  disabled?: boolean;
  /** Tambahkan opsi "Tanpa ikon" untuk pengaturan yang boleh tampil polos. */
  allowNone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const isNone = allowNone && value === "none";
  const selected = isNone ? "none" : mapEmojiToIcon(value);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return ICON_NAMES;
    return ICON_NAMES.filter((name) => name.includes(needle));
  }, [query]);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-3 rounded-xl border border-app-border bg-app-inset px-3 py-2 text-left transition hover:border-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 disabled:opacity-60"
        >
          {isNone ? (
            <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-2xl border border-dashed border-app-border text-app-subtle">
              <Icon name="ban" size={20} />
            </span>
          ) : (
            <IconTile name={selected} size={44} iconSize={24} />
          )}
          <span className="min-w-0">
            <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-app-subtle">
              {label}
            </span>
            <span className="block truncate text-sm font-bold text-app-text">{isNone ? "Tanpa ikon" : selected}</span>
          </span>
          <Icon name="chevron_down" size={16} className="ml-auto text-app-subtle" />
        </button>
        {!isNone && <Icon name={selected} size={28} className="text-app-kicker" title={`Pratinjau ikon ${selected}`} />}
      </div>

      <p className="mt-2 text-[11px] font-medium leading-4 text-app-subtle">
        Gunakan pemilih ikon, bukan emoji. Ikon mengikuti warna tema terang dan gelap.
      </p>

      {open && (
        <div className="mt-3 min-w-0 rounded-2xl border border-app-border bg-app-surface p-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari nama ikon, mis. wallet"
            aria-label="Cari ikon"
          />
          {allowNone && query.trim() === "" && (
            <button
              type="button"
              onClick={() => {
                onChange("none");
                setOpen(false);
              }}
              title="none"
              aria-pressed={isNone}
              className={`mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-xl border px-2 text-[11px] font-bold transition hover:border-gold-400 ${
                isNone ? "border-gold-400 bg-app-accent-soft text-app-text" : "border-app-border bg-app-inset text-app-subtle"
              }`}
            >
              <Icon name="ban" size={18} /> Tanpa ikon
            </button>
          )}
          {matches.length === 0 ? (
            <p className="mt-3 text-xs font-bold text-app-subtle">
              Tidak ada ikon dengan nama itu.
            </p>
          ) : (
            <div className="mt-3 grid max-h-64 grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-2 overflow-y-auto">
              {matches.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                    setQuery("");
                  }}
                  title={name}
                  aria-pressed={name === selected}
                  className={`flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 transition hover:border-gold-400 ${
                    name === selected
                      ? "border-gold-400 bg-app-accent-soft"
                      : "border-app-border bg-app-inset"
                  }`}
                >
                  <Icon name={name} size={20} className="text-app-kicker" />
                  <span className="w-full truncate text-center text-[9px] font-bold text-app-subtle">
                    {name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
