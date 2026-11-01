"use client";

import Image from "next/image";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import Icon from "@/components/icons/Icon";
import IconPicker from "@/components/icons/IconPicker";
import SettingsForm, { type SettingsFormRenderArgs } from "@/components/admin/SettingsForm";
import SettingsAssetField from "@/components/admin/SettingsAssetField";
import { SERVICE_TABS, type ServiceTabKey } from "@/config/service-categories";
import {
  HOME_SECTION_LABELS,
  HOME_SETTINGS_KEY,
  datetimeLocalToIso,
  homePublishError,
  homeValidate,
  isoToDatetimeLocal,
  orderedHomeSections,
  visibleHomeBanners,
  visibleHomeServices,
  type HomeBanner,
  type HomeSection,
  type HomeSettings,
} from "@/lib/home-settings";
import { isInternalPathOrHttps } from "@/lib/setting-primitives";

// Panel "Pengaturan Beranda". Semua isi beranda pelanggan dibaca dari
// site_settings.home_settings lewat pengaturan terkelola: draf -> terbitkan,
// dengan riwayat versi. Gambar diunggah ke storage dan hanya URL publik yang
// disimpan. Tidak menyentuh saldo, order, atau pembayaran.

const TEXTAREA_CLASS =
  "w-full rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20";

type SetHome = SettingsFormRenderArgs<HomeSettings>["set"];

function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const next = items.slice();
  const target = index + delta;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-gold-400" : "bg-zinc-300 dark:bg-zinc-700"}`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-zinc-950 transition-all ${checked ? "left-6" : "left-1"}`}
      />
    </button>
  );
}

function MoveButtons({
  index,
  length,
  onMove,
  subject,
}: {
  index: number;
  length: number;
  onMove: (delta: number) => void;
  subject: string;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`Naikkan ${subject}`}
        disabled={index === 0}
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
        disabled={index === length - 1}
        onClick={() => onMove(1)}
        className="px-2"
      >
        <Icon name="arrow_down" size={14} />
      </Button>
    </div>
  );
}

