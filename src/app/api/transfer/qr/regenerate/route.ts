import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";

// Regenerate token QR pribadi. Token lama langsung tidak berlaku
// karena token disimpan per user (satu baris) dan diganti seluruhnya.
export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const rateKeyHash = crypto.createHash("sha256").update(`transfer_qr_regen:${user.id}`).digest("hex");
  const rate = await consumeRateLimit(rateKeyHash, 5, 15 * 60);
  if (!rate.allowed) {
    return NextResponse.json({ message: `Terlalu sering membuat ulang QR. Coba lagi dalam ${rate.retryAfter} detik.` }, { status: 429 });
  }

  const { data: token, error } = await supabase.rpc("regenerate_user_qr_token");
  if (error || !token) {
    console.error("transfer/qr/regenerate error:", error);
    return NextResponse.json({ message: "Gagal membuat ulang QR. Pastikan migration v75 sudah dijalankan di Supabase." }, { status: 500 });
  }

  return NextResponse.json({ token, message: "QR berhasil dibuat ulang. QR lama sudah tidak berlaku." });
}
