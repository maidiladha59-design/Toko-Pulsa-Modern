import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_ATTEMPTS = 5;

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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();
    const otp = String(body?.otp || "").replace(/\D/g, "");

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ message: "Email tidak valid." }, { status: 400 });
    }

    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { message: "Masukkan OTP 6 digit." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: record, error: lookupError } = await supabase
      .from("email_verification_otps")
      .select(
        "id, otp_hash, expires_at, attempt_count, verified_at"
      )
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.error("register/verify-otp lookup error:", lookupError);
      return NextResponse.json(
        { message: "Tidak dapat memeriksa OTP sekarang." },
        { status: 500 }
      );
    }

    if (!record) {
      return NextResponse.json(
        { message: "OTP tidak ditemukan. Silakan kirim OTP baru." },
        { status: 404 }
      );
    }

    if (record.verified_at) {
      return NextResponse.json({
        success: true,
        verified: true,
        message: "Email sudah terverifikasi.",
      });
    }

    if (new Date(record.expires_at).getTime() <= Date.now()) {
      await supabase
        .from("email_verification_otps")
        .delete()
        .eq("id", record.id);

      return NextResponse.json(
        { message: "OTP sudah kedaluwarsa. Silakan kirim OTP baru." },
        { status: 410 }
      );
    }

    if (record.attempt_count >= MAX_ATTEMPTS) {
      return NextResponse.json(
        {
          message:
            "Batas percobaan OTP sudah tercapai. Silakan kirim OTP baru.",
        },
        { status: 429 }
      );
    }

    const expectedHash = hashOtp(email, otp);
    const valid = crypto.timingSafeEqual(
      Buffer.from(expectedHash, "hex"),
      Buffer.from(record.otp_hash, "hex")
    );

    if (!valid) {
      const nextAttempts = record.attempt_count + 1;

      await supabase
        .from("email_verification_otps")
        .update({ attempt_count: nextAttempts })
        .eq("id", record.id);

      return NextResponse.json(
        {
          message:
            nextAttempts >= MAX_ATTEMPTS
              ? "Batas percobaan OTP sudah tercapai. Silakan kirim OTP baru."
              : `OTP salah. Sisa percobaan: ${MAX_ATTEMPTS - nextAttempts}.`,
        },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("email_verification_otps")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", record.id);

    if (updateError) {
      console.error("register/verify-otp update error:", updateError);
      return NextResponse.json(
        { message: "Gagal menyimpan status verifikasi." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      verified: true,
      message: "Email berhasil diverifikasi.",
    });
  } catch (error) {
    console.error("register/verify-otp error:", error);
    return NextResponse.json(
      { message: "Terjadi kesalahan saat memverifikasi OTP." },
      { status: 500 }
    );
  }
}
