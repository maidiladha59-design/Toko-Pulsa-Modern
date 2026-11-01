"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import SettingsForm, { type SettingsFormRenderArgs } from "@/components/admin/SettingsForm";
import SettingsSwitch from "@/components/admin/SettingsSwitch";
import { useToast } from "@/components/ToastProvider";
import {
  NOTIFICATION_TEMPLATES_SETTINGS_KEY,
  NOTIFICATION_TEMPLATE_DEFINITIONS,
  NOTIFICATION_VARIABLES,
  forbiddenTemplateTerms,
  notificationTemplatesPublishError,
  notificationTemplatesValidate,
  renderNotificationTemplate,
  sampleTemplateVariables,
  templateDefinition,
  unknownTemplateVariables,
  type NotificationTemplate,
  type NotificationTemplateKey,
  type NotificationTemplatesSettings,
} from "@/lib/notification-templates";

// Panel "Template Notifikasi". Teks notifikasi untuk sembilan peristiwa
// penting disimpan di site_settings.notification_templates. Mesin notifikasi
// yang sudah ada membacanya dan tetap memakai teks lama bila template
// dimatikan atau belum diterbitkan. Variabel di luar daftar putih dan istilah
// internal ditolak saat simpan/terbitkan. Tidak menyentuh saldo atau pesanan.

type SetTemplates = SettingsFormRenderArgs<NotificationTemplatesSettings>["set"];
type FocusField = "title" | "message";

const TEXTAREA_CLASS =
  "w-full rounded-xl border border-app-border bg-app-surface px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20";

