import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const tierSchema = z.object({
  id: z.string().uuid().optional(),
  min_amount: z.number().int().positive().max(1000000000),
  max_amount: z.number().int().positive().max(1000000000).nullable().optional(),
  fee_amount: z.number().int().min(0).max(10000000),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(100000).default(0),
}).refine((v) => v.max_amount == null || v.max_amount >= v.min_amount, { message: "Batas atas rentang harus >= batas bawah." });

const SELECT_FIELDS = "id, min_amount, max_amount, fee_amount, is_active, sort_order, updated_at";

type Range = { min_amount: number; max_amount: number | null };
type TierRow = { id: string; min_amount: unknown; max_amount: unknown; fee_amount: unknown };

async function requireAdmin() {
  const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ message: "Silakan login kembali." }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(profile.role)) return { error: NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 }) };
  return { user };
}

function formatRange(min: number, max: number | null) {
  const upper = max == null ? "tanpa batas" : `Rp${max.toLocaleString("id-ID")}`;
  return `Rp${min.toLocaleString("id-ID")} – ${upper}`;
}

// Tumpang tindih: dua rentang bersinggungan jika batas bawah salah satu <= batas atas
// yang lain (null dianggap tak terhingga). Inklusif di kedua ujung.
function rangesOverlap(a: Range, b: Range) {
  const aMax = a.max_amount ?? Number.MAX_SAFE_INTEGER;
  const bMax = b.max_amount ?? Number.MAX_SAFE_INTEGER;
  return a.min_amount <= bMax && b.min_amount <= aMax;
}

function toRange(row: TierRow): Range {
  return { min_amount: Number(row.min_amount), max_amount: row.max_amount == null ? null : Number(row.max_amount) };
}

export async function GET() {
  const auth = await requireAdmin(); if (auth.error) return auth.error;
  const admin = createAdminClient();
  const { data, error } = await admin.from("topup_fee_tiers").select(SELECT_FIELDS)
    .order("sort_order", { ascending: true }).order("min_amount", { ascending: true });
  if (error) return NextResponse.json({ message: "Gagal membaca daftar tier biaya Top Up." }, { status: 500 });
  return NextResponse.json({ tiers: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(); if (auth.error) return auth.error;
  const parsed = tierSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Data tier tidak valid." }, { status: 400 });
  const { id, min_amount, fee_amount, is_active, sort_order } = parsed.data;
  const max_amount = parsed.data.max_amount ?? null;
  const admin = createAdminClient();

  if (is_active) {
    const { data: activeTiers, error: listError } = await admin.from("topup_fee_tiers")
      .select("id, min_amount, max_amount, fee_amount").eq("is_active", true);
    if (listError) return NextResponse.json({ message: "Gagal memeriksa rentang tier yang sudah ada." }, { status: 500 });
    const conflict = ((activeTiers ?? []) as TierRow[]).find((t) => t.id !== id && rangesOverlap({ min_amount, max_amount }, toRange(t)));
    if (conflict) {
      const cr = toRange(conflict);
      return NextResponse.json({ message: `Rentang ${formatRange(min_amount, max_amount)} tumpang tindih dengan tier ${formatRange(cr.min_amount, cr.max_amount)}. Ubah batas rentang atau nonaktifkan tier tersebut dulu.` }, { status: 409 });
    }
  }

  const payload = { min_amount, max_amount, fee_amount, is_active, sort_order, updated_by: auth.user.id, updated_at: new Date().toISOString() };
  const { data: tier, error } = id
    ? await admin.from("topup_fee_tiers").update(payload).eq("id", id).select(SELECT_FIELDS).single()
    : await admin.from("topup_fee_tiers").insert(payload).select(SELECT_FIELDS).single();
  if (error || !tier) {
    if (error?.message?.includes("TOPUP_FEE_TIER_OVERLAP")) {
      return NextResponse.json({ message: "Rentang tumpang tindih dengan tier aktif lain yang baru saja ditambahkan. Muat ulang daftar lalu coba lagi." }, { status: 409 });
    }
    if (id && error?.code === "PGRST116") return NextResponse.json({ message: "Tier tidak ditemukan." }, { status: 404 });
    return NextResponse.json({ message: "Gagal menyimpan tier biaya Top Up." }, { status: 500 });
  }

  await admin.from("audit_logs").insert({ actor_id: auth.user.id, action: id ? "topup.fee_tier_update" : "topup.fee_tier_create", target_type: "topup_fee_tiers", target_id: String(tier.id), metadata: tier });
  return NextResponse.json({ tier }, { status: id ? 200 : 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(); if (auth.error) return auth.error;
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) return NextResponse.json({ message: "ID tier tidak valid." }, { status: 400 });
  const admin = createAdminClient();
  const { data: tier, error } = await admin.from("topup_fee_tiers").delete().eq("id", id).select("id, min_amount, max_amount, fee_amount").single();
  if (error || !tier) return NextResponse.json({ message: "Tier tidak ditemukan atau gagal dihapus." }, { status: 404 });
  await admin.from("audit_logs").insert({ actor_id: auth.user.id, action: "topup.fee_tier_delete", target_type: "topup_fee_tiers", target_id: id, metadata: tier });
  return NextResponse.json({ ok: true, id });
}
