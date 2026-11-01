"use client";

import { useState, type CSSProperties } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import Icon from "@/components/icons/Icon";
import IconPicker from "@/components/icons/IconPicker";
import SettingsForm, { type SettingsFormRenderArgs } from "@/components/admin/SettingsForm";
import BottomNav from "@/components/BottomNav";
import { ADMIN_MENU, flattenAdminMenu } from "@/lib/admin-menu";
import {
  BOTTOM_NAV_ACCENT_OPTIONS,
  BOTTOM_NAV_ADMIN_KEY,
  BOTTOM_NAV_SHOP_KEY,
  BOTTOM_NAV_VARIANT_OPTIONS,
  bottomNavHomeTarget,
  bottomNavTargetOptions,
  bottomNavValidate,
  type BottomNavAccent,
  type BottomNavActiveEffect,
  type BottomNavHeight,
  type BottomNavItem,
  type BottomNavRadius,
  type BottomNavScope,
  type BottomNavSettings,
  type BottomNavVariant,
} from "@/lib/bottom-nav";
import { themePreviewStyle, type ThemeSettings } from "@/lib/theme-settings";

// Panel Navigasi Bawah (Toko & Admin). Satu formulir per lingkup memakai
// SettingsForm yang sama dengan panel pengaturan lain: draf -> terbitkan,
// riwayat versi, audit log, dan revalidateTag saat terbit. Pratinjau memakai
// komponen BottomNav asli pada bingkai 360px terang + gelap.

type SetNav = SettingsFormRenderArgs<BottomNavSettings>["set"];

const DEFAULT_VARIANT: BottomNavVariant = "kapsul";

const HEIGHT_LABEL: Record<BottomNavHeight, string> = {
  ringkas: "Ringkas",
  normal: "Normal",
  besar: "Besar",
};

const RADIUS_LABEL: Record<BottomNavRadius, string> = {
  kecil: "Kecil",
  sedang: "Sedang",
  besar: "Besar",
};

const ACTIVE_EFFECT_LABEL: Record<BottomNavActiveEffect, string> = {
  slide: "Indikator geser",
  none: "Tanpa indikator",
};

const SHOP_ICONS: Record<string, string> = {
  "/": "home",
  "/layanan": "grid",
  "/wallet": "wallet",
  "/transactions": "receipt",
  "/orders": "box",
  "/dashboard": "chart_bar",
  "/profile": "user",
  "/bantuan": "help",
  "/diskusi": "chat",
  "/scan-qris": "scan",
  "/referral": "gift",
  "/missions": "target",
  "/kyc": "id_card",
  "/settings": "settings",
  menu: "menu",
};

const ADMIN_ICONS: Record<string, string> = Object.fromEntries(
  flattenAdminMenu(ADMIN_MENU).map((item) => [item.href, item.icon])
);

const ADD_LABELS: Record<string, string> = {
  "/layanan": "Layanan",
  "/wallet": "Saldo",
  "/transactions": "Transaksi",
  "/orders": "Pesanan",
  "/dashboard": "Dashboard",
  "/profile": "Profil",
  "/bantuan": "Bantuan",
  "/diskusi": "Diskusi",
  "/scan-qris": "Scan",
  "/referral": "Undang",
  "/missions": "Misi",
  "/kyc": "Verifikasi",
  "/settings": "Atur",
  "/admin/orders": "Pesanan",
  "/admin/users": "Pengguna",
  menu: "Menu",
};

function validateShop(value: BottomNavSettings): string | null {
  return navValidate(value, "shop");
}

function validateAdmin(value: BottomNavSettings): string | null {
  return navValidate(value, "admin");
}

function navValidate(value: BottomNavSettings, scope: BottomNavScope): string | null {
  if (!value.items.some((item) => item.visible)) return "Minimal satu item navigasi harus tampil.";
  return bottomNavValidate(value, scope);
}

function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-gold-400" : "bg-zinc-300 dark:bg-zinc-700"
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-zinc-950 transition-all ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

