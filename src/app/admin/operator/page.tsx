"use client";

import { useState } from "react";
import Image from "next/image";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import Icon from "@/components/icons/Icon";
import SettingsForm, { type SettingsFormRenderArgs } from "@/components/admin/SettingsForm";
import SettingsAssetField from "@/components/admin/SettingsAssetField";
import SettingsSwitch from "@/components/admin/SettingsSwitch";
import {
  OPERATOR_SETTINGS_KEY,
  detectOperatorEntry,
  duplicatePrefixes,
  normalizePhone,
  operatorDetectSummary,
  operatorSettingsPublishError,
  operatorSettingsValidate,
  parsePrefixInput,
  type OperatorSettings,
} from "@/lib/operator-settings";

// Panel "Pengaturan Operator": peta prefix nomor ke operator untuk alur beli
// pulsa/data. Nilai disimpan di site_settings.operator_settings; alur beli
// membaca peta ini dengan fallback ke src/lib/ppob/target-guide.ts. Tidak
// menyentuh order, saldo, atau API produk.

type SetOperators = SettingsFormRenderArgs<OperatorSettings>["set"];

function OperatorLogo({ url, name, size = 40 }: { url: string; name: string; size?: number }) {
  if (!url) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-xl bg-app-surface text-app-kicker"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <Icon name="phone" size={Math.round(size / 2.2)} />
      </span>
    );
  }
  return (
    <span
      className="relative shrink-0 overflow-hidden rounded-xl border border-app-border bg-app-surface"
      style={{ width: size, height: size }}
    >
      <Image src={url} alt={name ? `Logo ${name}` : "Logo operator"} fill sizes="80px" unoptimized className="object-contain p-0.5" />
    </span>
  );
}

