"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";

type PseStatus = "BELUM_TERDAFTAR" | "DALAM_PROSES" | "TERDAFTAR";

type Profile = {
  business_name: string;
  owner_name: string;
  business_address: string;
  business_phone: string;
  business_email: string;
  nib_number: string;
  pse_status: PseStatus;
  pse_registration_number: string;
  logo_url: string | null;
  legal_document_url: string | null;
  show_legal_document_publicly: boolean;
  updated_at: string | null;
};

const EMPTY: Profile = {
  business_name: "",
  owner_name: "",
  business_address: "",
  business_phone: "",
  business_email: "",
  nib_number: "",
  pse_status: "BELUM_TERDAFTAR",
  pse_registration_number: "",
  logo_url: null,
  legal_document_url: null,
  show_legal_document_publicly: false,
  updated_at: null,
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const LOGO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const LEGAL_TYPES = [...LOGO_TYPES, "application/pdf"];

type FieldErrors = Partial<Record<keyof Profile, string>>;
type Notice = { type: "success" | "error"; text: string } | null;

function fileNameFromUrl(url: string | null | undefined) {
  if (!url) return "";
  try {
    return decodeURIComponent(url.split("/").pop()?.split("?")[0] || "");
  } catch {
    return "";
  }
}

function validate(form: Profile): FieldErrors {
  const errors: FieldErrors = {};
  if (form.business_name.trim().length < 2) errors.business_name = "Nama usaha minimal 2 karakter.";
  if (form.owner_name.trim().length < 2) errors.owner_name = "Nama pemilik minimal 2 karakter.";
  if (form.business_address.trim().length < 5) errors.business_address = "Alamat usaha wajib diisi.";
  if (form.business_phone.trim() && !/^[0-9+() -]{6,40}$/.test(form.business_phone.trim())) {
    errors.business_phone = "Nomor telepon tidak valid.";
  }
  if (form.business_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.business_email.trim())) {
    errors.business_email = "Format email tidak valid.";
  }
  if (form.pse_status === "TERDAFTAR" && !form.pse_registration_number.trim()) {
    errors.pse_registration_number = "Nomor registrasi PSE wajib diisi saat status Terdaftar.";
  }
  if (form.show_legal_document_publicly && !form.legal_document_url) {
    errors.legal_document_url = "Unggah dokumen legal sebelum menampilkannya ke publik.";
  }
  return errors;
}

