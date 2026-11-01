"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import Icon from "@/components/icons/Icon";
import SettingsForm, { type SettingsFormRenderArgs } from "@/components/admin/SettingsForm";
import SettingsAssetField from "@/components/admin/SettingsAssetField";
import {
  MIN_CONTRAST,
  THEME_CARD_STYLE_LABEL,
  THEME_CARD_STYLES,
  THEME_FONTS,
  THEME_FONT_KEYS,
  THEME_HERO_PRESETS,
  THEME_PRESETS,
  THEME_RADII,
  THEME_RADIUS_KEYS,
  THEME_SETTINGS_KEY,
  applyHeroPreset,
  applyThemePreset,
  heroCssVariables,
  normalizeHexColor,
  themeContrastChecks,
  themePreviewStyle,
  themePublishError,
  type ThemeColors,
  type ThemeHeroColors,
  type ThemeHeroPresetKey,
  type ThemePresetKey,
  type ThemeSettings,
} from "@/lib/theme-settings";

// Panel "Tema & Branding". Tema disimpan sebagai hex tervalidasi lalu diubah
// server menjadi variabel CSS di <head> (tanpa kilatan warna lama). Pratinjau
// di sini langsung memakai variabel yang sama pada lebar 360px, terang dan
// gelap berdampingan. Terbitkan diblokir bila kontras teks utama < 4,5:1.

type SetTheme = SettingsFormRenderArgs<ThemeSettings>["set"];

const COLOR_FIELDS: ReadonlyArray<{ key: keyof ThemeColors; label: string; hint?: string }> = [
  { key: "primary", label: "Warna utama" },
  { key: "accent", label: "Warna aksen" },
  { key: "background", label: "Latar halaman" },
  { key: "card", label: "Kartu / permukaan" },
  { key: "text", label: "Teks utama" },
  { key: "success", label: "Sukses" },
  { key: "warning", label: "Peringatan" },
  { key: "danger", label: "Bahaya" },
];

const HERO_COLOR_FIELDS: ReadonlyArray<{ key: keyof ThemeHeroColors; label: string; hint?: string }> = [
  { key: "bgFrom", label: "Latar awal", hint: "Warna kiri atas gradasi hero." },
  { key: "bgTo", label: "Latar akhir", hint: "Warna kanan bawah gradasi hero." },
  { key: "text", label: "Warna teks", hint: "Judul, nama, dan saldo." },
  { key: "textMuted", label: "Warna teks redup", hint: "Sapaan, label, dan keterangan." },
  { key: "accent", label: "Warna aksen", hint: "Kata highlight, ikon, dan fokus." },
];

function themeValidate(value: ThemeSettings): string | null {
  if (!value.identity.shopName.trim()) return "Nama toko wajib diisi.";
  if (value.identity.shopName.length > 60) return "Nama toko maksimal 60 karakter.";
  if (value.identity.tagline.length > 160) return "Tagline maksimal 160 karakter.";
  for (const mode of ["light", "dark"] as const) {
    for (const field of COLOR_FIELDS) {
      if (!normalizeHexColor(value[mode][field.key])) {
        return `Warna ${field.label.toLowerCase()} mode ${mode === "light" ? "terang" : "gelap"} harus format hex.`;
      }
    }
  }
  for (const field of HERO_COLOR_FIELDS) {
    if (!normalizeHexColor(value.hero[field.key])) {
      return `${field.label} kartu hero harus format hex.`;
    }
  }
  return null;
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const parsed = normalizeHexColor(draft);

  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-xs font-bold text-app-text">{label}</p>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`Pilih ${label}`}
          value={parsed ?? value}
          onChange={(event) => {
            setDraft(event.target.value);
            onChange(event.target.value);
          }}
          className="h-10 w-11 shrink-0 cursor-pointer rounded-lg border border-app-border bg-app-surface p-1"
        />
        <input
          aria-label={`Kode hex ${label}`}
          value={draft}
          maxLength={9}
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            const normalized = normalizeHexColor(next);
            if (normalized) onChange(normalized);
          }}
          className={`w-full min-w-0 rounded-lg border bg-app-surface px-2.5 py-2 font-mono text-xs text-app-text outline-none focus:ring-2 ${
            parsed
              ? "border-app-border focus:border-gold-400 focus:ring-gold-400/20"
              : "border-danger-400 focus:border-danger-500 focus:ring-danger-500/20"
          }`}
        />
      </div>
      {!parsed && draft.trim() !== "" && (
        <p className="mt-1 text-[10px] font-bold text-danger-600 dark:text-danger-400">Format: #RRGGBB</p>
      )}
    </div>
  );
}

