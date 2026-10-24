import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  RATING_SCHEMA_MISSING,
  isRatingRpcMissing,
  ratingMessage,
} from "@/lib/rating-messages";

const submitSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().nullable(),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Silakan login kembali." }, { status: 401 });
  }

  const parsed = submitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Pilih rating 1 sampai 5 bintang." }, { status: 400 });
  }

  const comment = parsed.data.comment?.trim() || null;
  const { data, error } = await supabase.rpc("submit_app_rating", {
    p_user_id: user.id,
    p_rating: parsed.data.rating,
    p_comment: comment,
  });

  if (error) {
    if (isRatingRpcMissing(error.code)) {
      return NextResponse.json({ message: RATING_SCHEMA_MISSING }, { status: 503 });
    }
    return NextResponse.json(
      { message: ratingMessage(error.message, "Gagal mengirim rating. Coba lagi.") },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, id: data });
}
