import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const fullName = String(body?.fullName || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const phone = String(body?.phone || "").trim();
    const password = String(body?.password || "");
    const referralCode = String(body?.referralCode || "").trim();
    const termsAccepted = body?.terms === true;

    if (fullName.length < 2) {
      return NextResponse.json(
        { message: "Nama lengkap minimal 2 karakter." },
        { status: 400 }
      );
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ message: "Email tidak valid." }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json(
        { message: "Password minimal 6 karakter." },
        { status: 400 }
      );
    }

    if (!termsAccepted) {
      return NextResponse.json(
        { message: "Persetujuan ketentuan dan privasi diperlukan." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: otpRecord, error: otpError } = await supabase
      .from("email_verification_otps")
      .select("id, expires_at, verified_at")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError) {
      console.error("register OTP lookup error:", otpError);
      return NextResponse.json(
        { message: "Tidak dapat memeriksa verifikasi email." },
        { status: 500 }
      );
    }

    if (!otpRecord?.verified_at) {
      return NextResponse.json(
        { message: "Email belum diverifikasi dengan OTP." },
        { status: 403 }
      );
    }

    if (new Date(otpRecord.expires_at).getTime() <= Date.now()) {
      return NextResponse.json(
        { message: "Verifikasi email sudah kedaluwarsa. Silakan verifikasi ulang." },
        { status: 410 }
      );
    }

    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone,
          referral_code: referralCode,
          terms_accepted_at: new Date().toISOString(),
        },
      });

    if (createError || !created.user) {
      console.error("register createUser error:", createError);
      return NextResponse.json(
        {
          message:
            createError?.message || "Gagal membuat akun.",
        },
        { status: 400 }
      );
    }

    await supabase
      .from("email_verification_otps")
      .delete()
      .eq("id", otpRecord.id);

    return NextResponse.json({
      success: true,
      message: "Akun berhasil dibuat. Silakan login.",
    });
  } catch (error) {
    console.error("register error:", error);
    return NextResponse.json(
      { message: "Terjadi kesalahan saat membuat akun." },
      { status: 500 }
    );
  }
}
