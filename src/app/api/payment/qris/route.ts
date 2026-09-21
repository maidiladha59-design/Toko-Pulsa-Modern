import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { rawQris, merchantName, amount } = body || {};

    if (!rawQris || !merchantName || !amount) {
      return NextResponse.json({ message: "Data pembayaran tidak lengkap." }, { status: 400 });
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ message: "Nominal pembayaran tidak valid." }, { status: 400 });
    }

    // Idempotency key unik per request agar tidak double-charge kalau tombol
    // "Bayar Sekarang" ke-klik dua kali / request diulang karena koneksi lambat.
    const idempotencyKey = `qris-${user.id}-${randomUUID()}`;

    const { data, error } = await supabase.rpc("create_qris_wallet_payment", {
      p_user_id: user.id,
      p_merchant_name: merchantName,
      p_raw_qris: rawQris,
      p_amount: numericAmount,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      const message = mapErrorMessage(error.message);
      return NextResponse.json({ message }, { status: 400 });
    }

    return NextResponse.json({ orderId: data, message: "Pembayaran berhasil." });
  } catch (err: any) {
    console.error("QRIS payment error:", err);
    return NextResponse.json(
      { message: "Terjadi kesalahan pada server. Coba lagi." },
      { status: 500 }
    );
  }
}

function mapErrorMessage(code: string) {
  switch (code) {
    case "INSUFFICIENT_BALANCE":
      return "Saldo kamu tidak mencukupi untuk pembayaran ini.";
    case "WALLET_NOT_FOUND":
      return "Wallet tidak ditemukan. Silakan hubungi bantuan.";
    case "INVALID_AMOUNT":
      return "Nominal pembayaran tidak valid.";
    case "MERCHANT_REQUIRED":
    case "QRIS_DATA_REQUIRED":
      return "Data QRIS tidak lengkap. Coba scan ulang.";
    case "UNAUTHENTICATED":
      return "Sesi kamu berakhir. Silakan login kembali.";
    default:
      return "Pembayaran gagal diproses. Coba lagi.";
  }
}