function ModeColors({
  mode,
  settings,
  set,
}: {
  mode: "light" | "dark";
  settings: ThemeSettings;
  set: SetTheme;
}) {
  const colors = settings[mode];
  return (
    <div className="min-w-0 rounded-2xl border border-app-border bg-app-inset/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-app-text">{mode === "light" ? "Mode terang" : "Mode gelap"}</p>
        <span
          aria-hidden
          className="h-5 w-5 rounded-full border border-app-border"
          style={{ backgroundColor: colors.background }}
        />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {COLOR_FIELDS.map((field) => (
          <ColorField
            key={field.key}
            label={field.label}
            value={colors[field.key]}
            onChange={(hex) => {
              set(mode, { ...colors, [field.key]: hex });
              if (settings.preset !== "custom") set("preset", "custom");
            }}
          />
        ))}
      </div>
    </div>
  );
}

function IdentityCard({ value, set }: { value: ThemeSettings; set: SetTheme }) {
  const identity = value.identity;
  const patch = (next: Partial<ThemeSettings["identity"]>) => set("identity", { ...identity, ...next });

  return (
    <Card>
      <CardTitle>Identitas toko</CardTitle>
      <CardDescription>
        Nama, tagline, dan aset yang tampil di navigasi, tab browser, serta saat tautan dibagikan.
      </CardDescription>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label="Nama toko"
          value={identity.shopName}
          maxLength={60}
          onChange={(event) => patch({ shopName: event.target.value })}
        />
        <Input
          label="Tagline"
          value={identity.tagline}
          maxLength={160}
          onChange={(event) => patch({ tagline: event.target.value })}
        />
      </div>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <SettingsAssetField
          kind="logo-light"
          label="Logo mode terang"
          hint="Tampil di latar terang. Gunakan PNG/WEBP transparan bila ada."
          value={identity.logoLight}
          previewClassName="h-20 w-40"
          onChange={(url) => patch({ logoLight: url })}
        />
        <SettingsAssetField
          kind="logo-dark"
          label="Logo mode gelap"
          hint="Tampil di latar gelap. Gunakan versi terang dari logo."
          value={identity.logoDark}
          previewClassName="h-20 w-40 bg-zinc-900"
          onChange={(url) => patch({ logoDark: url })}
        />
        <SettingsAssetField
          kind="favicon"
          label="Favicon"
          hint="Ikon kecil di tab browser. Disarankan gambar sederhana."
          value={identity.faviconUrl}
          previewClassName="h-16 w-16"
          onChange={(url) => patch({ faviconUrl: url })}
        />
        <SettingsAssetField
          kind="og"
          label="Gambar share (OG)"
          hint="Muncul saat tautan AIDIL STORE dibagikan. Rasio 1200×630."
          value={identity.ogImageUrl}
          previewClassName="aspect-[1200/630] w-full max-w-[280px]"
          onChange={(url) => patch({ ogImageUrl: url })}
        />
      </div>
    </Card>
  );
}

function PresetCard({ value, set }: { value: ThemeSettings; set: SetTheme }) {
  return (
    <Card>
      <CardTitle>Preset warna</CardTitle>
      <CardDescription>
        Pilih titik awal, lalu sesuaikan tiap warna bila perlu. Mengubah satu warna menandai tema sebagai
        &ldquo;Kustom&rdquo;. Tombol Kembalikan Default ada di bagian bawah halaman.
      </CardDescription>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {THEME_PRESETS.map((preset) => {
          const active = value.preset === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                const next = applyThemePreset(value, preset.key as ThemePresetKey);
                set("light", next.light);
                set("dark", next.dark);
                set("preset", next.preset);
              }}
              className={`min-w-0 rounded-2xl border p-3 text-left transition hover:border-gold-400 ${
                active ? "border-gold-400 bg-app-accent-soft" : "border-app-border bg-app-inset/40"
              }`}
            >
              <div className="flex gap-1.5">
                {[preset.light.primary, preset.light.accent, preset.light.background, preset.light.text].map(
                  (color, index) => (
                    <span
                      key={`${preset.key}-light-${index}`}
                      aria-hidden
                      className="h-5 w-5 rounded-full border border-black/10"
                      style={{ backgroundColor: color }}
                    />
                  )
                )}
                {[preset.dark.primary, preset.dark.accent, preset.dark.background].map((color, index) => (
                  <span
                    key={`${preset.key}-dark-${index}`}
                    aria-hidden
                    className="h-5 w-5 rounded-full border border-white/20"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <p className="mt-2 text-sm font-black text-app-text">{preset.label}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-app-subtle">{preset.description}</p>
            </button>
          );
        })}
      </div>

      {value.preset === "custom" && (
        <p className="mt-3 rounded-xl bg-warning-100 px-3 py-2 text-xs font-bold text-warning-800 dark:bg-warning-500/15 dark:text-warning-300">
          Tema saat ini memakai warna kustom, bukan salah satu preset.
        </p>
      )}
    </Card>
  );
}

