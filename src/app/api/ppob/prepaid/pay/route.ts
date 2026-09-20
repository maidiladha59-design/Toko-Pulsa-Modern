import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fulfillPpobOrder } from "@/lib/ppob/fulfill";
import { verifyTransactionPin } from "@/lib/security/transaction-pin";

const schema = z.object({
  product_id: z.string().uuid(),
  customer_no: z.string().trim().min(3).max(64),
  target_data: z.record(z.unknown()).optional(),
  idempotency_key: z.string().min(10).max(200),
  pin: z.string().optional(),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Data pembayaran PPOB tidak valid." }, { status: 400 });

  const { product_id, customer_no, target_data, idempotency_key, pin } = parsed.data;
  if (!pin) return NextResponse.json({ message: "PIN transaksi wajib diisi." }, { status: 400 });
  try { await verifyTransactionPin(user.id, pin); } catch (e: any) {
    if (e?.message === "PIN_NOT_SET") return NextResponse.json({ message: "Buat PIN transaksi terlebih dahulu di Pengaturan." }, { status: 409 });
    if (e?.message === "PIN_LOCKED") return NextResponse.json({ message: "PIN terkunci sementara karena terlalu banyak percobaan gagal." }, { status: 429 });
    return NextResponse.json({ message: "PIN transaksi salah." }, { status: 401 });
  }
  const { data: orderId, error } = await supabase.rpc("create_ppob_prepaid_wallet_order", {
    p_user_id: user.id,
    p_product_id: product_id,
    p_customer_no: customer_no,
    p_target_data: target_data || {},
    p_idempotency_key: idempotency_key,
  });

  if (error) {
    const m = error.message || "";
    if (m.includes("INSUFFICIENT_BALANCE")) return NextResponse.json({ message: "Saldo tidak mencukupi." }, { status: 402 });
    if (m.includes("PPOB_SERVICE_NOT_FOUND")) return NextResponse.json({ message: "Layanan PPOB sedang tidak tersedia." }, { status: 404 });
    if (m.includes("PRODUCT_NOT_FOUND")) return NextResponse.json({ message: "Produk tidak ditemukan atau sudah tidak aktif." }, { status: 404 });
    if (m.includes("TARGET_REQUIRED")) return NextResponse.json({ message: "Nomor tujuan wajib diisi." }, { status: 400 });
    if (m.includes("UNAUTHENTICATED") || m.includes("USER_ID_MISMATCH")) return NextResponse.json({ message: "Sesi login tidak valid." }, { status: 401 });
    if (process.env.NODE_ENV !== "production") console.error("PPOB PREPAID WALLET ERROR", error);
    return NextResponse.json({ message: "Pembayaran PPOB gagal dibuat." }, { status: 500 });
  }

  try { await fulfillPpobOrder(orderId as string); } catch (e) { console.error("PPOB FULFILL AFTER WALLET", e); }
  return NextResponse.json({ order_id: orderId, message: "Pembayaran diterima dan PPOB sedang diproses." }, { status: 201 });
}
