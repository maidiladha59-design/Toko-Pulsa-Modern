import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRatingRpcMissing } from "@/lib/rating-messages";

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { error } = await supabase.rpc("mark_rating_prompted", {
    p_user_id: user.id,
  });

  if (error) {
    // Dismiss bersifat best-effort: modal tetap ditutup walau RPC gagal.
    if (isRatingRpcMissing(error.code)) {
      return NextResponse.json({ ok: false });
    }
    return NextResponse.json(
      { ok: false, message: "Gagal mencatat penundaan rating." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
