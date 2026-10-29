import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_INFO_TICKER,
  INFO_TICKER_KEY,
  SITE_SETTINGS_TAG,
  infoTickerInputSchema,
  infoTickerPresentationDefaults,
  normalizeInfoTicker,
} from "@/lib/info-ticker";

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ message: "Silakan login kembali." }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(profile.role)) {
    return { error: NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 }) };
  }
  return { user, profile };
}

async function readRaw(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin.from("site_settings").select("value,updated_at,updated_by").eq("key", INFO_TICKER_KEY).maybeSingle();
  if (error) return { error: NextResponse.json({ message: "Gagal membaca pengaturan info berjalan." }, { status: 500 }) };
  return { row: data };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const read = await readRaw(admin);
  if (read.error) return read.error;

  const value = (read.row?.value ?? {}) as Record<string, unknown>;
  let settings;
  try {
    settings = normalizeInfoTicker({ ...DEFAULT_INFO_TICKER, ...value });
  } catch {
    settings = DEFAULT_INFO_TICKER;
  }
  return NextResponse.json({ settings, updated_at: read.row?.updated_at ?? null, updated_by: read.row?.updated_by ?? null });
}

const bodySchema = z.object({ action: z.enum(["save", "reset"]).default("save") }).passthrough();

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const raw = await request.json().catch(() => null);
  const wrapped = bodySchema.safeParse(raw);
  if (!wrapped.success) return NextResponse.json({ message: "Data pengaturan tidak dikenali." }, { status: 400 });

  const admin = createAdminClient();
  const read = await readRaw(admin);
  if (read.error) return read.error;
  const current = (read.row?.value ?? {}) as Record<string, unknown>;

  // "Kembalikan default" hanya menata ulang tampilan & jadwal; teks tetap utuh
  // supaya admin tidak kehilangan pesan yang sedang berjalan.
  const input =
    wrapped.data.action === "reset"
      ? { ...infoTickerPresentationDefaults(), text: typeof current.text === "string" ? current.text : "" }
      : raw;

  const parsed = infoTickerInputSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message || "Pengaturan info berjalan tidak valid." }, { status: 400 });
  }

  const settings = normalizeInfoTicker(parsed.data);
  const now = new Date().toISOString();
  const { error: writeError } = await admin
    .from("site_settings")
    .upsert({ key: INFO_TICKER_KEY, value: settings, updated_at: now, updated_by: auth.user.id }, { onConflict: "key" });
  if (writeError) return NextResponse.json({ message: "Gagal menyimpan pengaturan info berjalan." }, { status: 500 });

  await admin.from("audit_logs").insert({
    actor_id: auth.user.id,
    action: wrapped.data.action === "reset" ? "site_settings.info_ticker_reset" : "site_settings.info_ticker_update",
    target_type: "site_settings",
    target_id: INFO_TICKER_KEY,
    metadata: settings,
  });

  // Beranda membaca lewat cache 60 detik — tag ini membuat perubahan tampil
  // tanpa perlu deploy ulang.
  revalidateTag(SITE_SETTINGS_TAG);

  return NextResponse.json({ ok: true, settings, updated_at: now });
}