export default function AdminIdentitasUsaha() {
  const [form, setForm] = useState<Profile>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "legal" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [legalFileName, setLegalFileName] = useState("");
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/business-profile", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          setNotice({ type: "error", text: json.message || "Gagal memuat identitas usaha." });
          return;
        }
        if (json.profile) {
          const profile = json.profile as Partial<Profile>;
          setForm({
            ...EMPTY,
            ...profile,
            logo_url: profile.logo_url ?? null,
            legal_document_url: profile.legal_document_url ?? null,
            show_legal_document_publicly: Boolean(profile.show_legal_document_publicly),
          });
          setLegalFileName(fileNameFromUrl(profile.legal_document_url));
        }
      } catch {
        if (active) setNotice({ type: "error", text: "Jaringan gagal. Periksa koneksi internet lalu coba lagi." });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function clearLogoPreview() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setLogoPreview(null);
  }

  async function upload(kind: "logo" | "legal", file: File) {
    const allowed = kind === "logo" ? LOGO_TYPES : LEGAL_TYPES;
    if (file.size > MAX_FILE_SIZE) {
      setNotice({ type: "error", text: "Ukuran file maksimal 5MB. Kompres file lalu coba lagi." });
      return;
    }
    if (!allowed.includes(file.type)) {
      setNotice({
        type: "error",
        text:
          kind === "logo"
            ? "Logo harus berupa JPG, PNG, WEBP, atau SVG."
            : "Dokumen legal harus berupa JPG, PNG, WEBP, SVG, atau PDF.",
      });
      return;
    }

    if (kind === "logo") {
      clearLogoPreview();
      const objectUrl = URL.createObjectURL(file);
      objectUrlRef.current = objectUrl;
      setLogoPreview(objectUrl);
    }

    setUploading(kind);
    setNotice(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      const res = await fetch("/api/admin/business-profile/upload", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (kind === "logo") clearLogoPreview();
        setNotice({ type: "error", text: json.message || "Gagal mengunggah file." });
        return;
      }
      if (kind === "logo") {
        update("logo_url", json.url as string);
        setLogoPreview(null);
        clearLogoPreview();
      } else {
        update("legal_document_url", json.url as string);
        setLegalFileName(json.name || fileNameFromUrl(json.url));
      }
      setNotice({
        type: "success",
        text: kind === "logo" ? "Logo diunggah. Klik Simpan agar tampil di halaman publik." : "Dokumen legal diunggah. Klik Simpan agar tersimpan.",
      });
    } catch {
      if (kind === "logo") clearLogoPreview();
      setNotice({ type: "error", text: "Jaringan gagal saat mengunggah. Coba lagi." });
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setNotice({ type: "error", text: "Periksa kembali data yang ditandai merah." });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/business-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ type: "error", text: json.message || "Gagal menyimpan identitas usaha." });
        return;
      }
      if (json.profile) {
        const profile = json.profile as Partial<Profile>;
        setForm((prev) => ({ ...prev, ...profile }));
        setLegalFileName(fileNameFromUrl(profile.legal_document_url));
      }
      setNotice({ type: "success", text: "Identitas usaha berhasil disimpan dan langsung tampil di halaman publik." });
    } catch {
      setNotice({ type: "error", text: "Jaringan gagal. Periksa koneksi internet lalu coba lagi." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSkeleton rows={8} />;

  const logoUrl = logoPreview || form.logo_url;
  const isBusy = saving || uploading !== null;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-gradient-to-r from-zinc-900 via-gold-700 to-black p-6 text-white shadow-lg shadow-gold-500/15">
        <p className="text-xs font-black uppercase tracking-widest text-gold-100">Informasi Publik</p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">Identitas Usaha</h1>
        <p className="mt-1 text-sm text-gold-100">
          Data ini tampil di bagian Pelaku Usaha pada footer beranda dan halaman publik Identitas Usaha.
        </p>
      </div>

      {notice && (
        <p
          role="status"
          className={`rounded-2xl border p-4 text-sm font-bold ${
            notice.type === "success"
              ? "border-success-500/30 bg-success-500/10 text-success-700 dark:text-success-300"
              : "border-danger-500/30 bg-danger-500/10 text-danger-700 dark:text-danger-300"
          }`}
        >
          {notice.text}
        </p>
      )}

      <Card>
        <CardTitle>Data usaha</CardTitle>
        <CardDescription>Isi sesuai dokumen resmi. Nama usaha dan nama pemilik wajib diisi.</CardDescription>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Input
            label="Nama usaha"
            value={form.business_name}
            onChange={(e) => update("business_name", e.target.value)}
            error={errors.business_name}
            placeholder="Contoh: AIDIL STORE"
            className="bg-app-inset"
          />
          <Input
            label="Nama pemilik / penanggung jawab"
            value={form.owner_name}
            onChange={(e) => update("owner_name", e.target.value)}
            error={errors.owner_name}
            placeholder="Nama sesuai KTP"
            className="bg-app-inset"
          />
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-app-text" htmlFor="business_address">
              Alamat usaha
            </label>
            <textarea
              id="business_address"
              value={form.business_address}
              onChange={(e) => update("business_address", e.target.value)}
              rows={3}
              placeholder="Alamat lengkap usaha"
              aria-invalid={errors.business_address ? true : undefined}
              className={`w-full rounded-xl border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition focus:ring-4 ${
                errors.business_address
                  ? "border-danger-400 focus:border-danger-500 focus:ring-danger-500/20"
                  : "border-app-border focus:border-gold-400 focus:ring-gold-400/20"
              }`}
            />
            {errors.business_address && (
              <p role="alert" className="mt-1.5 text-xs font-medium text-danger-600 dark:text-danger-400">
                {errors.business_address}
              </p>
            )}
          </div>
          <Input
            label="Telepon / WhatsApp resmi"
            value={form.business_phone}
            onChange={(e) => update("business_phone", e.target.value)}
            error={errors.business_phone}
            placeholder="08xxxxxxxxxx"
            className="bg-app-inset"
          />
          <Input
            label="Email resmi"
            type="email"
            value={form.business_email}
            onChange={(e) => update("business_email", e.target.value)}
            error={errors.business_email}
            placeholder="cs@contoh.com"
            className="bg-app-inset"
          />
          <Input
            label="NIB (opsional)"
            value={form.nib_number}
            onChange={(e) => update("nib_number", e.target.value)}
            hint="Nomor Induk Berusaha sesuai OSS."
            className="bg-app-inset"
          />
        </div>
      </Card>

      <Card>
        <CardTitle>Status pendaftaran PSE</CardTitle>
        <CardDescription>
          Badge di halaman publik mengikuti status ini. Nomor registrasi wajib diisi saat memilih Terdaftar.
        </CardDescription>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Select
            label="Status PSE"
            value={form.pse_status}
            onChange={(e) => update("pse_status", e.target.value as PseStatus)}
            className="bg-app-inset"
          >
            <option value="BELUM_TERDAFTAR">Belum Terdaftar</option>
            <option value="DALAM_PROSES">Dalam Proses</option>
            <option value="TERDAFTAR">Terdaftar</option>
          </Select>
          <Input
            label="Nomor registrasi PSE"
            value={form.pse_registration_number}
            onChange={(e) => update("pse_registration_number", e.target.value)}
            error={errors.pse_registration_number}
            hint={form.pse_status === "TERDAFTAR" ? "Wajib diisi." : "Hanya dipakai saat status Terdaftar."}
            disabled={form.pse_status !== "TERDAFTAR"}
            className="bg-app-inset"
          />
        </div>
      </Card>

      <Card>
        <CardTitle>Logo usaha</CardTitle>
        <CardDescription>
          Logo tampil di kartu Identitas Usaha dan bagian Pelaku Usaha di footer. Format JPG, PNG, WEBP, atau SVG, maksimal 5MB.
        </CardDescription>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-app-border bg-app-inset">
            {logoUrl ? (
              <img src={logoUrl} alt="Pratinjau logo usaha" className="h-full w-full object-contain p-2" />
            ) : (
              <span className="text-3xl text-app-subtle">🏢</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label
              className={`inline-flex cursor-pointer items-center justify-center rounded-xl border border-app-border px-4 py-2.5 text-sm font-bold text-app-text transition hover:border-gold-400 hover:bg-app-accent-soft ${
                uploading === "logo" ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {uploading === "logo" ? "Mengunggah..." : form.logo_url ? "Ganti Logo" : "Upload Logo"}
              <input
                type="file"
                accept={LOGO_TYPES.join(",")}
                className="hidden"
                disabled={uploading !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload("logo", file);
                  e.target.value = "";
                }}
              />
            </label>
            {form.logo_url && (
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => {
                  clearLogoPreview();
                  update("logo_url", null);
                }}
              >
                Hapus Logo
              </Button>
            )}
          </div>
        </div>
        {logoPreview && <p className="mt-3 text-xs font-bold text-warning-600 dark:text-warning-300">Pratinjau lokal — logo belum tersimpan.</p>}
      </Card>

      <Card>
        <CardTitle>Dokumen legal (NIB / SIUP)</CardTitle>
        <CardDescription>
          Dokumen bersifat internal secara default. Centang opsi di bawah hanya jika ingin menautkannya di halaman publik.
        </CardDescription>
        <div className="mt-5 rounded-2xl border border-app-border bg-app-inset p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-app-text">
                {legalFileName || "Belum ada dokumen"}
              </p>
              <p className="mt-1 text-xs text-app-muted">Format JPG, PNG, WEBP, SVG, atau PDF. Maksimal 5MB.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {form.legal_document_url && (
                <a
                  href={form.legal_document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-black text-app-kicker hover:underline"
                >
                  Lihat Dokumen
                </a>
              )}
              <label
                className={`inline-flex cursor-pointer items-center justify-center rounded-xl border border-app-border px-4 py-2.5 text-sm font-bold text-app-text transition hover:border-gold-400 hover:bg-app-accent-soft ${
                  uploading === "legal" ? "pointer-events-none opacity-60" : ""
                }`}
              >
                {uploading === "legal" ? "Mengunggah..." : form.legal_document_url ? "Ganti Dokumen" : "Upload Dokumen"}
                <input
                  type="file"
                  accept={LEGAL_TYPES.join(",")}
                  className="hidden"
                  disabled={uploading !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload("legal", file);
                    e.target.value = "";
                  }}
                />
              </label>
              {form.legal_document_url && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => {
                    update("legal_document_url", null);
                    update("show_legal_document_publicly", false);
                    setLegalFileName("");
                  }}
                >
                  Hapus
                </Button>
              )}
            </div>
          </div>
          {errors.legal_document_url && (
            <p role="alert" className="mt-2 text-xs font-medium text-danger-600 dark:text-danger-400">
              {errors.legal_document_url}
            </p>
          )}
          <label className="mt-4 flex items-start gap-3 text-sm font-bold text-app-text">
            <input
              type="checkbox"
              checked={form.show_legal_document_publicly}
              onChange={(e) => update("show_legal_document_publicly", e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-gold-400"
            />
            Tampilkan tautan dokumen legal ini di halaman Identitas Usaha publik
          </label>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-app-muted">
          {form.updated_at
            ? `Terakhir diperbarui: ${new Date(form.updated_at).toLocaleString("id-ID")}`
            : "Belum pernah disimpan."}
        </p>
        <Button onClick={save} disabled={isBusy} loading={saving}>
          {saving ? "Menyimpan..." : "Simpan Identitas Usaha"}
        </Button>
      </div>
    </div>
  );
}
