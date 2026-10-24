import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const profileSchema = z
  .object({
    business_name: z.string().trim().min(2, "Nama usaha minimal 2 karakter.").max(160),
    owner_name: z.string().trim().min(2, "Nama pemilik minimal 2 karakter.").max(160),
    business_address: z.string().trim().min(5, "Alamat usaha wajib diisi.").max(500),
    business_phone: z.preprocess(
      emptyToNull,
      z.string().trim().min(6, "Nomor telepon tidak valid.").max(40).nullable().optional()
    ),
    business_email: z.preprocess(
      emptyToNull,
      z.string().trim().email("Format email tidak valid.").max(160).nullable().optional()
    ),
    nib_number: z.preprocess(
      emptyToNull,
      z.string().trim().max(60).nullable().optional()
    ),
    pse_status: z.enum(["BELUM_TERDAFTAR", "DALAM_PROSES", "TERDAFTAR"]),
    pse_registration_number: z.preprocess(
      emptyToNull,
      z.string().trim().max(80).nullable().optional()
    ),
    logo_url: z.preprocess(
      emptyToNull,
      z.string().trim().url("URL logo tidak valid.").startsWith("https://").max(1000).nullable().optional()
    ),
    legal_document_url: z.preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .url("URL dokumen legal tidak valid.")
        .startsWith("https://")
        .max(1000)
        .nullable()
        .optional()
    ),
    show_legal_document_publicly: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.pse_status === "TERDAFTAR" && !data.pse_registration_number) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pse_registration_number"],
        message: "Nomor registrasi PSE wajib diisi saat status Terdaftar.",
      });
    }
    if (data.show_legal_document_publicly && !data.legal_document_url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["legal_document_url"],
        message: "Unggah dokumen legal sebelum menampilkannya ke publik.",
      });
    }
  });

const RPC_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Sesi kamu berakhir. Silakan login ulang.",
  ADMIN_MISMATCH: "Sesi admin tidak cocok. Silakan login ulang.",
  ADMIN_ONLY: "Hanya admin yang dapat menyimpan identitas usaha.",
  INVALID_DATA: "Data identitas usaha tidak valid.",
  BUSINESS_NAME_REQUIRED: "Nama usaha wajib diisi minimal 2 karakter.",
  BUSINESS_NAME_TOO_LONG: "Nama usaha maksimal 160 karakter.",
  OWNER_NAME_REQUIRED: "Nama pemilik wajib diisi minimal 2 karakter.",
  OWNER_NAME_TOO_LONG: "Nama pemilik maksimal 160 karakter.",
  ADDRESS_REQUIRED: "Alamat usaha wajib diisi.",
  ADDRESS_TOO_LONG: "Alamat usaha maksimal 500 karakter.",
  INVALID_PHONE: "Nomor telepon tidak valid.",
  INVALID_EMAIL: "Format email tidak valid.",
  NIB_TOO_LONG: "NIB maksimal 60 karakter.",
  INVALID_PSE_STATUS: "Status pendaftaran PSE tidak valid.",
  PSE_NUMBER_REQUIRED: "Nomor registrasi PSE wajib diisi saat status Terdaftar.",
  PSE_NUMBER_TOO_LONG: "Nomor registrasi PSE maksimal 80 karakter.",
  INVALID_LOGO_URL: "URL logo tidak valid.",
  INVALID_LEGAL_DOCUMENT_URL: "URL dokumen legal tidak valid.",
  URL_TOO_LONG: "URL file terlalu panjang.",
  LEGAL_DOCUMENT_REQUIRED: "Unggah dokumen legal sebelum menampilkannya ke publik.",
  PROFILE_NOT_FOUND: "Data identitas usaha belum tersedia. Jalankan migrasi v89 terlebih dahulu.",
};

function friendlyRpcMessage(message: string | undefined) {
  const raw = message || "";
  const key = Object.keys(RPC_MESSAGES).find((code) => raw.includes(code));
  return key ? RPC_MESSAGES[key] : "Gagal menyimpan identitas usaha. Silakan coba lagi.";
}

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ message: "Silakan login kembali." }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(String(profile.role))) {
    return { error: NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 }) };
  }
  return { user, supabase };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase
    .from("business_profile")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { message: "Data identitas usaha belum tersedia. Pastikan migrasi v89 sudah dijalankan." },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: data });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Data identitas usaha tidak valid." },
      { status: 400 }
    );
  }

  const p = parsed.data;
  const payload = {
    business_name: p.business_name,
    owner_name: p.owner_name,
    business_address: p.business_address,
    business_phone: p.business_phone ?? "",
    business_email: p.business_email ?? "",
    nib_number: p.nib_number ?? "",
    pse_status: p.pse_status,
    pse_registration_number: p.pse_registration_number ?? "",
    logo_url: p.logo_url ?? "",
    legal_document_url: p.legal_document_url ?? "",
    show_legal_document_publicly: p.show_legal_document_publicly,
  };

  // RPC dijalankan dengan klien session (bukan service role) supaya auth.uid()
  // di dalam database cocok dengan p_admin_id dan role diperiksa dari dalam RPC.
  const { data, error } = await auth.supabase.rpc("admin_update_business_profile", {
    p_admin_id: auth.user!.id,
    p_data: payload,
  });

  if (error) {
    return NextResponse.json({ message: friendlyRpcMessage(error.message) }, { status: 400 });
  }

  return NextResponse.json({ ok: true, profile: (data as { profile?: unknown } | null)?.profile ?? null });
}
