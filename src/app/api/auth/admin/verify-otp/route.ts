import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { ADMIN_2FA_COOKIE, ADMIN_2FA_MAX_AGE_SECONDS, signAdmin2FAToken } from "@/lib/security/admin-2fa";

const MAX_ATTEMPTS = 5;

function hashOtp(email: string, otp: string) {
  const pepper = process.env.OTP_PEPPER;
  if (!pepper && process.env.NODE_ENV === "production") {
    throw new Error("OTP_PEPPER is not configured.");
  }
  return crypto.createHmac("sha256", pepper || "aidil-store-development-only").update(`${email}:${otp}`).digest("hex");
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !user.email) {
      return NextResponse.json({ message: "Sesi tidak ditemukan. Silakan login ulang." }, { status: 401 });
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || (profile.role !== "ADMIN" && profile.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ message: "Akun ini bukan akun admin." }, { status: 403 });
    }

    const rateKeyHash = crypto.createHash("sha256").update(`admin_otp_verify:${user.id}`).digest("hex");
    const rate = await consumeRateLimit(rateKeyHash, 10, 15 * 60);
    if (!rate.allowed) {
      return NextResponse.json({ message: `Terlalu banyak percobaan. Coba lagi dalam ${rate.retryAfter} detik.` }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const otp = String(body?.otp || "").replace(/\D/g, "");
    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json({ message: "Masukkan OTP 6 digit." }, { status: 400 });
    }

    const admin = createAdminClient();
    const email = user.email.toLowerCase();

    const { data: record, error: lookupError } = await admin
      .from("admin_login_otps")
      .select("id, otp_hash, expires_at, attempt_count, verified_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.error("admin/verify-otp lookup error:", lookupError);
      return NextResponse.json({ message: "Tidak dapat memeriksa OTP sekarang." }, { status: 500 });
    }
    if (!record) {
      return NextResponse.json({ message: "OTP tidak ditemukan. Silakan kirim OTP baru." }, { status: 404 });
    }
    if (new Date(record.expires_at).getTime() <= Date.now()) {
      await admin.from("admin_login_otps").delete().eq("id", record.id);
      return NextResponse.json({ message: "OTP sudah kedaluwarsa. Silakan kirim OTP baru." }, { status: 410 });
    }
    if (record.attempt_count >= MAX_ATTEMPTS) {
      return NextResponse.json({ message: "Batas percobaan OTP tercapai. Silakan kirim OTP baru." }, { status: 429 });
    }

    const expectedHash = hashOtp(email, otp);
    const expectedBuf = Buffer.from(expectedHash, "hex");
    const actualBuf = Buffer.from(record.otp_hash, "hex");
    const valid = expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);

    if (!valid) {
      const nextAttempts = record.attempt_count + 1;
      await admin.from("admin_login_otps").update({ attempt_count: nextAttempts }).eq("id", record.id);
      return NextResponse.json({
        message: nextAttempts >= MAX_ATTEMPTS ? "Batas percobaan OTP tercapai. Silakan kirim OTP baru." : `OTP salah. Sisa percobaan: ${MAX_ATTEMPTS - nextAttempts}.`,
      }, { status: 400 });
    }

    await admin.from("admin_login_otps").update({ verified_at: new Date().toISOString() }).eq("id", record.id);

    const token = signAdmin2FAToken(user.id);
    const res = NextResponse.json({ success: true });
    res.cookies.set(ADMIN_2FA_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_2FA_MAX_AGE_SECONDS,
    });
    return res;
  } catch (error) {
    console.error("admin/verify-otp error:", error);
    return NextResponse.json({ message: "Terjadi kesalahan saat memverifikasi OTP." }, { status: 500 });
  }
}
