import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const OTP_EXPIRES_MINUTES = 5;
const RESEND_COOLDOWN_SECONDS = 60;

function hashOtp(email: string, otp: string) {
  const pepper = process.env.OTP_PEPPER;
  if (!pepper && process.env.NODE_ENV === "production") {
    throw new Error("OTP_PEPPER is not configured.");
  }
  return crypto.createHmac("sha256", pepper || "aidil-store-development-only").update(`${email}:${otp}`).digest("hex");
}

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

export async function POST() {
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

    const rateKeyHash = crypto.createHash("sha256").update(`admin_otp_send:${user.id}`).digest("hex");
    const rate = await consumeRateLimit(rateKeyHash, 5, 15 * 60);
    if (!rate.allowed) {
      return NextResponse.json({ message: `Terlalu banyak permintaan OTP. Coba lagi dalam ${rate.retryAfter} detik.` }, { status: 429 });
    }

    const admin = createAdminClient();
    const email = user.email.toLowerCase();

    const { data: previous } = await admin
      .from("admin_login_otps")
      .select("id, last_sent_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previous?.last_sent_at) {
      const elapsed = Math.floor((Date.now() - new Date(previous.last_sent_at).getTime()) / 1000);
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        const remaining = RESEND_COOLDOWN_SECONDS - elapsed;
        return NextResponse.json({ message: `Tunggu ${remaining} detik sebelum meminta OTP baru.`, retryAfter: remaining }, { status: 429 });
      }
    }

    await admin.from("admin_login_otps").delete().eq("user_id", user.id);

    const otp = generateOtp();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_EXPIRES_MINUTES * 60 * 1000);

    const { error: insertError } = await admin.from("admin_login_otps").insert({
      user_id: user.id,
      email,
      otp_hash: hashOtp(email, otp),
      expires_at: expiresAt.toISOString(),
      last_sent_at: now.toISOString(),
      attempt_count: 0,
    });
    if (insertError) {
      console.error("admin/send-otp insert error:", insertError);
      return NextResponse.json({ message: "Gagal menyiapkan OTP. Pastikan migration admin_login_otps sudah dijalankan di Supabase." }, { status: 500 });
    }

    const resendKey = process.env.RESEND_API_KEY;
    const emailFrom = process.env.EMAIL_FROM;
    if (resendKey && emailFrom) {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: emailFrom,
          to: [email],
          subject: "Kode Verifikasi Login Admin — AIDIL STORE",
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><div style="background:#09090b;color:#fff;padding:24px;border-radius:18px 18px 0 0"><b style="color:#F5C542;letter-spacing:2px">AIDIL STORE</b><h1 style="margin:10px 0 0">Verifikasi Login Admin</h1></div><div style="padding:24px;border:1px solid #F0E2B6;border-top:0;border-radius:0 0 18px 18px"><p>Kode verifikasi 2 langkah untuk masuk ke panel admin:</p><div style="font-size:32px;font-weight:900;letter-spacing:8px;background:#FFFBEA;color:#09090b;padding:18px;text-align:center;border-radius:14px">${otp}</div><p>Kode berlaku ${OTP_EXPIRES_MINUTES} menit. Jika kamu tidak sedang mencoba login sebagai admin, segera ganti password akunmu.</p></div></div>`,
        }),
      });
      if (!emailResponse.ok) {
        console.error("Resend admin OTP error:", await emailResponse.text());
        return NextResponse.json({ message: "OTP dibuat, tetapi email gagal dikirim. Periksa konfigurasi RESEND_API_KEY/EMAIL_FROM." }, { status: 502 });
      }
    } else if (process.env.NODE_ENV !== "production") {
      console.log("================================================");
      console.log("AIDIL STORE DEV — ADMIN 2FA OTP");
      console.log("Email:", email);
      console.log("OTP:", otp);
      console.log("Berlaku sampai:", expiresAt.toISOString());
      console.log("================================================");
    } else {
      return NextResponse.json({ message: "Pengiriman email OTP admin belum dikonfigurasi (RESEND_API_KEY/EMAIL_FROM)." }, { status: 503 });
    }

    return NextResponse.json({ success: true, expiresIn: OTP_EXPIRES_MINUTES * 60, resendAfter: RESEND_COOLDOWN_SECONDS, email });
  } catch (error) {
    console.error("admin/send-otp error:", error);
    return NextResponse.json({ message: "Terjadi kesalahan saat membuat OTP." }, { status: 500 });
  }
}
