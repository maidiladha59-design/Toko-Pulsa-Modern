"use client";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import Icon from "@/components/icons/Icon";
import IconPicker from "@/components/icons/IconPicker";
import SettingsForm, { type SettingsFormRenderArgs } from "@/components/admin/SettingsForm";
import SettingsSwitch from "@/components/admin/SettingsSwitch";
import {
  DEFAULT_LEVEL_KYC_SETTINGS,
  KYC_LIMIT_FIELDS,
  KYC_LIMIT_STATUSES,
  KYC_LIMIT_STATUS_LABELS,
  LEVEL_KYC_SETTINGS_KEY,
  levelKycPublishError,
  levelKycValidate,
  tierMax,
  type KycLimitStatus,
  type KycLimits,
  type LevelKycSettings,
  type LevelTierSetting,
} from "@/lib/level-kyc-settings";
import { formatRupiah } from "@/lib/utils";

// Panel "Level & KYC". Level pelanggan dan batas transaksi per status KYC
// dibaca dari site_settings.level_kyc_settings. UI ini hanya mengatur nilai:
// penegakan batas terjadi di server (src/lib/kyc-limits-server.ts) pada alur
// top up, transfer, dan pembelian. Tidak menyentuh saldo atau pembayaran.

type SetLevel = SettingsFormRenderArgs<LevelKycSettings>["set"];

const TEXTAREA_CLASS =
  "w-full rounded-xl border border-app-border bg-app-surface px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20";

function formatDigits(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(safe);
}

function digitsToNumber(raw: string): number {
  const digits = raw.replace(/\D/g, "").slice(0, 13);
  return digits ? Number(digits) : 0;
}

function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const next = items.slice();
  const target = index + delta;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
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

function LevelChipPreview({ level }: { level: LevelTierSetting }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold"
      style={{ borderColor: `${level.color}55`, backgroundColor: `${level.color}1a`, color: level.color }}
    >
      <Icon name={level.icon} size={11} className="shrink-0" />
      <span className="min-w-0 truncate">Lv. {level.label || "Tanpa nama"}</span>
    </span>
  );
}

