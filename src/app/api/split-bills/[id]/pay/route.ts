import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTransactionPin } from "@/lib/security/transaction-pin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { notifyUser } from "@/lib/notification-engine";
import { paySplitBillSchema, billIdParamSchema } from "@/lib/splitbill/schemas";
import { formatRupiah } from "@/lib/utils";

// Bayar bagian saya pada tagihan patungan.
// Uang berpindah SATU-SATUNYA lewat create_wallet_transfer (v75) yang
// dipanggil pay_split_bill_share dalam satu transaksi atomik: transfer +
// tandai lunas + selesaikan tagihan terjadi bersamaan.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const parsedId = billIdParamSchema.safeParse(params.id);
  if (!parsedId.success) {
    return NextResponse.json({ message: "ID tagihan tidak valid." }, { status: 400 });
  }
  const billId = parsedId.data;

  const parsed = paySplitBillSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Data pembayaran tidak valid." }, { status: 400 });
  }
  const { pin, idempotency_key } = parsed.data;

  const admin = createAdminClient();

  // Idempotency: retry jaringan dengan key yang sama tidak memindahkan saldo
  // dua kali. Transfer yang memang milik tagihan ini cukup diputar ulang
  // tanpa verifikasi PIN lagi; key yang dipakai transfer lain ditolak di RPC.
  const { data: existing } = await admin
    .from("wallet_transfers")
    .select("id, transfer_number, amount, fee, total, recipient_id")
    .eq("sender_id", user.id)
    .eq("idempotency_key", idempotency_key)
    .maybeSingle();
  if (existing) {
    const { data: bill } = await admin.from("split_bills").select("creator_id").eq("id", billId).single();
    if (bill && existing.recipient_id === bill.creator_id) {
      return NextResponse.json({
        transfer_id: existing.id,
        transfer_number: existing.transfer_number,
        amount: Number(existing.amount),
        fee: Number(existing.fee),
        total: Number(existing.total),
        message: "Pembayaran bagian Anda sudah diproses sebelumnya.",
      });
    }
  }

  const rateKeyHash = crypto.createHash("sha256").update(`splitbill_pay:${user.id}`).digest("hex");
  const rate = await consumeRateLimit(rateKeyHash, 10, 15 * 60);
  if (!rate.allowed) {
    return NextResponse.json({ message: `Terlalu banyak percobaan pembayaran. Coba lagi dalam ${rate.retryAfter} detik.` }, { status: 429 });
  }

  try {
    await verifyTransactionPin(user.id, pin);
  } catch (e: any) {
    if (e?.message === "PIN_NOT_SET") return NextResponse.json({ message: "Buat PIN transaksi terlebih dahulu di Pengaturan." }, { status: 409 });
    if (e?.message === "PIN_LOCKED") return NextResponse.json({ message: "PIN terkunci sementara karena terlalu banyak percobaan gagal." }, { status: 429 });
    return NextResponse.json({ message: "PIN transaksi salah." }, { status: 401 });
  }

  const { data: result, error } = await supabase.rpc("pay_split_bill_share", {
    p_bill_id: billId,
    p_idempotency_key: idempotency_key,
  });

  if (error || !result) {
    const msg = error?.message || "";
    if (msg.includes("UNAUTHENTICATED")) {
      return NextResponse.json({ message: "Sesi login tidak valid. Silakan login kembali." }, { status: 401 });
    }
    if (msg.includes("BILL_NOT_FOUND")) {
      return NextResponse.json({ message: "Tagihan tidak ditemukan." }, { status: 404 });
    }
    if (msg.includes("NOT_PARTICIPANT")) {
      return NextResponse.json({ message: "Pembuat tagihan tidak membayar bagian sendiri." }, { status: 400 });
    }
    if (msg.includes("BILL_NOT_ACTIVE")) {
      return NextResponse.json({ message: "Tagihan ini sudah selesai." }, { status: 409 });
    }
    if (msg.includes("ALREADY_PAID")) {
      return NextResponse.json({ message: "Bagian Anda pada tagihan ini sudah dibayar." }, { status: 409 });
    }
    if (msg.includes("IDEMPOTENCY_KEY_REUSED")) {
      return NextResponse.json({ message: "Percobaan pembayaran ini sudah dipakai untuk transfer lain." }, { status: 409 });
    }
    // Kesalahan yang merambat dari create_wallet_transfer (v75).
    if (msg.includes("TRANSFER_DISABLED")) {
      return NextResponse.json({ message: "Fitur transfer saldo sedang dinonaktifkan sementara." }, { status: 403 });
    }
    if (msg.includes("INSUFFICIENT_BALANCE")) {
      return NextResponse.json({ message: "Saldo Anda tidak mencukupi untuk membayar bagian ini (termasuk biaya admin)." }, { status: 402 });
    }
    if (msg.includes("BELOW_MIN_TRANSFER") || msg.includes("ABOVE_MAX_TRANSFER") || msg.includes("DAILY_LIMIT_EXCEEDED") || msg.includes("MONTHLY_LIMIT_EXCEEDED")) {
      return NextResponse.json({ message: "Bagian Anda melebihi batas transfer yang berlaku. Hubungi pembuat tagihan." }, { status: 403 });
    }
    if (msg.includes("RECIPIENT_WALLET_NOT_FOUND")) {
      return NextResponse.json({ message: "Wallet pembuat tagihan bermasalah. Hubungi pembuat tagihan." }, { status: 422 });
    }
    if (process.env.NODE_ENV !== "production") {
      console.error("SPLIT BILL PAY ERROR:", error);
      return NextResponse.json({ message: `Pembayaran gagal: ${msg || "unknown"}` }, { status: 500 });
    }
    return NextResponse.json({ message: "Pembayaran gagal. Silakan coba lagi." }, { status: 500 });
  }

  const payment = result as {
    transfer_id: string; transfer_number: string | null; amount: number | string;
    fee: number | string; total: number | string; bill_status: string;
    completed: boolean; creator_id: string; creator_name: string | null;
    bill_title: string; bill_total_amount: number | string;
  };

  // Notifikasi: resi ke pembayar + penerimaan ke pembuat; bila tagihan
  // selesai, kabarkan ke pembuat (kegagalan notifikasi tidak membatalkan
  // pembayaran yang sudah atomik terjadi).
  try {
    const { data: payerProfile } = await admin.from("profiles").select("full_name, email").eq("id", user.id).single();
    const payerName = payerProfile?.full_name?.trim() || payerProfile?.email?.split("@")[0] || "Pengguna AIDIL STORE";
    const creatorName = payment.creator_name?.trim() || "Pembuat Tagihan";
    const amountText = formatRupiah(Number(payment.amount));

    await notifyUser({
      userId: user.id,
      eventKey: "TRANSFER_SENT",
      variables: { amount: amountText, recipient: creatorName, reference: payment.transfer_number || String(payment.transfer_id) },
      referenceType: "split_bill",
      referenceId: billId,
      url: `/split-bill/${billId}`,
    });

    await notifyUser({
      userId: payment.creator_id,
      eventKey: "TRANSFER_RECEIVED",
      variables: { amount: amountText, sender: payerName, reference: payment.transfer_number || String(payment.transfer_id) },
      referenceType: "split_bill",
      referenceId: billId,
      url: `/split-bill/${billId}`,
    });

    if (payment.completed) {
      await notifyUser({
        userId: payment.creator_id,
        eventKey: "SPLITBILL_COMPLETED",
        variables: { title: payment.bill_title, amount: formatRupiah(Number(payment.bill_total_amount)) },
        referenceType: "split_bill",
        referenceId: billId,
        url: `/split-bill/${billId}`,
      });
    }
  } catch (notifyError) {
    console.error("SPLIT BILL PAY NOTIFICATION ERROR:", notifyError);
  }

  return NextResponse.json({
    transfer_id: payment.transfer_id,
    transfer_number: payment.transfer_number,
    amount: Number(payment.amount),
    fee: Number(payment.fee || 0),
    total: Number(payment.total || payment.amount),
    bill_status: payment.bill_status,
    completed: Boolean(payment.completed),
    creator_name: payment.creator_name,
    bill_title: payment.bill_title,
    message: `Bagian Anda pada "${payment.bill_title}" berhasil dibayar.`,
  }, { status: 201 });
}
