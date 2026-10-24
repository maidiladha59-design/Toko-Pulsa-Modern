import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  RATING_SCHEMA_MISSING,
  isRatingRpcMissing,
  ratingMessage,
} from "@/lib/rating-messages";

const moderateSchema = z.object({
  rating_id: z.string().uuid("ID ulasan tidak valid."),
  published: z.boolean(),
});

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

  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(profile.role)) {
    return { error: NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 }) };
  }

  return { user, supabase };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("app_ratings")
    .select("id, user_id, rating, comment, transaction_count_at_rating, is_published, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      {
        message:
          "Data rating belum tersedia. Pastikan migrasi v90 sudah dijalankan di Supabase.",
      },
      { status: 500 }
    );
  }

  const ratings = rows || [];
  const userIds = [...new Set(ratings.map((row) => row.user_id))];

  const profilesById = new Map<string, { full_name: string | null; email: string | null }>();
  if (userIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);

    for (const profile of profiles || []) {
      profilesById.set(profile.id, {
        full_name: profile.full_name,
        email: profile.email,
      });
    }
  }

  const mapped = ratings.map((row) => {
    const profile = profilesById.get(row.user_id);
    return {
      id: row.id,
      user_id: row.user_id,
      user_name: profile?.full_name || profile?.email?.split("@")[0] || "Pengguna AIDIL STORE",
      user_email: profile?.email || null,
      rating: row.rating,
      comment: row.comment,
      transaction_count_at_rating: row.transaction_count_at_rating,
      is_published: row.is_published,
      created_at: row.created_at,
    };
  });

  const total = mapped.length;
  const average =
    total > 0
      ? Math.round((mapped.reduce((sum, row) => sum + Number(row.rating || 0), 0) / total) * 100) / 100
      : 0;

  return NextResponse.json({
    ratings: mapped,
    summary: {
      average,
      total_count: total,
      published_count: mapped.filter((row) => row.is_published).length,
      pending_count: mapped.filter((row) => !row.is_published).length,
      distribution: [1, 2, 3, 4, 5].map((star) => ({
        rating: star,
        count: mapped.filter((row) => row.rating === star).length,
      })),
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const parsed = moderateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Data moderasi tidak valid." },
      { status: 400 }
    );
  }

  const { error } = await auth.supabase!.rpc("admin_set_rating_published", {
    p_admin_id: auth.user!.id,
    p_rating_id: parsed.data.rating_id,
    p_published: parsed.data.published,
  });

  if (error) {
    if (isRatingRpcMissing(error.code)) {
      return NextResponse.json({ message: RATING_SCHEMA_MISSING }, { status: 503 });
    }
    return NextResponse.json(
      { message: ratingMessage(error.message, "Gagal memoderasi ulasan.") },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