function BackgroundPreview({ settings }: { settings: HomeSettings }) {
  const sections = orderedHomeSections(settings);
  const banners = visibleHomeBanners(settings);
  const services = visibleHomeServices(settings);
  const hero = settings.hero;
  const highlightIndex = hero.highlight ? hero.title.indexOf(hero.highlight) : -1;

  return (
    <div className="overflow-hidden rounded-[2rem] border border-app-border bg-app-bg shadow-sm">
      <div className="space-y-3 p-3">
        {sections.length === 0 && (
          <p className="rounded-xl bg-app-inset px-3 py-6 text-center text-xs text-app-subtle">
            Semua bagian beranda sedang dimatikan.
          </p>
        )}

        {sections.map((id) => {
          if (id === "hero") {
            return (
              <div key={id} className="app-hero rounded-[1.5rem] p-4 text-white">
                <div className="flex items-center gap-2">
                  <span className="h-9 w-9 rounded-full bg-white/15" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white/80">Halo, Pelanggan</p>
                    {hero.showLevel && (
                      <span className="mt-0.5 inline-block rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-bold">
                        Silver
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-3 break-words text-lg font-black leading-6">
                  {highlightIndex >= 0 ? (
                    <>
                      {hero.title.slice(0, highlightIndex)}
                      <span className="text-mint-300">{hero.highlight}</span>
                      {hero.title.slice(highlightIndex + hero.highlight.length)}
                    </>
                  ) : (
                    hero.title
                  )}
                </p>
                {hero.description && (
                  <p className="mt-1 break-words text-[11px] leading-4 text-white/70">{hero.description}</p>
                )}
                {(hero.showBalance || hero.showAccountId) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {hero.showBalance && (
                      <span className="rounded-lg bg-white/10 px-2 py-1 text-[9px] font-bold">Saldo Rp0</span>
                    )}
                    {hero.showAccountId && (
                      <span className="rounded-lg bg-white/10 px-2 py-1 text-[9px] font-bold">ID 000000</span>
                    )}
                  </div>
                )}
              </div>
            );
          }

          if (id === "banner") {
            return (
              <div key={id} className="overflow-hidden rounded-2xl border border-app-border bg-app-surface">
                <div className="relative aspect-[16/7] bg-app-inset">
                  {banners[0] ? (
                    <Image
                      src={banners[0].imageUrl}
                      alt={banners[0].alt || "Banner"}
                      fill
                      sizes="360px"
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-[10px] font-bold text-app-subtle">
                      Banner kosong / di luar jadwal disembunyikan
                    </span>
                  )}
                </div>
                {banners.length > 1 && (
                  <p className="px-3 py-1.5 text-center text-[9px] font-bold text-app-subtle">
                    {banners.length} banner aktif bergiliran
                  </p>
                )}
              </div>
            );
          }

          if (id === "services") {
            return (
              <div key={id} className="rounded-2xl border border-app-border bg-app-surface p-3">
                <div className="grid grid-cols-4 gap-2">
                  {services.slice(0, 8).map((item) => (
                    <div key={item.id} className="flex min-w-0 flex-col items-center gap-1 text-center">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-app-inset text-app-kicker">
                        <Icon name={item.icon} size={16} />
                      </span>
                      <span className="w-full truncate text-[9px] font-bold text-app-muted">{item.label}</span>
                    </div>
                  ))}
                </div>
                {services.length === 0 && (
                  <p className="text-center text-[10px] font-bold text-app-subtle">Semua layanan disembunyikan.</p>
                )}
              </div>
            );
          }

          return (
            <div
              key={id}
              className="flex items-center gap-2 rounded-2xl border border-dashed border-app-border bg-app-surface/60 px-3 py-2"
            >
              <span className="h-6 w-6 rounded-lg bg-app-inset" aria-hidden />
              <p className="min-w-0 text-[10px] font-bold text-app-subtle">{HOME_SECTION_LABELS[id]}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HeroCard({ value, set }: { value: HomeSettings; set: SetHome }) {
  const hero = value.hero;
  const patch = (next: Partial<HomeSettings["hero"]>) => set("hero", { ...hero, ...next });

  return (
    <Card>
      <CardTitle>Hero beranda</CardTitle>
      <CardDescription>
        Sapaan dan ringkasan singkat di bagian paling atas beranda. Teks tampil sebagai teks biasa, bukan HTML.
      </CardDescription>

      <div className="mt-4 space-y-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <label htmlFor="hero-title" className="text-sm font-bold text-app-text">
              Judul
            </label>
            <span className="text-xs font-bold text-app-subtle">{hero.title.length}/120</span>
          </div>
          <input
            id="hero-title"
            value={hero.title}
            maxLength={120}
            onChange={(event) => patch({ title: event.target.value })}
            className="w-full rounded-xl border border-app-border bg-app-surface px-4 py-3 text-sm text-app-text outline-none transition focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"
          />
        </div>

        <Input
          label="Sorotan judul (opsional)"
          value={hero.highlight}
          maxLength={60}
          hint="Bagian dari judul yang diberi warna aksen. Harus sama persis dengan potongan judul."
          onChange={(event) => patch({ highlight: event.target.value })}
        />

        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <label htmlFor="hero-description" className="text-sm font-bold text-app-text">
              Kalimat penjelas
            </label>
            <span className="text-xs font-bold text-app-subtle">{hero.description.length}/240</span>
          </div>
          <textarea
            id="hero-description"
            rows={3}
            value={hero.description}
            maxLength={240}
            onChange={(event) => patch({ description: event.target.value })}
            className={TEXTAREA_CLASS}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["showBalance", "Tampilkan saldo"],
              ["showLevel", "Tampilkan level"],
              ["showAccountId", "Tampilkan ID akun"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 rounded-xl border border-app-border bg-app-inset/60 px-3 py-2.5 text-sm font-bold text-app-text">
              <input
                type="checkbox"
                checked={hero[key]}
                onChange={(event) => patch({ [key]: event.target.checked })}
                className="h-4 w-4 accent-gold-400"
              />
              <span className="min-w-0 break-words">{label}</span>
            </label>
          ))}
        </div>
      </div>
    </Card>
  );
}

function BannerCard({ value, set }: { value: HomeSettings; set: SetHome }) {
  const banners = value.banners;

  function patchBanner(index: number, next: Partial<HomeBanner>) {
    set(
      "banners",
      banners.map((banner, i) => (i === index ? { ...banner, ...next } : banner))
    );
  }

  function addBanner() {
    if (banners.length >= 20) return;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `banner-${Date.now()}`;
    set("banners", [
      ...banners,
      { id, imageUrl: "", alt: "", href: "", isActive: true, startsAt: null, endsAt: null },
    ]);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Banner / slider</CardTitle>
          <CardDescription>
            Gambar dipotong 16:7 dan dikompres WEBP. Banner kosong, nonaktif, atau di luar jadwal tidak
            ditampilkan sama sekali, termasuk ruangnya.
          </CardDescription>
        </div>
        <Badge tone={banners.length > 0 ? "gold" : "neutral"} className="px-2 py-0.5">
          {banners.length}/20
        </Badge>
      </div>

      <div className="mt-4 space-y-4">
        {banners.length === 0 && (
          <p className="rounded-xl bg-app-inset px-3 py-4 text-center text-xs text-app-subtle">
            Belum ada banner. Beranda tidak menampilkan bagian banner sampai banner ditambahkan.
          </p>
        )}

        {banners.map((banner, index) => (
          <div key={banner.id} className="rounded-2xl border border-app-border bg-app-inset/40 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-black text-app-text">Banner {index + 1}</p>
                <Badge tone={banner.isActive ? "success" : "neutral"} className="px-2 py-0.5">
                  {banner.isActive ? "Aktif" : "Nonaktif"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={banner.isActive}
                  label={`Tampilkan banner ${index + 1}`}
                  onChange={(next) => patchBanner(index, { isActive: next })}
                />
                <MoveButtons
                  index={index}
                  length={banners.length}
                  subject={`banner ${index + 1}`}
                  onMove={(delta) => set("banners", moveItem(banners, index, delta))}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-danger-600 dark:text-danger-400"
                  onClick={() => set("banners", banners.filter((_, i) => i !== index))}
                >
                  Hapus
                </Button>
              </div>
            </div>

            <div className="mt-3 space-y-3">
              <SettingsAssetField
                kind="banner"
                label="Gambar banner"
                hint="Rasio 16:7. Bagian tengah gambar dipakai bila rasionya berbeda."
                value={banner.imageUrl}
                previewClassName="aspect-[16/7] w-full max-w-[320px]"
                onChange={(url) => patchBanner(index, { imageUrl: url })}
              />

              <Input
                label="Teks alternatif"
                value={banner.alt}
                maxLength={160}
                hint="Dibaca pembaca layar dan tampil bila gambar gagal dimuat."
                onChange={(event) => patchBanner(index, { alt: event.target.value })}
              />

              <Input
                label="Link tujuan (opsional)"
                value={banner.href}
                placeholder="/promo atau https://contoh.com/promo"
                error={
                  banner.href && !isInternalPathOrHttps(banner.href)
                    ? "Link hanya boleh path internal (diawali /) atau https."
                    : null
                }
                onChange={(event) => patchBanner(index, { href: event.target.value })}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Mulai tampil (opsional)"
                  type="datetime-local"
                  value={isoToDatetimeLocal(banner.startsAt)}
                  onChange={(event) => patchBanner(index, { startsAt: datetimeLocalToIso(event.target.value) })}
                />
                <Input
                  label="Selesai tampil (opsional)"
                  type="datetime-local"
                  value={isoToDatetimeLocal(banner.endsAt)}
                  onChange={(event) => patchBanner(index, { endsAt: datetimeLocalToIso(event.target.value) })}
                />
              </div>
            </div>
          </div>
        ))}

        <Button type="button" variant="outline" onClick={addBanner} disabled={banners.length >= 20}>
          Tambah banner
        </Button>
      </div>
    </Card>
  );
}

function ServicesCard({ value, set }: { value: HomeSettings; set: SetHome }) {
  const items = value.services.items;

  function patchItem(index: number, next: Partial<HomeSettings["services"]["items"][number]>) {
    set("services", { items: items.map((item, i) => (i === index ? { ...item, ...next } : item)) });
  }

  return (
    <Card>
      <CardTitle>Layanan beranda</CardTitle>
      <CardDescription>
        Nama, ikon, kategori tab, dan urutan tombol layanan di beranda. Matikan sakelar untuk
        menyembunyikan layanan tanpa menghapus datanya.
      </CardDescription>

      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <div key={item.id} className="rounded-2xl border border-app-border bg-app-inset/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-surface text-app-kicker">
                  <Icon name={item.icon} size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-app-text">{item.label || "Tanpa nama"}</p>
                  <p className="text-[11px] font-medium text-app-subtle">/layanan/{item.slug}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={item.visible}
                  label={`Tampilkan layanan ${item.label || item.id}`}
                  onChange={(next) => patchItem(index, { visible: next })}
                />
                <MoveButtons
                  index={index}
                  length={items.length}
                  subject={`layanan ${item.label || item.id}`}
                  onMove={(delta) => set("services", { items: moveItem(items, index, delta) })}
                />
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input
                label="Nama label"
                value={item.label}
                maxLength={40}
                onChange={(event) => patchItem(index, { label: event.target.value })}
              />
              <Select
                label="Kategori tab"
                value={item.tab}
                onChange={(event) => patchItem(index, { tab: event.target.value as ServiceTabKey })}
              >
                {SERVICE_TABS.map((tab) => (
                  <option key={tab.key} value={tab.key}>
                    {tab.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-3">
              <IconPicker
                label="Ikon"
                value={item.icon}
                onChange={(name) => patchItem(index, { icon: name === "none" ? "default" : name })}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SectionsCard({ value, set }: { value: HomeSettings; set: SetHome }) {
  const sections = value.sections;

  function patchSection(index: number, next: Partial<HomeSection>) {
    set(
      "sections",
      sections.map((section, i) => (i === index ? { ...section, ...next } : section))
    );
  }

  return (
    <Card>
      <CardTitle>Urutan &amp; bagian beranda</CardTitle>
      <CardDescription>
        Geser urutan dengan tombol panah. Bagian yang dimatikan tidak dirender dan tidak menyisakan ruang.
      </CardDescription>

      <ul className="mt-4 space-y-2">
        {sections.map((section, index) => (
          <li
            key={section.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-app-border bg-app-inset/40 px-3 py-2.5"
          >
            <p className="min-w-0 break-words text-sm font-bold text-app-text">
              <span className="mr-2 inline-block text-xs font-black text-app-subtle">{index + 1}.</span>
              {HOME_SECTION_LABELS[section.id]}
            </p>
            <div className="flex items-center gap-2">
              <Switch
                checked={section.visible}
                label={`Tampilkan bagian ${HOME_SECTION_LABELS[section.id]}`}
                onChange={(next) => patchSection(index, { visible: next })}
              />
              <MoveButtons
                index={index}
                length={sections.length}
                subject={HOME_SECTION_LABELS[section.id]}
                onMove={(delta) => set("sections", moveItem(sections, index, delta))}
              />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function AdminHomeSettingsPage() {
  return (
    <SettingsForm<HomeSettings>
      settingKey={HOME_SETTINGS_KEY}
      title="Pengaturan Beranda"
      description="Atur banner, layanan, teks hero, dan urutan bagian beranda. Perubahan baru tampil setelah diterbitkan, tanpa deploy ulang."
      validate={homeValidate}
      publishError={homePublishError}
      renderPreview={(value) => <BackgroundPreview settings={value} />}
      previewTitle="Pratinjau beranda"
      previewDescription="Lebar 360px, mode mengikuti tema yang sedang dipakai."
      previewHint="Banner di luar jadwal dan layanan yang dimatikan tidak tampil di pratinjau, sama seperti beranda pelanggan."
    >
      {({ value, set }) => (
        <>
          <HeroCard value={value} set={set} />
          <BannerCard value={value} set={set} />
          <ServicesCard value={value} set={set} />
          <SectionsCard value={value} set={set} />
        </>
      )}
    </SettingsForm>
  );
}
