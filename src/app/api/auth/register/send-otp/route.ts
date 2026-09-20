import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const OTP_EXPIRES_MINUTES = 5;
const RESEND_COOLDOWN_SECONDS = 60;

function hashOtp(email: string, otp: string) {
  const pepper = process.env.OTP_PEPPER;

  if (!pepper && process.env.NODE_ENV === "production") {
    throw new Error("OTP_PEPPER is not configured.");
  }

  return crypto
    .createHmac("sha256", pepper || "aidil-store-development-only")
    .update(`${email}:${otp}`)
    .digest("hex");
}

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();

    if (!isValidEmail(email)) {
      return NextResponse.json({ message: "Email tidak valid." }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: previousOtp, error: previousError } = await supabase
      .from("email_verification_otps")
      .select("id, last_sent_at")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousError) {
      console.error("register/send-otp lookup error:", previousError);
      return NextResponse.json({ message: "Tabel verifikasi email belum siap. Jalankan migration email_verification_otps di Supabase." }, { status: 500 });
    }

    if (previousOtp?.last_sent_at) {
      const elapsed = Math.floor(
        (Date.now() - new Date(previousOtp.last_sent_at).getTime()) / 1000
      );

      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        const remaining = RESEND_COOLDOWN_SECONDS - elapsed;
        return NextResponse.json(
          {
            message: `Tunggu ${remaining} detik sebelum meminta OTP baru.`,
            retryAfter: remaining,
          },
          { status: 429 }
        );
      }
    }

    // Satu email hanya boleh memiliki satu OTP aktif.
    const { error: deleteError } = await supabase
      .from("email_verification_otps")
      .delete()
      .eq("email", email);

    if (deleteError) {
      console.error("register/send-otp delete error:", deleteError);
      return NextResponse.json(
        { message: "Gagal menyiapkan OTP baru." },
        { status: 500 }
      );
    }

    const otp = generateOtp();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + OTP_EXPIRES_MINUTES * 60 * 1000
    );

    const { error: insertError } = await supabase
      .from("email_verification_otps")
      .insert({
        email,
        otp_hash: hashOtp(email, otp),
        expires_at: expiresAt.toISOString(),
        last_sent_at: now.toISOString(),
        verified_at: null,
        attempt_count: 0,
      });

    if (insertError) {
      console.error("register/send-otp insert error:", insertError);
      return NextResponse.json({ message: "Gagal menyimpan OTP. Pastikan tabel email_verification_otps sudah dibuat dan SUPABASE_SERVICE_ROLE_KEY tersedia di server." }, { status: 500 });
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
          subject: "Kode OTP AIDIL STORE",
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><div style="background:#09090b;color:#fff;padding:24px;border-radius:18px 18px 0 0"><b style="color:#facc15;letter-spacing:2px">AIDIL STORE</b><h1 style="margin:10px 0 0">Verifikasi Email</h1></div><div style="padding:24px;border:1px solid #F0E2B6;border-top:0;border-radius:0 0 18px 18px"><p>Gunakan kode berikut untuk melanjutkan pendaftaran:</p><div style="font-size:32px;font-weight:900;letter-spacing:8px;background:#FFFBEA;color:#09090b;padding:18px;text-align:center;border-radius:14px">${otp}</div><p>Kode berlaku selama 5 menit. Jangan bagikan kode ini kepada orang lain.</p></div></div>`,
        }),
      });
      if (!emailResponse.ok) {
        console.error("Resend email error:", await emailResponse.text());
        return NextResponse.json({ message: "OTP berhasil dibuat, tetapi email tidak dapat dikirim. Periksa konfigurasi RESEND_API_KEY dan EMAIL_FROM." }, { status: 502 });
      }
    } else if (process.env.NODE_ENV !== "production") {
      console.log("================================================");
      console.log("AIDIL STORE DEVELOPMENT OTP");
      console.log("Email:", email);
      console.log("OTP:", otp);
      console.log("Berlaku sampai:", expiresAt.toISOString());
      console.log("================================================");
    } else {
      return NextResponse.json({ message: "Pengiriman email OTP belum dikonfigurasi. Tambahkan RESEND_API_KEY dan EMAIL_FROM pada environment server." }, { status: 503 });
    }

    return NextResponse.json({
      success: true,
      message: "OTP berhasil dibuat.",
      expiresIn: OTP_EXPIRES_MINUTES * 60,
      resendAfter: RESEND_COOLDOWN_SECONDS,
    });
  } catch (error) {
    console.error("register/send-otp error:", error);
    return NextResponse.json(
      { message: "Terjadi kesalahan saat membuat OTP." },
      { status: 500 }
    );
  }
}