function MoveButtons({
  index,
  length,
  onMove,
  subject,
  locked,
}: {
  index: number;
  length: number;
  onMove: (delta: number) => void;
  subject: string;
  locked: boolean;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`Naikkan ${subject}`}
        disabled={locked || index <= 1}
        onClick={() => onMove(-1)}
        className="px-2"
      >
        <Icon name="arrow_up" size={14} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`Turunkan ${subject}`}
        disabled={locked || index === 0 || index === length - 1}
        onClick={() => onMove(1)}
        className="px-2"
      >
        <Icon name="arrow_down" size={14} />
      </Button>
    </div>
  );
}

function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index <= 0 || index >= items.length || target <= 0 || target >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

function nextItem(scope: BottomNavScope, settings: BottomNavSettings): BottomNavItem | null {
  const used = new Set(settings.items.map((item) => item.target));
  const home = bottomNavHomeTarget(scope);
  const option = bottomNavTargetOptions(scope).find(
    (candidate) => candidate.value !== home && !used.has(candidate.value)
  );
  if (!option) return null;
  const label = (ADD_LABELS[option.value] || option.label).slice(0, 12);
  return {
    id: `nav-${Date.now().toString(36)}${settings.items.length}`,
    label,
    icon: (scope === "admin" ? ADMIN_ICONS[option.value] : SHOP_ICONS[option.value]) || "grid",
    target: option.value,
    visible: true,
    login_only: false,
    center: false,
  };
}