function ContrastCard({ value }: { value: ThemeSettings }) {
  const checks = themeContrastChecks(value);
  const failing = checks.filter((check) => !check.pass);

  return (
    <Card>
      <CardTitle>Pemeriksa kontras</CardTitle>
      <CardDescription>
        Rasio teks utama terhadap latar dan kartu. Minimal {MIN_CONTRAST}:1 agar mudah dibaca.
      </CardDescription>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {checks.map((check) => (
          <li
            key={`${check.mode}-${check.label}`}
            className="flex items-center justify-between gap-2 rounded-xl border border-app-border bg-app-inset/40 px-3 py-2"
          >
            <span className="min-w-0 break-words text-xs font-bold text-app-text">
              {check.modeLabel} · {check.label}
            </span>
            <Badge tone={check.pass ? "success" : "danger"} className="shrink-0 px-2 py-0.5">
              {check.ratio}:1
            </Badge>
          </li>
        ))}
      </ul>

      {failing.length > 0 ? (
        <p className="mt-3 rounded-xl border border-warning-400/40 bg-warning-50 px-3 py-2 text-xs font-bold leading-5 text-warning-800 dark:bg-warning-500/10 dark:text-warning-300">
          {failing.length} pasangan teks belum lolos. Terbitkan diblokir sampai kontras teks utama
          minimal {MIN_CONTRAST}:1. Draf tetap bisa disimpan.
        </p>
      ) : (
        <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          Semua pasangan teks utama lolos kontras minimal {MIN_CONTRAST}:1.
        </p>
      )}
    </Card>
  );
}

