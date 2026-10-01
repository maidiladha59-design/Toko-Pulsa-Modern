import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTransactionPin } from "@/lib/security/transaction-pin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { notifyUser } from "@/lib/notification-engine";
import { createTransferSchema } from "@/lib/transfer/schemas";
import { formatRupiah } from "@/lib/utils";

// Transfer saldo antar-user. Semua perubahan saldo terjadi di dalam RPC
// atomic create_wallet_transfer (wallet ledger + audit log + idempotent).
export async function POST(request: Request) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const parsed = createTransferSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Data transfer tidak valid." }, { status: 400 });
  }
  const { recipient_id, amount, note, pin, idempotency_key } = parsed.data;

  const admin = createAdminClient();

  // Idempotency: key yang sama (milik pengirim yang sama) tidak membuat
  // transfer kedua. Replay cukup mengembalikan transfer yang sudah ada
  // (tanpa verifikasi PIN ulang).
  const { data: existing } = await admin
    .from("wallet_transfers")
    .select("id, transfer_number, amount, fee, total, recipient_id")
    .eq("sender_id", user.id)
    .eq("idempotency_key", idempotency_key)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      transfer_id: existing.id,
      transfer_number: existing.transfer_number,
      amount: Number(existing.amount),
      fee: Number(existing.fee),
      total: Number(existing.total),
      message: "Transfer ini sudah diproses sebelumnya.",
    });
  }

  const rateKeyHash = crypto.createHash("sha256").update(`transfer_send:${user.id}`).digest("hex");
  const rate = await consumeRateLimit(rateKeyHash, 10, 15 * 60);
  if (!rate.allowed) {
    return NextResponse.json({ message: `Terlalu banyak percobaan transfer. Coba lagi dalam ${rate.retryAfter} detik.` }, { status: 429 });
  }

  try {
    await verifyTransactionPin(user.id, pin);
  } catch (e: any) {
    if (e?.message === "PIN_NOT_SET") return NextResponse.json({ message: "Buat PIN transaksi terlebih dahulu di Pengaturan." }, { status: 409 });
    if (e?.message === "PIN_LOCKED") return NextResponse.json({ message: "PIN terkunci sementara karena terlalu banyak percobaan gagal." }, { status: 429 });
    return NextResponse.json({ message: "PIN transaksi salah." }, { status: 401 });
  }

  const { data: transferId, error } = await supabase.rpc("create_wallet_transfer", {
    p_user_id: user.id,
    p_recipient_id: recipient_id,
    p_amount: amount,
    p_note: note && note.length > 0 ? note : null,
    p_idempotency_key: idempotency_key,
  });

  if (error || !transferId) {
    const msg = error?.message || "";
    if (msg.includes("UNAUTHENTICATED") || msg.includes("USER_ID_MISMATCH")) {
      return NextResponse.json({ message: "Sesi login tidak valid. Silakan login kembali." }, { status: 401 });
    }
    if (msg.includes("TRANSFER_DISABLED")) {
      return NextResponse.json({ message: "Fitur transfer saldo sedang dinonaktifkan sementara." }, { status: 403 });
    }
    if (msg.includes("SELF_TRANSFER")) {
      return NextResponse.json({ message: "Tidak dapat transfer ke akun sendiri." }, { status: 400 });
    }
    if (msg.includes("RECIPIENT_NOT_FOUND")) {
      return NextResponse.json({ message: "Penerima tidak ditemukan. Periksa kembali QR atau data penerima." }, { status: 404 });
    }
    if (msg.includes("RECIPIENT_WALLET_NOT_FOUND")) {
      return NextResponse.json({ message: "Penerima belum memiliki wallet aktif. Hubungi penerima terlebih dahulu." }, { status: 422 });
    }
    if (msg.includes("WALLET_NOT_FOUND")) {
      return NextResponse.json({ message: "Wallet belum tersedia untuk akun ini. Silakan login ulang." }, { status: 500 });
    }
    if (msg.includes("INSUFFICIENT_BALANCE")) {
      return NextResponse.json({ message: "Saldo Anda tidak mencukupi untuk transfer ini." }, { status: 402 });
    }
    if (msg.includes("INVALID_AMOUNT") || msg.includes("INVALID_NOTE")) {
      return NextResponse.json({ message: "Nominal atau catatan transfer tidak valid." }, { status: 400 });
    }
    if (msg.includes("BELOW_MIN_TRANSFER") || msg.includes("ABOVE_MAX_TRANSFER") || msg.includes("DAILY_LIMIT_EXCEEDED") || msg.includes("MONTHLY_LIMIT_EXCEEDED")) {
      const { data: settings } = await supabase.rpc("get_transfer_settings");
      const s = Array.isArray(settings) ? settings[0] : settings;
      const rupiah = (v: unknown) => formatRupiah(Number(v || 0));
      if (msg.includes("BELOW_MIN_TRANSFER") && s) {
        return NextResponse.json({ message: `Nominal minimal transfer adalah ${rupiah(s.min_transfer)}.` }, { status: 400 });
      }
      if (msg.includes("ABOVE_MAX_TRANSFER") && s) {
        return NextResponse.json({ message: `Nominal maksimal transfer adalah ${rupiah(s.max_transfer)}.` }, { status: 400 });
      }
      if (msg.includes("DAILY_LIMIT_EXCEEDED") && s) {
        const remaining = Math.max(Number(s.daily_limit) - Number(s.used_today || 0), 0);
        return NextResponse.json({ message: `Limit transfer harian terlampaui. Sisa limit hari ini ${rupiah(remaining)}.` }, { status: 403 });
      }
      if (msg.includes("MONTHLY_LIMIT_EXCEEDED") && s) {
        const remaining = Math.max(Number(s.monthly_limit) - Number(s.used_this_month || 0), 0);
        return NextResponse.json({ message: `Limit transfer bulanan terlampaui. Sisa limit bulan ini ${rupiah(remaining)}.` }, { status: 403 });
      }
      return NextResponse.json({ message: "Transfer melebihi batas yang diizinkan." }, { status: 400 });
    }
    if (process.env.NODE_ENV !== "production") {
      console.error("TRANSFER ERROR:", error);
      return NextResponse.json({ message: `Transfer gagal: ${msg || "unknown"}` }, { status: 500 });
    }
    return NextResponse.json({ message: "Transfer gagal. Silakan coba lagi." }, { status: 500 });
  }

  // Detail resi + notifikasi (kegagalan notifikasi tidak membatalkan transfer).
  try {
    const { data: transfer } = await supabase
      .from("wallet_transfers")
      .select("id, transfer_number, amount, fee, total, recipient_id, sender_id")
      .eq("id", transferId)
      .single();

    const { data: recipientProfile } = await admin.from("profiles").select("full_name, email").eq("id", recipient_id).single();
    const { data: senderProfile } = await admin.from("profiles").select("full_name, email").eq("id", user.id).single();
    const recipientName = recipientProfile?.full_name?.trim() || recipientProfile?.email?.split("@")[0] || "Pengguna AIDIL STORE";
    const senderName = senderProfile?.full_name?.trim() || senderProfile?.email?.split("@")[0] || "Pengguna AIDIL STORE";
    const amountText = formatRupiah(Number(transfer?.amount ?? amount));

    await notifyUser({
      userId: recipient_id,
      eventKey: "TRANSFER_RECEIVED",
      variables: { amount: amountText, sender: senderName, reference: transfer?.transfer_number || String(transferId) },
      referenceType: "wallet_transfer",
      referenceId: String(transferId),
      url: "/wallet",
    });

    await notifyUser({
      userId: user.id,
      eventKey: "TRANSFER_SENT",
      variables: { amount: amountText, recipient: recipientName, reference: transfer?.transfer_number || String(transferId) },
      referenceType: "wallet_transfer",
      referenceId: String(transferId),
      url: "/wallet",
    });

    return NextResponse.json({
      transfer_id: transferId,
      transfer_number: transfer?.transfer_number || null,
      amount: Number(transfer?.amount ?? amount),
      fee: Number(transfer?.fee ?? 0),
      total: Number(transfer?.total ?? amount),
      recipient_name: recipientName,
      message: `Transfer ke ${recipientName} berhasil.`,
    }, { status: 201 });
  } catch (notifyError) {
    console.error("TRANSFER NOTIFICATION ERROR:", notifyError);
    return NextResponse.json({
      transfer_id: transferId,
      amount: Number(amount),
      message: "Transfer berhasil diproses.",
    }, { status: 201 });
  }
}