function OperatorCard({ value, set }: { value: OperatorSettings; set: SetOperators }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState<Record<string, string[]>>({});
  const [testNumber, setTestNumber] = useState("");
  const duplicates = duplicatePrefixes(value);
  const detected = normalizePhone(testNumber).length >= 4 ? detectOperatorEntry(testNumber, value) : null;

  function patchOperator(index: number, next: Partial<OperatorSettings["operators"][number]>) {
    set(
      "operators",
      value.operators.map((operator, i) => (i === index ? { ...operator, ...next } : operator))
    );
  }

  function addPrefixes(index: number, key: string, raw: string) {
    const operator = value.operators[index];
    const parsed = parsePrefixInput(raw);
    const added = parsed.prefixes.filter((prefix) => !operator.prefixes.includes(prefix));
    if (added.length) {
      patchOperator(index, { prefixes: [...operator.prefixes, ...added].sort() });
    }
    setInvalid((current) => ({ ...current, [key]: parsed.invalid }));
    setDrafts((current) => ({ ...current, [key]: "" }));
  }

  function removePrefix(index: number, prefix: string) {
    const operator = value.operators[index];
    patchOperator(index, { prefixes: operator.prefixes.filter((item) => item !== prefix) });
  }

  function addOperator() {
    if (value.operators.length >= 15) return;
    const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : String(Date.now());
    set("operators", [
      ...value.operators,
      { id: `operator-${suffix}`, name: "Operator baru", prefixes: [], logoUrl: "", active: false },
    ]);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Peta operator</CardTitle>
          <CardDescription>
            Prefix 4 digit menentukan operator yang terdeteksi saat pelanggan membeli pulsa atau paket data.
            Matikan sakelar untuk menonaktifkan operator tanpa menghapus datanya.
          </CardDescription>
        </div>
        <Badge tone={value.operators.length > 0 ? "gold" : "danger"} className="px-2 py-0.5">
          {value.operators.length}/15
        </Badge>
      </div>

      {duplicates.length > 0 && (
        <div className="mt-4 space-y-1 rounded-xl bg-warning/10 px-3 py-2.5">
          <p className="text-xs font-black text-app-text">Peringatan prefix ganda</p>
          {duplicates.map((item) => (
            <p key={item.prefix} className="break-words text-xs text-app-muted">
              {item.prefix} dipakai oleh {item.operators.join(", ")}. Nomor dengan prefix ini akan memakai
              operator pertama yang aktif di daftar.
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {value.operators.map((operator, index) => {
          const key = `${operator.id}-${index}`;
          const invalidPrefixes = invalid[key] ?? [];
          return (
            <div key={key} className="min-w-0 rounded-2xl border border-app-border bg-app-inset/40 p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <OperatorLogo url={operator.logoUrl} name={operator.name} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-app-text">{operator.name || "Tanpa nama"}</p>
                    <p className="truncate text-[11px] font-medium text-app-subtle">
                      {operator.prefixes.length} prefix{operator.id ? ` · ${operator.id}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={operator.active ? "success" : "neutral"} className="px-2 py-0.5">
                    {operator.active ? "Aktif" : "Nonaktif"}
                  </Badge>
                  <SettingsSwitch
                    checked={operator.active}
                    label={`Aktifkan operator ${operator.name || operator.id}`}
                    onChange={(next) => patchOperator(index, { active: next })}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-danger-600 dark:text-danger-400"
                    disabled={value.operators.length <= 1}
                    onClick={() => set("operators", value.operators.filter((_, i) => i !== index))}
                  >
                    Hapus
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input
                  label="Nama operator"
                  value={operator.name}
                  maxLength={40}
                  error={!operator.name.trim() ? "Nama operator wajib diisi." : null}
                  onChange={(event) => patchOperator(index, { name: event.target.value })}
                />
                <Input
                  label="ID operator"
                  value={operator.id}
                  maxLength={32}
                  hint="Huruf kecil, angka, dan tanda hubung."
                  error={operator.id && !/^[a-z0-9_-]+$/.test(operator.id) ? "ID tidak valid." : null}
                  onChange={(event) => patchOperator(index, { id: event.target.value })}
                />
              </div>

              <div className="mt-3">
                <SettingsAssetField
                  kind="operator"
                  label="Logo operator"
                  hint="PNG berlatarbelakang transparan paling rapi. Diskala utuh tanpa dipotong."
                  value={operator.logoUrl}
                  previewClassName="h-16 w-16"
                  onChange={(url) => patchOperator(index, { logoUrl: url })}
                />
              </div>

              <div className="mt-3 min-w-0">
                <p className="text-sm font-bold text-app-text">Prefix nomor</p>
                <p className="mt-0.5 text-xs leading-4 text-app-subtle">
                  Tambah satu per satu atau beberapa sekaligus (pisahkan spasi/koma), mis. 0811 0812 0813-0815.
                </p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {operator.prefixes.length === 0 && (
                    <span className="text-xs text-app-subtle">Belum ada prefix.</span>
                  )}
                  {operator.prefixes.map((prefix) => (
                    <span
                      key={prefix}
                      className="inline-flex items-center gap-1 rounded-full border border-app-border bg-app-surface px-2 py-0.5 text-[11px] font-bold text-app-text"
                    >
                      {prefix}
                      <button
                        type="button"
                        aria-label={`Hapus prefix ${prefix} dari ${operator.name || operator.id}`}
                        onClick={() => removePrefix(index, prefix)}
                        className="flex h-4 w-4 items-center justify-center rounded-full text-app-subtle transition hover:bg-danger-500/15 hover:text-danger-600 dark:hover:text-danger-400"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-2.5 w-2.5" aria-hidden>
                          <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    value={drafts[key] ?? ""}
                    inputMode="numeric"
                    placeholder="0812 atau 0811-0813"
                    aria-label={`Prefix baru untuk ${operator.name || operator.id}`}
                    onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addPrefixes(index, key, drafts[key] ?? "");
                      }
                    }}
                    className="min-w-0 flex-1 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!(drafts[key] ?? "").trim()}
                    onClick={() => addPrefixes(index, key, drafts[key] ?? "")}
                  >
                    <Icon name="plus" size={14} />
                    <span className="ml-1">Tambah</span>
                  </Button>
                </div>

                {invalidPrefixes.length > 0 && (
                  <p role="alert" className="mt-1.5 text-xs font-medium text-danger-600 dark:text-danger-400">
                    Tidak dipakai: {invalidPrefixes.join(", ")}. Prefix harus 4 digit dan diawali 0.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <Button type="button" variant="outline" onClick={addOperator} disabled={value.operators.length >= 15}>
          Tambah operator
        </Button>
      </div>

      <div className="mt-5 rounded-2xl border border-app-border bg-app-inset/40 p-3 sm:p-4">
        <p className="text-sm font-black text-app-text">Alat uji deteksi</p>
        <p className="mt-0.5 text-xs leading-5 text-app-muted">
          Ketik nomor untuk melihat operator yang akan terdeteksi dengan peta di atas.
        </p>
        <div className="mt-2">
          <Input
            label="Nomor uji"
            inputMode="tel"
            placeholder="0812 3456 7890"
            value={testNumber}
            maxLength={20}
            onChange={(event) => setTestNumber(event.target.value)}
          />
        </div>
        <div
          className={`mt-2 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold ${
            detected
              ? "bg-success/10 text-app-text"
              : "bg-app-surface text-app-subtle"
          }`}
          role="status"
          aria-live="polite"
        >
          {detected && <OperatorLogo url={detected.logoUrl} name={detected.name} size={28} />}
          <span className="min-w-0 break-words">{operatorDetectSummary(testNumber, value)}</span>
        </div>
      </div>
    </Card>
  );
}

function OperatorPreview({ value }: { value: OperatorSettings }) {
  const duplicates = duplicatePrefixes(value);
  const active = value.operators.filter((operator) => operator.active);

  return (
    <div className="space-y-3 rounded-[2rem] border border-app-border bg-app-bg p-3 shadow-sm">
      <div className="rounded-2xl border border-app-border bg-app-surface p-3">
        <p className="text-[10px] font-black uppercase tracking-wide text-app-subtle">Operator aktif</p>
        <ul className="mt-2 space-y-2">
          {active.map((operator) => (
            <li key={operator.id} className="flex min-w-0 items-center gap-2">
              <OperatorLogo url={operator.logoUrl} name={operator.name} size={28} />
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-app-text">{operator.name}</p>
                <p className="line-clamp-1 break-words text-[10px] text-app-subtle">
                  {operator.prefixes.join(", ") || "Belum ada prefix"}
                </p>
              </div>
            </li>
          ))}
          {active.length === 0 && <li className="text-xs text-app-subtle">Semua operator nonaktif.</li>}
        </ul>
      </div>

      <div className="rounded-2xl border border-app-border bg-app-surface p-3">
        <p className="text-[10px] font-black uppercase tracking-wide text-app-subtle">Ringkasan</p>
        <p className="mt-1 break-words text-xs text-app-muted">
          {value.operators.length} operator terdaftar, {active.length} aktif.
        </p>
        {duplicates.length > 0 ? (
          <p className="mt-1 break-words text-[11px] font-medium text-app-text">
            {duplicates.length} prefix dipakai lebih dari satu operator.
          </p>
        ) : (
          <p className="mt-1 text-[11px] font-medium text-app-muted">Tidak ada prefix ganda.</p>
        )}
      </div>

      <p className="px-1 text-[10px] leading-4 text-app-subtle">
        Alur beli pulsa/data membaca peta ini. Bila belum diterbitkan, sistem memakai peta bawaan.
      </p>
    </div>
  );
}

export default function AdminOperatorSettingsPage() {
  return (
    <SettingsForm<OperatorSettings>
      settingKey={OPERATOR_SETTINGS_KEY}
      title="Pengaturan Operator"
      description="Atur daftar operator, logo, prefix nomor, dan status aktif. Perubahan baru dipakai alur beli pulsa/data setelah diterbitkan."
      validate={operatorSettingsValidate}
      publishError={operatorSettingsPublishError}
      renderPreview={(value) => <OperatorPreview value={value} />}
      previewTitle="Pratinjau operator"
      previewDescription="Lebar 360px. Operator nonaktif tidak dipakai saat mendeteksi nomor."
      previewHint="Prefix yang dipakai dua operator tetap memakai operator pertama yang aktif; peringatan tampil di formulir."
    >
      {({ value, set }) => <OperatorCard value={value} set={set} />}
    </SettingsForm>
  );
}