function LevelsCard({ value, set }: { value: LevelKycSettings; set: SetLevel }) {
  const levels = value.levels;

  function patchLevel(index: number, next: Partial<LevelTierSetting>) {
    set(
      "levels",
      levels.map((level, i) => (i === index ? { ...level, ...next } : level))
    );
  }

  function addLevel() {
    if (levels.length >= 10) return;
    const last = levels[levels.length - 1];
    const lastIndex = levels.length;
    set("levels", [
      ...levels,
      {
        id: `level-${lastIndex + 1}`,
        label: `Level ${lastIndex + 1}`,
        min: (last?.min ?? 0) + 10,
        color: "#2E9EF5",
        icon: "star_fill",
      },
    ]);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Tingkat pelanggan</CardTitle>
          <CardDescription>
            Level dihitung dari jumlah transaksi berhasil (bukan nominal). Batas minimal harus naik berurutan
            dan tidak tumpang tindih. Level pertama wajib dimulai dari 0.
          </CardDescription>
        </div>
        <Badge tone={levels.length > 0 ? "gold" : "danger"} className="px-2 py-0.5">
          {levels.length}/10
        </Badge>
      </div>

      <div className="mt-4 space-y-3">
        {levels.map((level, index) => {
          const max = tierMax(levels, index);
          return (
            <div key={index} className="min-w-0 rounded-2xl border border-app-border bg-app-inset/40 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <LevelChipPreview level={level} />
                  <span className="text-[11px] font-medium text-app-subtle">
                    {Number.isFinite(max)
                      ? `${formatDigits(level.min)} – ${formatDigits(max)} transaksi`
                      : `${formatDigits(level.min)}+ transaksi`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MoveButtons
                    index={index}
                    length={levels.length}
                    subject={`level ${level.label || index + 1}`}
                    onMove={(delta) => set("levels", moveItem(levels, index, delta))}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-danger-600 dark:text-danger-400"
                    disabled={levels.length <= 1}
                    onClick={() => set("levels", levels.filter((_, i) => i !== index))}
                  >
                    Hapus
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input
                  label="Nama level"
                  value={level.label}
                  maxLength={40}
                  onChange={(event) => patchLevel(index, { label: event.target.value })}
                />
                <Input
                  label="ID level"
                  value={level.id}
                  maxLength={32}
                  hint="Huruf kecil, angka, dan tanda hubung. Dipakai untuk menyimpan riwayat level."
                  error={
                    level.id && !/^[a-z0-9_-]+$/.test(level.id)
                      ? "ID hanya huruf kecil, angka, dan tanda hubung."
                      : null
                  }
                  onChange={(event) => patchLevel(index, { id: event.target.value })}
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input
                  label="Minimal transaksi berhasil"
                  inputMode="numeric"
                  value={formatDigits(level.min)}
                  hint="Contoh: 10 berarti level aktif setelah 10 transaksi berhasil."
                  onChange={(event) => patchLevel(index, { min: digitsToNumber(event.target.value) })}
                />
                <div className="min-w-0">
                  <label htmlFor={`level-color-${index}`} className="mb-2 block text-sm font-bold text-app-text">
                    Warna level
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label={`Warna level ${level.label || index + 1}`}
                      value={/^#[0-9a-fA-F]{6}$/.test(level.color) ? level.color : "#2E9EF5"}
                      onChange={(event) => patchLevel(index, { color: event.target.value.toUpperCase() })}
                      className="h-11 w-12 shrink-0 cursor-pointer rounded-xl border border-app-border bg-app-surface p-1"
                    />
                    <input
                      id={`level-color-${index}`}
                      value={level.color}
                      maxLength={7}
                      placeholder="#2E9EF5"
                      onChange={(event) => patchLevel(index, { color: event.target.value })}
                      className={`min-w-0 flex-1 rounded-xl border bg-app-surface px-4 py-3 text-sm text-app-text outline-none transition focus:ring-4 ${
                        /^#[0-9a-fA-F]{6}$/.test(level.color)
                          ? "border-app-border focus:border-gold-400 focus:ring-gold-400/20"
                          : "border-danger-400 focus:border-danger-500 focus:ring-danger-500/20"
                      }`}
                    />
                  </div>
                  {/^#[0-9a-fA-F]{6}$/.test(level.color) ? null : (
                    <p role="alert" className="mt-1.5 text-xs font-medium text-danger-600 dark:text-danger-400">
                      Warna harus format heksa 6 digit, contoh #2E9EF5.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3">
                <IconPicker
                  label="Ikon level"
                  value={level.icon}
                  onChange={(name) => patchLevel(index, { icon: name === "none" ? "star_fill" : name })}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={addLevel} disabled={levels.length >= 10}>
          Tambah level
        </Button>
        <Button type="button" variant="ghost" onClick={() => set("levels", DEFAULT_LEVEL_KYC_SETTINGS.levels)}>
          Kembalikan level bawaan
        </Button>
      </div>
    </Card>
  );
}

function KycLimitsCard({ value, set }: { value: LevelKycSettings; set: SetLevel }) {
  function patchLimit(status: KycLimitStatus, key: keyof KycLimits, next: number) {
    set("kyc", {
      ...value.kyc,
      [status]: { ...value.kyc[status], [key]: next },
    });
  }

  return (
    <Card>
      <CardTitle>Batas transaksi per status KYC</CardTitle>
      <CardDescription>
        Batas ini ditegakkan di server pada setiap top up, transfer, dan pembelian. Isi 0 untuk tanpa batas.
        Angka di sini tidak mengubah saldo, hanya menerima atau menolak transaksi baru.
      </CardDescription>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {KYC_LIMIT_STATUSES.map((status) => (
          <div key={status} className="min-w-0 rounded-2xl border border-app-border bg-app-inset/40 p-3 sm:p-4">
            <p className="break-words text-sm font-black text-app-text">{KYC_LIMIT_STATUS_LABELS[status]}</p>
            <div className="mt-3 space-y-3">
              {KYC_LIMIT_FIELDS.map((field) => (
                <div key={field.key} className="min-w-0">
                  <label
                    htmlFor={`limit-${status}-${field.key}`}
                    className="mb-1.5 block break-words text-xs font-bold text-app-muted"
                  >
                    {field.label}
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-app-subtle">
                      Rp
                    </span>
                    <input
                      id={`limit-${status}-${field.key}`}
                      inputMode="numeric"
                      value={formatDigits(value.kyc[status][field.key])}
                      onChange={(event) => patchLimit(status, field.key, digitsToNumber(event.target.value))}
                      className="w-full rounded-xl border border-app-border bg-app-surface py-2.5 pl-9 pr-3 text-right text-sm font-bold text-app-text outline-none transition focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs leading-5 text-app-subtle">
        Nilai 0 berarti tanpa batas. Batas per transaksi tidak boleh lebih besar dari batas harian.
      </p>
    </Card>
  );
}

function VerificationCard({ value, set }: { value: LevelKycSettings; set: SetLevel }) {
  const kyc = value.kyc;

  function patchKyc(next: Partial<LevelKycSettings["kyc"]>) {
    set("kyc", { ...kyc, ...next });
  }

  return (
    <Card>
      <CardTitle>Verifikasi &amp; cincin profil</CardTitle>
      <CardDescription>
        Cincin warna-warni menandai akun terverifikasi. Teks pendukung tampil di profil dan halaman KYC
        selama akun belum terverifikasi.
      </CardDescription>

      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app-border bg-app-inset/40 px-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-app-text">Cincin warna-warni hanya untuk terverifikasi</p>
            <p className="mt-0.5 text-xs leading-5 text-app-muted">
              {kyc.rainbowRingVerifiedOnly
                ? "Akun belum terverifikasi memakai cincin status biasa."
                : "Semua avatar memakai cincin warna-warni, terverifikasi atau belum."}
            </p>
          </div>
          <SettingsSwitch
            checked={kyc.rainbowRingVerifiedOnly}
            label="Cincin warna-warni hanya untuk terverifikasi"
            onChange={(next) => patchKyc({ rainbowRingVerifiedOnly: next })}
          />
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <label htmlFor="verification-hint" className="text-sm font-bold text-app-text">
              Teks pendukung verifikasi
            </label>
            <span className="text-xs font-bold text-app-subtle">{kyc.verificationHint.length}/240</span>
          </div>
          <textarea
            id="verification-hint"
            rows={3}
            value={kyc.verificationHint}
            maxLength={240}
            onChange={(event) => patchKyc({ verificationHint: event.target.value })}
            className={TEXTAREA_CLASS}
          />
          <p className="mt-1.5 text-xs text-app-subtle">
            Kalimat singkat yang menjelaskan manfaat verifikasi. Kosongkan untuk memakai teks bawaan.
          </p>
        </div>
      </div>
    </Card>
  );
}

function LevelKycPreview({ settings }: { settings: LevelKycSettings }) {
  return (
    <div className="space-y-3 rounded-[2rem] border border-app-border bg-app-bg p-3 shadow-sm">
      <div className="rounded-2xl border border-app-border bg-app-surface p-3">
        <p className="text-[10px] font-black uppercase tracking-wide text-app-subtle">Pratinjau level</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {settings.levels.map((level, index) => {
            const max = tierMax(settings.levels, index);
            return (
              <div key={index} className="flex min-w-0 flex-col gap-1">
                <LevelChipPreview level={level} />
                <span className="text-[9px] font-medium text-app-subtle">
                  {Number.isFinite(max) ? `${formatDigits(level.min)}–${formatDigits(max)}` : `${formatDigits(level.min)}+`}
                </span>
              </div>
            );
          })}
          {settings.levels.length === 0 && (
            <p className="text-xs text-app-subtle">Belum ada level. Berlaku level bawaan.</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-app-border bg-app-surface p-3">
        <p className="text-[10px] font-black uppercase tracking-wide text-app-subtle">Batas transaksi</p>
        <ul className="mt-2 space-y-2">
          {KYC_LIMIT_STATUSES.map((status) => (
            <li key={status} className="min-w-0">
              <p className="text-[11px] font-bold text-app-text">{KYC_LIMIT_STATUS_LABELS[status]}</p>
              <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
                {KYC_LIMIT_FIELDS.map((field) => (
                  <div key={field.key} className="flex min-w-0 items-baseline justify-between gap-1">
                    <dt className="min-w-0 truncate text-[9px] text-app-subtle">{field.label.replace("Maksimal ", "")}</dt>
                    <dd className="shrink-0 text-[9px] font-bold text-app-muted">
                      {settings.kyc[status][field.key] === 0
                        ? "Tanpa batas"
                        : formatRupiah(settings.kyc[status][field.key])}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-app-border bg-app-surface p-3">
        <p className="text-[10px] font-black uppercase tracking-wide text-app-subtle">Teks verifikasi</p>
        <p className="mt-2 break-words text-[11px] leading-4 text-app-muted">
          {settings.kyc.verificationHint.trim() ||
            "Verifikasi identitas untuk membuka cincin warna-warni, menaikkan batas transaksi, dan keamanan akun yang lebih baik."}
        </p>
        <p className="mt-2 text-[9px] font-semibold text-app-subtle">
          {settings.kyc.rainbowRingVerifiedOnly
            ? "Cincin warna-warni hanya untuk akun terverifikasi."
            : "Cincin warna-warni tampil untuk semua akun."}
        </p>
      </div>
    </div>
  );
}

export default function AdminLevelKycPage() {
  return (
    <SettingsForm<LevelKycSettings>
      settingKey={LEVEL_KYC_SETTINGS_KEY}
      title="Level & KYC"
      description="Atur tingkat pelanggan, batas transaksi per status verifikasi, dan cincin profil. Batas ditegakkan di server; perubahan baru berlaku setelah diterbitkan."
      validate={levelKycValidate}
      publishError={levelKycPublishError}
      renderPreview={(value) => <LevelKycPreview settings={value} />}
      previewTitle="Pratinjau level & batas"
      previewDescription="Lebar 360px, mode mengikuti tema yang sedang dipakai."
      previewHint="Angka batas di atas adalah batas maksimal per transaksi atau per hari. Nilai 0 berarti tanpa batas."
    >
      {({ value, set }) => (
        <>
          <LevelsCard value={value} set={set} />
          <KycLimitsCard value={value} set={set} />
          <VerificationCard value={value} set={set} />
        </>
      )}
    </SettingsForm>
  );
}