function TypographyCard({ value, set }: { value: ThemeSettings; set: SetTheme }) {
  const font = THEME_FONTS.find((entry) => entry.key === value.font) ?? THEME_FONTS[0];
  return (
    <Card>
      <CardTitle>Huruf, sudut, dan kartu</CardTitle>
      <CardDescription>
        Hanya font yang disiapkan lewat next/font agar tidak ada font yang diunduh dari sumber luar saat
        halaman dibuka.
      </CardDescription>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Select
          label="Font"
          value={value.font}
          onChange={(event) => set("font", event.target.value as ThemeSettings["font"])}
        >
          {THEME_FONTS.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </Select>
        <Select
          label="Radius sudut"
          value={value.radius}
          onChange={(event) => set("radius", event.target.value as ThemeSettings["radius"])}
        >
          {THEME_RADIUS_KEYS.map((key) => (
            <option key={key} value={key}>
              {THEME_RADII[key].label}
            </option>
          ))}
        </Select>
        <Select
          label="Gaya kartu"
          value={value.cardStyle}
          onChange={(event) => set("cardStyle", event.target.value as ThemeSettings["cardStyle"])}
        >
          {THEME_CARD_STYLES.map((key) => (
            <option key={key} value={key}>
              {THEME_CARD_STYLE_LABEL[key]}
            </option>
          ))}
        </Select>
      </div>

      <p
        className="mt-3 rounded-xl bg-app-inset px-3 py-2 text-sm text-app-text"
        style={{ fontFamily: font.stack }}
      >
        Contoh teks: Pulsa, data, dan tagihan lebih praktis di {value.identity.shopName || "toko Anda"}.
      </p>
      <p className="mt-1.5 text-[11px] text-app-subtle">
        Font &ldquo;{font.label}&rdquo; dipakai di halaman pelanggan setelah tema diterbitkan.
      </p>
    </Card>
  );
}

function HeroCard({ value, set }: { value: ThemeSettings; set: SetTheme }) {
  const hero = value.hero;
  const patch = (key: keyof ThemeHeroColors, hex: string) => {
    set("hero", { ...hero, [key]: hex });
    set("heroPreset", "custom");
  };

  return (
    <Card>
      <CardTitle>Kartu Hero</CardTitle>
      <CardDescription>
        Satu set warna untuk kartu utama di beranda, halaman saldo, peringkat, dan layanan. Nilai ini
        berlaku di mode terang maupun gelap supaya teks selalu terbaca. Pemeriksa kontras memastikan
        teks hero minimal {MIN_CONTRAST}:1 terhadap latar awal dan akhir.
      </CardDescription>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {THEME_HERO_PRESETS.map((preset) => {
          const active = value.heroPreset === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                const next = applyHeroPreset(value, preset.key as ThemeHeroPresetKey);
                set("hero", next.hero);
                set("heroPreset", next.heroPreset);
              }}
              className={`min-w-0 rounded-2xl border p-3 text-left transition hover:border-gold-400 ${
                active ? "border-gold-400 bg-app-accent-soft" : "border-app-border bg-app-inset/40"
              }`}
            >
              <div className="flex gap-1.5">
                {[preset.colors.bgFrom, preset.colors.bgTo, preset.colors.accent].map((color, index) => (
                  <span
                    key={`${preset.key}-${index}`}
                    aria-hidden
                    className="h-5 w-5 rounded-full border border-white/20"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <p className="mt-2 text-sm font-black text-app-text">{preset.label}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-app-subtle">{preset.description}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {HERO_COLOR_FIELDS.map((field) => (
          <div key={field.key} className="min-w-0">
            <ColorField
              label={field.label}
              value={hero[field.key]}
              onChange={(hex) => patch(field.key, hex)}
            />
            {field.hint ? <p className="mt-1 text-[10px] leading-4 text-app-subtle">{field.hint}</p> : null}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <HeroPreview value={value} />
      </div>

      {value.heroPreset === "custom" && (
        <p className="mt-3 rounded-xl bg-warning-100 px-3 py-2 text-xs font-bold text-warning-800 dark:bg-warning-500/15 dark:text-warning-300">
          Warna kartu hero saat ini kustom, bukan salah satu preset.
        </p>
      )}
    </Card>
  );
}

function HeroPreview({ value }: { value: ThemeSettings }) {
  const style = heroCssVariables(value.hero) as React.CSSProperties;

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-widest text-app-subtle">Pratinjau hero</p>
        <span className="flex items-center gap-1 text-[10px] font-bold text-app-subtle">
          <Icon name="sun" size={12} /> <Icon name="moon" size={12} /> Terang &amp; gelap
        </span>
      </div>

      <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[1.75rem] border border-app-border bg-app-surface p-3">
        <div className="app-hero rounded-2xl p-4" style={style}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[9px] font-bold" style={{ color: "var(--hero-text-muted)" }}>
                Selamat datang
              </p>
              <p className="mt-0.5 break-words text-sm font-black" style={{ color: "var(--hero-text)" }}>
                {value.identity.shopName || "Nama toko"}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black"
              style={{
                backgroundColor: "rgba(16, 185, 129, 0.22)",
                borderColor: "rgba(110, 231, 183, 0.45)",
                color: "#6ee7b7",
              }}
            >
              Terverifikasi
            </span>
          </div>

          <div
            className="mt-2 rounded-xl border p-2"
            style={{ backgroundColor: "var(--hero-chip-bg)", borderColor: "var(--hero-chip-border)" }}
          >
            <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: "var(--hero-text-muted)" }}>
              Saldo
            </p>
            <p className="text-base font-black" style={{ color: "var(--hero-text)" }}>
              Rp 1.950
            </p>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {["Profil", "Rekap", "Bantuan", "Info"].map((label) => (
              <span
                key={label}
                className="rounded-full border px-2 py-0.5 text-[9px] font-bold"
                style={{
                  backgroundColor: "var(--hero-chip-bg)",
                  borderColor: "var(--hero-chip-border)",
                  color: "var(--hero-text)",
                }}
              >
                {label}
              </span>
            ))}
          </div>

          <p className="mt-2 text-[9px] leading-4" style={{ color: "var(--hero-text-muted)" }}>
            Pulsa, data, dan tagihan{" "}
            <span className="font-black" style={{ color: "var(--hero-accent)" }}>
              lebih praktis
            </span>{" "}
            di satu akun.
          </p>

          <span
            className="mt-2 inline-block rounded-full border px-2 py-0.5 text-[9px] font-bold"
            style={{
              backgroundColor: "var(--hero-chip-bg)",
              borderColor: "var(--hero-chip-border)",
              color: "var(--hero-text-muted)",
            }}
          >
            ID: AIDIL-0001
          </span>
        </div>
      </div>
    </div>
  );
}

function PhonePreview({ value, mode }: { value: ThemeSettings; mode: "light" | "dark" }) {
  const colors = value[mode];
  const style = themePreviewStyle(colors, value) as React.CSSProperties;
  const light = mode === "light";

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-widest text-app-subtle">
          {light ? "Terang" : "Gelap"}
        </p>
        <span className="flex items-center gap-1 text-[10px] font-bold text-app-subtle">
          <Icon name={light ? "sun" : "moon"} size={12} /> {light ? "Light" : "Dark"}
        </span>
      </div>

      <div
        className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[1.75rem] border p-3"
        style={{ ...style, borderColor: "rgb(var(--app-border))" }}
      >
        <div className="space-y-2.5">
          <div className="app-hero rounded-2xl p-4">
            <p
              className="text-[9px] font-black uppercase tracking-[0.2em]"
              style={{ color: "var(--hero-accent)" }}
            >
              {value.identity.shopName || "NAMA TOKO"}
            </p>
            <p
              className="mt-1.5 break-words text-base font-black leading-5"
              style={{ color: "var(--hero-text)" }}
            >
              {value.identity.tagline || "Tagline toko Anda tampil di sini."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className="rounded-full px-3 py-1.5 text-[10px] font-black"
                style={{ backgroundColor: "var(--theme-primary)", color: "var(--theme-on-primary)" }}
              >
                Top Up
              </span>
              <span
                className="rounded-full px-3 py-1.5 text-[10px] font-black"
                style={{ backgroundColor: "var(--theme-accent)", color: "var(--theme-on-accent)" }}
              >
                Bayar Tagihan
              </span>
            </div>
          </div>

          <div
            className="p-3"
            style={{
              backgroundColor: "var(--app-surface)",
              borderRadius: "var(--app-radius-card)",
              boxShadow: "var(--app-card-shadow)",
              border: "1px solid rgb(var(--app-border))",
            }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="h-11 w-11 shrink-0 rounded-xl"
                style={{ backgroundColor: "rgb(var(--app-inset))" }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="truncate text-xs font-black" style={{ color: "var(--app-text)" }}>
                  Paket Data 10 GB
                </p>
                <p className="text-[10px] font-bold" style={{ color: "var(--app-muted)" }}>
                  Rp55.000 · stok tersedia
                </p>
                <p className="mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-black" style={{ backgroundColor: "rgb(var(--app-accent-soft))", color: "var(--app-kicker)" }}>
                  Populer
                </p>
              </div>
            </div>
          </div>

          <div
            className="flex items-center justify-around px-2 py-2"
            style={{
              backgroundColor: "var(--app-surface)",
              borderTop: "1px solid rgb(var(--app-border))",
              borderRadius: "var(--app-radius-card)",
            }}
          >
            {(
              [
                ["home", "Beranda", true],
                ["grid", "Layanan", false],
                ["receipt", "Riwayat", false],
                ["wallet", "Dompet", false],
                ["user", "Akun", false],
              ] as const
            ).map(([icon, label, active]) => (
              <span key={icon} className="flex min-w-0 flex-col items-center gap-0.5">
                <Icon
                  name={icon}
                  size={16}
                  style={{ color: active ? "var(--theme-primary)" : "var(--app-subtle)" }}
                />
                <span
                  className="text-[8px] font-bold"
                  style={{ color: active ? "var(--theme-primary)" : "var(--app-subtle)" }}
                >
                  {label}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LivePreview({ value }: { value: ThemeSettings }) {
  return (
    <Card>
      <CardTitle>Pratinjau langsung</CardTitle>
      <CardDescription>
        Lebar 360px, terang dan gelap berdampingan. Warna, font, radius, dan gaya kartu berubah seketika
        saat isian diubah.
      </CardDescription>
      <div className="mt-4 grid gap-5 xl:grid-cols-2">
        <PhonePreview value={value} mode="light" />
        <PhonePreview value={value} mode="dark" />
      </div>
    </Card>
  );
}

export default function AdminThemeBrandingPage() {
  return (
    <SettingsForm<ThemeSettings>
      settingKey={THEME_SETTINGS_KEY}
      title="Tema & Branding"
      description="Warna, huruf, bentuk, dan identitas toko. Setelah diterbitkan, tema langsung dipakai server di seluruh halaman pelanggan tanpa deploy ulang."
      validate={themeValidate}
      publishError={themePublishError}
    >
      {({ value, set }) => (
        <>
          <IdentityCard value={value} set={set} />
          <PresetCard value={value} set={set} />
          <Card>
            <CardTitle>Warna tema</CardTitle>
            <CardDescription>
              Semua warna wajib hex. Server hanya menulis variabel CSS yang diizinkan, lalu memakai nilai
              ini untuk latar, kartu, teks, tombol, dan status.
            </CardDescription>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <ModeColors mode="light" settings={value} set={set} />
              <ModeColors mode="dark" settings={value} set={set} />
            </div>
          </Card>
          <HeroCard value={value} set={set} />
          <ContrastCard value={value} />
          <TypographyCard value={value} set={set} />
          <LivePreview value={value} />
        </>
      )}
    </SettingsForm>
  );
}
