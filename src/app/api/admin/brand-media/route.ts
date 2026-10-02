import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const upsertSchema = z.object({
  brand_key: z.string().trim().min(1, "Brand key wajib diisi.").max(120),
  brand_name: z.string().trim().min(1, "Nama brand wajib diisi.").max(120),
  logo_url: z
    .string()
    .trim()
    .url("URL logo tidak valid.")
    .startsWith("https://", "URL logo wajib diawali https://"),
});

async function requireAdmin() {
  const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ message: "Silakan login kembali." }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(profile.role)) return { error: NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 }) };
  return { user };
}

function normalizeBrandKey(brand: string) {
  return brand.trim().toLowerCase();
}

export async function GET() {
  const auth = await requireAdmin(); if (auth.error) return auth.error;
  const admin = createAdminClient();

  const { data: services, error: servicesError } = await admin
    .from("ppob_services")
    .select("brand")
    .not("brand", "is", null);
  if (servicesError) return NextResponse.json({ message: "Gagal membaca daftar brand PPOB." }, { status: 500 });

  const counts = new Map<string, { brand_name: string; product_count: number }>();
  for (const row of services || []) {
    const name = String(row.brand || "").trim();
    if (!name) continue;
    const key = normalizeBrandKey(name);
    const found = counts.get(key);
    if (found) found.product_count += 1;
    else counts.set(key, { brand_name: name, product_count: 1 });
  }

  const { data: media, error: mediaError } = await admin
    .from("brand_media")
    .select("brand_key, brand_name, logo_url, updated_at");
  if (mediaError) return NextResponse.json({ message: "Gagal membaca logo brand." }, { status: 500 });

  const logos = new Map<string, { brand_name: string; logo_url: string; updated_at: string | null }>();
  for (const row of media || []) logos.set(row.brand_key, { brand_name: row.brand_name, logo_url: row.logo_url, updated_at: row.updated_at });

  const brands = Array.from(counts.entries()).map(([brand_key, info]) => {
    const logo = logos.get(brand_key);
    return {
      brand_key,
      brand_name: logo?.brand_name || info.brand_name,
      logo_url: logo?.logo_url || null,
      updated_at: logo?.updated_at || null,
      product_count: info.product_count,
    };
  });
  brands.sort((a, b) => a.brand_name.localeCompare(b.brand_name, "id"));

  return NextResponse.json({ brands });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(); if (auth.error) return auth.error;
  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Data logo tidak valid." }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("brand_media")
    .upsert(
      { brand_key: parsed.data.brand_key, brand_name: parsed.data.brand_name, logo_url: parsed.data.logo_url, updated_by: auth.user!.id, updated_at: new Date().toISOString() },
      { onConflict: "brand_key" },
    )
    .select("brand_key, brand_name, logo_url, updated_at")
    .single();
  if (error || !data) return NextResponse.json({ message: "Gagal menyimpan logo brand." }, { status: 500 });

  await admin.from("audit_logs").insert({
    actor_id: auth.user!.id,
    action: "brandmedia.update",
    target_type: "brand_media",
    metadata: { brand_key: parsed.data.brand_key, logo_url: parsed.data.logo_url },
  });

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(); if (auth.error) return auth.error;
  const url = new URL(request.url);
  const brandKey = normalizeBrandKey(url.searchParams.get("brand_key") || "");
  if (!brandKey) return NextResponse.json({ message: "Brand key wajib diisi." }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("brand_media").delete().eq("brand_key", brandKey);
  if (error) return NextResponse.json({ message: "Gagal menghapus logo brand." }, { status: 500 });

  await admin.from("audit_logs").insert({
    actor_id: auth.user!.id,
    action: "brandmedia.delete",
    target_type: "brand_media",
    metadata: { brand_key: brandKey },
  });

  return NextResponse.json({ message: "Logo brand dihapus." });
}