function VariantGallery({
  value,
  set,
  previewActive,
}: {
  value: BottomNavSettings;
  set: SetNav;
  previewActive: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {BOTTOM_NAV_VARIANT_OPTIONS.map((option) => {
        const selected = value.variant === option.key;
        const needsCenter =
          option.key === "tengah" && !value.items.some((item) => item.center && item.visible);
        const sampleItems = needsCenter
          ? value.items.map((item, index) => ({
              ...item,
              center: index === Math.floor(value.items.length / 2),
            }))
          : value.items;
        const sample: BottomNavSettings = {
          ...value,
          variant: option.key,
          show_labels: option.key === "ikon" ? false : value.show_labels,
          items: sampleItems,
        };

        return (
          <div
            key={option.key}
            className={`min-w-0 rounded-2xl border p-3 transition ${
              selected ? "border-gold-400 bg-app-accent-soft" : "border-app-border bg-app-inset/40"
            }`}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="min-w-0 text-sm font-black text-app-text">{option.label}</p>
              {selected && (
                <Badge tone="gold" className="px-2 py-0.5">
                  Terpilih
                </Badge>
              )}
              {option.key === DEFAULT_VARIANT && (
                <Badge tone="neutral" className="px-2 py-0.5">
                  Default
                </Badge>
              )}
            </div>

            <div className="relative mt-2 h-28 overflow-hidden rounded-xl border border-app-border bg-app-surface">
              <BottomNav
                settings={sample}
                embedded
                compact
                previewActive={previewActive}
                onSelect={() => undefined}
                ariaLabel={`Contoh gaya ${option.label}`}
              />
            </div>

            <p className="mt-2 text-[11px] leading-4 text-app-subtle">{option.description}</p>
            <Button
              type="button"
              size="sm"
              variant={selected ? "secondary" : "outline"}
              className="mt-2 w-full"
              aria-pressed={selected}
              onClick={() => set("variant", option.key)}
            >
              {selected ? "Gaya terpilih" : "Pilih gaya ini"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function PhonePreview({
  value,
  theme,
  mode,
  scope,
  previewActive,
  onSelect,
}: {
  value: BottomNavSettings;
  theme: ThemeSettings;
  mode: "light" | "dark";
  scope: BottomNavScope;
  previewActive: string;
  onSelect: (item: BottomNavItem) => void;
}) {
  const style = themePreviewStyle(theme[mode], theme) as CSSProperties;
  const light = mode === "light";
  const badges: Record<string, number> = scope === "admin" ? { "/admin/orders": 3 } : { "/wallet": 1 };

  return (
    <div className="w-[360px] max-w-full shrink-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-widest text-app-subtle">
          {light ? "Terang" : "Gelap"}
        </p>
        <span className="flex items-center gap-1 text-[10px] font-bold text-app-subtle">
          <Icon name={light ? "sun" : "moon"} size={12} /> {light ? "Light" : "Dark"}
        </span>
      </div>

      <div className={mode === "dark" ? "dark" : ""}>
        <div
          className="relative min-h-[430px] w-[360px] max-w-full overflow-hidden rounded-[1.75rem] border p-3"
          style={{ ...style, borderColor: "rgb(var(--app-border))" }}
        >
          <div className="space-y-2.5 pb-32">
            <div className="app-hero rounded-2xl p-3">
              <p
                className="text-[9px] font-black uppercase tracking-[0.2em]"
                style={{ color: "var(--hero-accent)" }}
              >
                {scope === "admin" ? "PANEL ADMIN" : theme.identity.shopName || "AIDIL STORE"}
              </p>
              <p
                className="mt-1 break-words text-sm font-black leading-5"
                style={{ color: "var(--hero-text)" }}
              >
                {scope === "admin" ? "Ringkasan operasional hari ini" : "Semua transaksi, satu genggaman."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-xl border border-app-border bg-app-surface p-2"
                >
                  <span className="h-8 w-8 shrink-0 rounded-lg bg-app-inset" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-black text-app-text">
                      {scope === "admin" ? "Antrean" : "Layanan"}
                    </p>
                    <p className="truncate text-[9px] font-bold text-app-subtle">
                      {scope === "admin" ? `${index + 2} menunggu` : "Siap dipakai"}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-app-border bg-app-surface p-2.5">
              <p className="text-[9px] font-black uppercase tracking-widest text-app-subtle">
                {scope === "admin" ? "Aktivitas" : "Saldo"}
              </p>
              <p className="mt-0.5 text-sm font-black text-app-text">
                {scope === "admin" ? "12 transaksi diproses" : "Rp 125.000"}
              </p>
              <div className="mt-2 h-2 w-full rounded-full bg-app-inset" aria-hidden />
            </div>

            <p className="text-center text-[9px] font-bold text-app-subtle">
              Ketuk item di bawah untuk menguji perpindahan indikator.
            </p>
          </div>

          <BottomNav
            settings={value}
            embedded
            badges={badges}
            previewActive={previewActive}
            onSelect={onSelect}
            ariaLabel={`Pratinjau navigasi ${light ? "terang" : "gelap"}`}
          />
        </div>
      </div>
    </div>
  );
}

function NavPreview({
  value,
  theme,
  scope,
  previewActive,
  setPreviewActive,
}: {
  value: BottomNavSettings;
  theme: ThemeSettings;
  scope: BottomNavScope;
  previewActive: string;
  setPreviewActive: (target: string) => void;
}) {
  const visibleItems = value.items.filter((item) => item.visible);
  const activeTarget = visibleItems.some((item) => item.target === previewActive)
    ? previewActive
    : visibleItems[0]?.target || "";

  function cycle() {
    if (visibleItems.length === 0) return;
    const index = visibleItems.findIndex((item) => item.target === activeTarget);
    const next = visibleItems[(index + 1) % visibleItems.length];
    setPreviewActive(next.target);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle>Pratinjau langsung 360px</CardTitle>
          <CardDescription>
            Komponen navigasi asli, mode terang dan gelap berdampingan. Ketuk item atau putar
            animasi untuk melihat perpindahan indikator.
          </CardDescription>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={cycle} disabled={visibleItems.length === 0}>
          <Icon name="refresh" size={14} /> Putar animasi
        </Button>
      </div>

      <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
        <PhonePreview
          value={value}
          theme={theme}
          mode="light"
          scope={scope}
          previewActive={activeTarget}
          onSelect={(item) => setPreviewActive(item.target)}
        />
        <PhonePreview
          value={value}
          theme={theme}
          mode="dark"
          scope={scope}
          previewActive={activeTarget}
          onSelect={(item) => setPreviewActive(item.target)}
        />
      </div>
    </Card>
  );
}

function OptionsCard({
  value,
  set,
  previewActive,
}: {
  value: BottomNavSettings;
  set: SetNav;
  previewActive: string;
}) {
  return (
    <Card>
      <CardTitle>Gaya &amp; perilaku</CardTitle>
      <CardDescription>
        Tujuh gaya memakai data item yang sama. Semua warna dari variabel tema; warna aksen preset
        hanya menimpa warna aktif.
      </CardDescription>

      <div className="mt-4">
        <VariantGallery value={value} set={set} previewActive={previewActive} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Select
          label="Sudut (gaya melayang)"
          value={value.radius}
          onChange={(event) => set("radius", event.target.value as BottomNavRadius)}
          hint="Hanya dipakai gaya kapsul, pil, kaca, dan ikon."
        >
          {(Object.keys(RADIUS_LABEL) as BottomNavRadius[]).map((key) => (
            <option key={key} value={key}>
              {RADIUS_LABEL[key]}
            </option>
          ))}
        </Select>

        <Select
          label="Tinggi navigasi"
          value={value.height}
          onChange={(event) => set("height", event.target.value as BottomNavHeight)}
        >
          {(Object.keys(HEIGHT_LABEL) as BottomNavHeight[]).map((key) => (
            <option key={key} value={key}>
              {HEIGHT_LABEL[key]}
            </option>
          ))}
        </Select>

        <Select
          label="Warna aksen navigasi"
          value={value.accent}
          onChange={(event) => set("accent", event.target.value as BottomNavAccent)}
          hint="Semua pilihan sudah memenuhi kontras minimal 4,5:1."
        >
          {BOTTOM_NAV_ACCENT_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          label="Efek item aktif"
          value={value.active_effect}
          onChange={(event) => set("active_effect", event.target.value as BottomNavActiveEffect)}
          hint="Indikator geser hanya tampil pada gaya kapsul dan kaca."
        >
          {(Object.keys(ACTIVE_EFFECT_LABEL) as BottomNavActiveEffect[]).map((key) => (
            <option key={key} value={key}>
              {ACTIVE_EFFECT_LABEL[key]}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {(
          [
            ["show_labels", "Tampilkan label", "Disembunyikan otomatis pada gaya ikon."],
            ["animate", "Animasi perpindahan", "Mematikan menghapus semua transisi."],
            ["haptic", "Getaran saat diketuk", "Hanya di perangkat yang mendukung."],
          ] as const
        ).map(([key, label, hint]) => (
          <div
            key={key}
            className="flex items-center justify-between gap-2 rounded-xl border border-app-border bg-app-inset/60 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-app-text">{label}</p>
              <p className="text-[11px] leading-4 text-app-subtle">{hint}</p>
            </div>
            <Switch
              label={label}
              checked={key === "show_labels" && value.variant === "ikon" ? false : value[key]}
              disabled={key === "show_labels" && value.variant === "ikon"}
              onChange={(next) => set(key, next)}
            />
          </div>
        ))}
      </div>

      {value.variant === "tengah" && !value.items.some((item) => item.center && item.visible) && (
        <p className="mt-3 rounded-xl border border-warning-400/40 bg-warning-50 px-3 py-2 text-xs font-bold leading-5 text-warning-800 dark:bg-warning-500/10 dark:text-warning-300">
          Belum ada tombol tengah yang tampil. Navigasi otomatis kembali ke gaya Kapsul sampai satu
          item ditandai sebagai tombol tengah.
        </p>
      )}
    </Card>
  );
}

function ItemsCard({
  value,
  set,
  scope,
}: {
  value: BottomNavSettings;
  set: SetNav;
  scope: BottomNavScope;
}) {
  const items = value.items;
  const [centerId, setCenterId] = useState<string>("");
  const selectedCenter = items.find((item) => item.center)?.id || centerId;
  const homeTarget = bottomNavHomeTarget(scope);

  function patchItem(index: number, next: Partial<BottomNavItem>) {
    set(
      "items",
      items.map((item, i) => (i === index ? { ...item, ...next } : item))
    );
  }

  function addItem() {
    if (items.length >= 5) return;
    const item = nextItem(scope, value);
    if (!item) return;
    set("items", [...items, item]);
  }

  function removeItem(index: number) {
    if (index === 0 || items.length <= 3) return;
    set("items", items.filter((_, i) => i !== index));
  }

  function markCenter(id: string) {
    setCenterId(id);
    set(
      "items",
      items.map((item) => ({ ...item, center: id !== "" && item.id === id }))
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle>Isi menu</CardTitle>
          <CardDescription>
            3–5 item. Item pertama selalu {scope === "admin" ? "Dashboard" : "Beranda"} dan tidak
            bisa dihapus atau dipindah. Tujuan hanya boleh halaman internal yang terdaftar.
          </CardDescription>
        </div>
        <Badge tone={items.length > 0 ? "gold" : "neutral"} className="px-2 py-0.5">
          {items.length}/5
        </Badge>
      </div>

      {value.variant === "tengah" && (
        <div className="mt-4">
          <Select
            label="Tombol tengah (gaya Tengah)"
            value={selectedCenter || ""}
            onChange={(event) => markCenter(event.target.value)}
            hint="Satu item menjadi tombol bulat besar di tengah."
          >
            <option value="">Tidak ada — jatuh ke gaya Kapsul</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label || item.id}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {items.map((item, index) => {
          const locked = index === 0;
          const usedElsewhere = new Set(
            items.filter((_, i) => i !== index).map((other) => other.target)
          );
          const options = bottomNavTargetOptions(scope).filter(
            (option) => option.value === item.target || !usedElsewhere.has(option.value)
          );

          return (
            <div key={item.id} className="rounded-2xl border border-app-border bg-app-inset/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-surface text-app-kicker">
                    <Icon name={item.icon} size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-app-text">
                      {item.label || "Tanpa nama"}
                    </p>
                    <p className="truncate text-[11px] font-medium text-app-subtle">{item.target}</p>
                  </div>
                  {item.center && (
                    <Badge tone="mint" className="px-2 py-0.5">
                      Tengah
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-app-subtle">
                    Tampil
                    <Switch
                      checked={item.visible}
                      label={`Tampilkan ${item.label || item.id}`}
                      onChange={(next) => patchItem(index, { visible: next })}
                    />
                  </span>
                  <MoveButtons
                    index={index}
                    length={items.length}
                    locked={locked}
                    subject={`item ${item.label || item.id}`}
                    onMove={(delta) => set("items", moveItem(items, index, delta))}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-danger-600 dark:text-danger-400"
                    disabled={locked || items.length <= 3}
                    onClick={() => removeItem(index)}
                  >
                    Hapus
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label htmlFor={`nav-label-${item.id}`} className="text-sm font-bold text-app-text">
                      Label
                    </label>
                    <span className="text-xs font-bold text-app-subtle">{item.label.length}/12</span>
                  </div>
                  <input
                    id={`nav-label-${item.id}`}
                    value={item.label}
                    maxLength={12}
                    onChange={(event) => patchItem(index, { label: event.target.value })}
                    className="w-full rounded-xl border border-app-border bg-app-surface px-4 py-3 text-sm text-app-text outline-none transition focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"
                  />
                </div>

                <Select
                  label="Tujuan"
                  value={item.target}
                  disabled={locked}
                  onChange={(event) => patchItem(index, { target: event.target.value })}
                  hint={locked ? "Item pertama selalu halaman beranda." : undefined}
                >
                  {locked ? (
                    <option value={homeTarget}>{bottomNavTargetOptions(scope).find((o) => o.value === homeTarget)?.label || homeTarget}</option>
                  ) : (
                    options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))
                  )}
                </Select>
              </div>

              <div className="mt-3">
                <IconPicker
                  label="Ikon"
                  value={item.icon}
                  onChange={(name) => patchItem(index, { icon: name === "none" ? "grid" : name })}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-app-border bg-app-surface px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-app-text">Hanya pengguna masuk</p>
                  <p className="text-[11px] leading-4 text-app-subtle">
                    Item disembunyikan dari pengunjung yang belum login.
                  </p>
                </div>
                <Switch
                  label={`Hanya pengguna masuk untuk ${item.label || item.id}`}
                  checked={item.login_only}
                  onChange={(next) => patchItem(index, { login_only: next })}
                />
              </div>

              {locked && (
                <p className="mt-2 text-[11px] font-bold text-app-subtle">
                  Item pertama terkunci agar setiap halaman selalu punya jalan pulang.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <Button type="button" variant="outline" onClick={addItem} disabled={items.length >= 5 || !nextItem(scope, value)}>
          Tambah item
        </Button>
        {items.length >= 5 && (
          <p className="mt-2 text-xs text-app-subtle">Maksimal 5 item. Hapus satu untuk menambah yang lain.</p>
        )}
      </div>
    </Card>
  );
}

function NavEditor({
  value,
  set,
  scope,
  theme,
}: {
  value: BottomNavSettings;
  set: SetNav;
  scope: BottomNavScope;
  theme: ThemeSettings;
}) {
  const [previewActive, setPreviewActive] = useState<string>("");
  const visibleItems = value.items.filter((item) => item.visible);
  const activeTarget = visibleItems.some((item) => item.target === previewActive)
    ? previewActive
    : visibleItems[0]?.target || "";

  return (
    <>
      <NavPreview
        value={value}
        theme={theme}
        scope={scope}
        previewActive={previewActive}
        setPreviewActive={setPreviewActive}
      />
      <OptionsCard value={value} set={set} previewActive={activeTarget} />
      <ItemsCard value={value} set={set} scope={scope} />
    </>
  );
}

export default function BottomNavSettingsEditor({ theme }: { theme: ThemeSettings }) {
  const [scope, setScope] = useState<BottomNavScope>("shop");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={scope === "shop" ? "secondary" : "outline"}
          aria-pressed={scope === "shop"}
          onClick={() => setScope("shop")}
        >
          <Icon name="home" size={15} /> Navigasi Toko
        </Button>
        <Button
          type="button"
          variant={scope === "admin" ? "secondary" : "outline"}
          aria-pressed={scope === "admin"}
          onClick={() => setScope("admin")}
        >
          <Icon name="sliders" size={15} /> Navigasi Admin
        </Button>
      </div>

      {/* Kedua formulir tetap ter-mount supaya draf yang belum disimpan tidak
          hilang saat admin berpindah tab. */}
      <div className={scope === "shop" ? "space-y-5" : "hidden"}>
        <SettingsForm<BottomNavSettings>
          settingKey={BOTTOM_NAV_SHOP_KEY}
          title="Navigasi Bawah Toko"
          description="Pilih bentuk navigasi dan atur isi menunya. Perubahan tampil di halaman pelanggan setelah diterbitkan, tanpa deploy ulang."
          validate={validateShop}
        >
          {({ value, set }) => <NavEditor value={value} set={set} scope="shop" theme={theme} />}
        </SettingsForm>
      </div>

      <div className={scope === "admin" ? "space-y-5" : "hidden"}>
        <SettingsForm<BottomNavSettings>
          settingKey={BOTTOM_NAV_ADMIN_KEY}
          title="Navigasi Bawah Admin"
          description="Navigasi khusus panel admin. Gaya boleh berbeda dari toko; item hanya tampil bila peran admin punya akses ke halamannya."
          validate={validateAdmin}
        >
          {({ value, set }) => <NavEditor value={value} set={set} scope="admin" theme={theme} />}
        </SettingsForm>
      </div>
    </div>
  );
}