function TemplatePreview({ title, message }: { title: string; message: string }) {
  const variables = sampleTemplateVariables();
  const renderedTitle = renderNotificationTemplate(title, variables).trim();
  const renderedMessage = renderNotificationTemplate(message, variables).trim();

  return (
    <div className="rounded-2xl border border-app-border bg-app-inset/60 p-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-app-subtle">Pratinjau dengan data contoh</p>
      <div className="mt-2 flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-app-surface text-app-kicker">
          {/* ikon notifikasi seragam */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
            <path d="M12 3a6 6 0 0 0-6 6v3.5L4.5 16h15L18 12.5V9a6 6 0 0 0-6-6Z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9.5 19a2.5 2.5 0 0 0 5 0" strokeLinecap="round" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="break-words text-sm font-bold text-app-text">{renderedTitle || "(judul kosong)"}</p>
          <p className="mt-0.5 whitespace-pre-line break-words text-xs leading-5 text-app-muted">
            {renderedMessage || "(isi pesan kosong)"}
          </p>
        </div>
      </div>
    </div>
  );
}

function VariableChips({
  templateKey,
  focus,
  onInsert,
}: {
  templateKey: string;
  focus: FocusField;
  onInsert: (token: string) => void;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold text-app-muted">
        Sisipkan variabel ke {focus === "title" ? "judul" : "isi pesan"}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {NOTIFICATION_VARIABLES.map((variable) => (
          <button
            key={`${templateKey}-${variable.key}`}
            type="button"
            onClick={() => onInsert(`{${variable.key}}`)}
            title={variable.label}
            className="rounded-full border border-app-border bg-app-surface px-2.5 py-1 text-[11px] font-bold text-app-kicker transition hover:border-gold-400 hover:bg-app-inset"
          >
            {`{${variable.key}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

function TemplatesCard({ value, set }: { value: NotificationTemplatesSettings; set: SetTemplates }) {
  const toast = useToast();
  const [focus, setFocus] = useState<Record<string, FocusField>>({});
  const [sending, setSending] = useState<string | null>(null);

  function patchTemplate(index: number, next: Partial<NotificationTemplate>) {
    set(
      "templates",
      value.templates.map((template, i) => (i === index ? { ...template, ...next } : template))
    );
  }

  function resetTemplate(index: number, key: NotificationTemplateKey) {
    const definition = templateDefinition(key);
    if (!definition) return;
    set(
      "templates",
      value.templates.map((template, i) =>
        i === index ? { ...template, title: definition.title, message: definition.message } : template
      )
    );
    toast.show("Teks template dikembalikan ke bawaan. Tekan Simpan draf lalu Terbitkan.", "info");
  }

  async function sendTest(template: NotificationTemplate) {
    setSending(template.key);
    try {
      const response = await fetch("/api/admin/notification-templates/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_key: template.key,
          template: { title: template.title, message: template.message },
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.message || "Gagal mengirim notifikasi uji.");
      toast.show(json?.message || "Notifikasi uji dikirim ke akun Anda.", "success");
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Gagal mengirim notifikasi uji.", "error");
    } finally {
      setSending(null);
    }
  }

  return (
    <Card>
      <CardTitle>Template pesan</CardTitle>
      <CardDescription>
        Teks notifikasi dalam aplikasi untuk sembilan peristiwa penting. Variabel di luar daftar chip ditolak saat
        simpan. Istilah internal seperti status mentah, nama gateway, atau nama supplier ditolak saat terbitkan.
      </CardDescription>

      <div className="mt-4 space-y-4">
        {value.templates.map((template, index) => {
          const definition = NOTIFICATION_TEMPLATE_DEFINITIONS.find((item) => item.key === template.key);
          const activeFocus = focus[template.key] ?? "message";
          const unknown = unknownTemplateVariables(`${template.title} ${template.message}`);
          const forbidden = forbiddenTemplateTerms(`${template.title} ${template.message}`);
          const insert = (token: string) => {
            if (activeFocus === "title") {
              patchTemplate(index, { title: `${template.title}${token}`.slice(0, 120) });
            } else {
              patchTemplate(index, { message: `${template.message}${token}`.slice(0, 1000) });
            }
          };

          return (
            <div
              key={template.key}
              className={`min-w-0 rounded-2xl border p-3 sm:p-4 ${
                template.enabled
                  ? "border-app-border bg-app-inset/40"
                  : "border-dashed border-app-border bg-app-inset/20"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-black text-app-text">{definition?.label ?? template.key}</p>
                  <p className="mt-0.5 break-words text-xs leading-5 text-app-muted">{definition?.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={template.enabled ? "success" : "neutral"} className="px-2 py-0.5">
                    {template.enabled ? "Aktif" : "Nonaktif"}
                  </Badge>
                  <SettingsSwitch
                    checked={template.enabled}
                    label={`Aktifkan template ${definition?.label ?? template.key}`}
                    onChange={(next) => patchTemplate(index, { enabled: next })}
                  />
                </div>
              </div>

              {!template.enabled && (
                <p className="mt-2 rounded-xl bg-app-surface px-3 py-2 text-xs text-app-subtle">
                  Template nonaktif. Notifikasi memakai teks bawaan sistem.
                </p>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-2 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-xs font-bold text-app-text">
                  <span className="min-w-0 break-words">Tampilkan di dalam aplikasi</span>
                  <SettingsSwitch
                    checked={template.inApp}
                    disabled={!template.enabled}
                    label={`Tampilkan template ${definition?.label ?? template.key} di aplikasi`}
                    onChange={(next) => patchTemplate(index, { inApp: next })}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-xs font-bold text-app-text">
                  <span className="min-w-0 break-words">Kirim sebagai notifikasi push</span>
                  <SettingsSwitch
                    checked={template.push}
                    disabled={!template.enabled}
                    label={`Kirim template ${definition?.label ?? template.key} sebagai push`}
                    onChange={(next) => patchTemplate(index, { push: next })}
                  />
                </div>
              </div>

              <div className="mt-3 space-y-3">
                <Input
                  label="Judul notifikasi"
                  value={template.title}
                  maxLength={120}
                  onFocus={() => setFocus((current) => ({ ...current, [template.key]: "title" }))}
                  onChange={(event) => patchTemplate(index, { title: event.target.value })}
                  error={template.enabled && !template.title.trim() ? "Judul wajib diisi saat template aktif." : null}
                />

                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label htmlFor={`message-${template.key}`} className="text-sm font-bold text-app-text">
                      Isi pesan
                    </label>
                    <span className="text-xs font-bold text-app-subtle">{template.message.length}/1000</span>
                  </div>
                  <textarea
                    id={`message-${template.key}`}
                    rows={3}
                    value={template.message}
                    maxLength={1000}
                    onFocus={() => setFocus((current) => ({ ...current, [template.key]: "message" }))}
                    onChange={(event) => patchTemplate(index, { message: event.target.value })}
                    className={TEXTAREA_CLASS}
                  />
                  {template.enabled && !template.message.trim() && (
                    <p role="alert" className="mt-1.5 text-xs font-medium text-danger-600 dark:text-danger-400">
                      Isi pesan wajib diisi saat template aktif.
                    </p>
                  )}
                </div>

                <VariableChips templateKey={template.key} focus={activeFocus} onInsert={insert} />

                {unknown.length > 0 && (
                  <p role="alert" className="rounded-xl bg-danger-500/10 px-3 py-2 text-xs font-medium text-danger-600 dark:text-danger-400">
                    Variabel tidak diizinkan: {unknown.map((key) => `{${key}}`).join(", ")}. Hapus atau ganti dengan
                    chip yang tersedia.
                  </p>
                )}
                {forbidden.length > 0 && (
                  <p role="status" className="rounded-xl bg-warning/10 px-3 py-2 text-xs font-medium text-app-text">
                    Mengandung istilah internal ({forbidden.join(", ")}). Draf tetap bisa disimpan, tetapi tidak
                    bisa diterbitkan sampai diganti dengan bahasa pelanggan.
                  </p>
                )}

                <TemplatePreview title={template.title} message={template.message} />

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={sending === template.key || !template.title.trim() || !template.message.trim()}
                    onClick={() => sendTest(template)}
                  >
                    {sending === template.key ? "Mengirim..." : "Kirim uji ke akun saya"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => resetTemplate(index, template.key)}>
                    Kembalikan teks default
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function AdminNotificationTemplatesPage() {
  return (
    <SettingsForm<NotificationTemplatesSettings>
      settingKey={NOTIFICATION_TEMPLATES_SETTINGS_KEY}
      title="Template Notifikasi"
      description="Atur judul dan isi notifikasi untuk pembelian, Top Up, verifikasi, refund, dan transfer. Perubahan baru dipakai setelah diterbitkan."
      validate={notificationTemplatesValidate}
      publishError={notificationTemplatesPublishError}
      renderPreview={(value) => {
        const active = value.templates.filter((template) => template.enabled);
        return (
          <div className="space-y-2 rounded-[2rem] border border-app-border bg-app-bg p-3 shadow-sm">
            {active.length === 0 && (
              <p className="rounded-xl bg-app-surface px-3 py-6 text-center text-xs text-app-subtle">
                Semua template nonaktif. Notifikasi memakai teks bawaan sistem.
              </p>
            )}
            {active.map((template) => {
              const definition = NOTIFICATION_TEMPLATE_DEFINITIONS.find((item) => item.key === template.key);
              return (
                <div key={template.key} className="rounded-2xl border border-app-border bg-app-surface p-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-app-subtle">
                    {definition?.label ?? template.key}
                  </p>
                  <TemplatePreview title={template.title} message={template.message} />
                </div>
              );
            })}
          </div>
        );
      }}
      previewTitle="Pratinjau notifikasi"
      previewDescription="Lebar 360px, data contoh. Tanda [Uji] hanya ditambahkan pada notifikasi uji."
      previewHint="Template nonaktif tidak tampil di pratinjau; pelanggan menerima teks bawaan sistem."
    >
      {({ value, set }) => <TemplatesCard value={value} set={set} />}
    </SettingsForm>
  );
}
