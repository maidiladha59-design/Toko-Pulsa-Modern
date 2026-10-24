import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRatingRpcMissing } from "@/lib/rating-messages";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ shouldPrompt: false }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("should_prompt_rating", {
    p_user_id: user.id,
  });

  if (error) {
    // Sebelum migrasi v90 dijalankan, jangan tampilkan modal/error ke user.
    if (isRatingRpcMissing(error.code)) {
      return NextResponse.json({ shouldPrompt: false });
    }
    return NextResponse.json(
      { shouldPrompt: false, message: "Gagal memeriksa status rating." },
      { status: 500 }
    );
  }

  return NextResponse.json({ shouldPrompt: data === true });
}
