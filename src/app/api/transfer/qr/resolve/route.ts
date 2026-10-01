import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { resolveQrSchema } from "@/lib/transfer/schemas";

// Resolve token QR menjadi profil publik penerima (nama + avatar saja).
// Token tidak valid / sudah di-regenerate mengembalikan 404.
export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = resolveQrSchema.safeParse({ token: url.searchParams.get("token") || "" });
  if (!parsed.success) {
    return NextResponse.json({ message: "QR tidak valid atau sudah tidak berlaku." }, { status: 404 });
  }

  const rateKeyHash = crypto.createHash("sha256").update(`transfer_qr_resolve:${user.id}`).digest("hex");
  const rate = await consumeRateLimit(rateKeyHash, 60, 15 * 60);
  if (!rate.allowed) {
    return NextResponse.json({ message: `Terlalu banyak pemindaian. Coba lagi dalam ${rate.retryAfter} detik.` }, { status: 429 });
  }

  const { data, error } = await supabase.rpc("resolve_qr_token", { p_token: parsed.data.token });
  if (error) {
    console.error("transfer/qr/resolve error:", error);
    return NextResponse.json({ message: "Gagal membaca QR. Coba lagi." }, { status: 500 });
  }

  const recipient = Array.isArray(data) ? data[0] : data;
  if (!recipient?.recipient_id) {
    return NextResponse.json({ message: "QR tidak valid atau sudah tidak berlaku." }, { status: 404 });
  }

  return NextResponse.json({
    recipient: {
      recipient_id: recipient.recipient_id,
      display_name: recipient.display_name,
      avatar_url: recipient.avatar_url || null,
    },
    is_self: recipient.recipient_id === user.id,
  });
}
