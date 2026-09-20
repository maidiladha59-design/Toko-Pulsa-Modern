import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fulfillPpobOrder } from "@/lib/ppob/fulfill";
import { verifyTransactionPin } from "@/lib/security/transaction-pin";
import { notifyUser } from "@/lib/notification-engine";

const bodySchema = z.object({
  items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().positive() })).min(1),
  idempotency_key: z.string().min(10),
  voucher_code: z.string().trim().max(64).optional(),
  pin: z.string().optional(),
  targets: z.record(z.object({ customer_no: z.string().min(3).max(64), target_data: z.record(z.unknown()).optional() })).optional(),
});

// Checkout atomic: harga & stok diambil dari database (tidak percaya client),
// saldo dikurangi dalam satu transaction lewat fungsi `checkout` di database.
// idempotency_key mencegah double-click menghasilkan dua pembelian.
export async function POST(request: Request) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "Data checkout tidak valid." }, { status: 400 });
  }

  const { items, idempotency_key, targets = {}, pin, voucher_code } = parsed.data;
  if (!pin) return NextResponse.json({ message: "PIN transaksi wajib diisi." }, { status: 400 });
  try { await verifyTransactionPin(user.id, pin); } catch (e: any) {
    if (e?.message === "PIN_NOT_SET") return NextResponse.json({ message: "Buat PIN transaksi terlebih dahulu di Pengaturan." }, { status: 409 });
    if (e?.message === "PIN_LOCKED") return NextResponse.json({ message: "PIN terkunci sementara karena terlalu banyak percobaan gagal." }, { status: 429 });
    return NextResponse.json({ message: "PIN transaksi salah." }, { status: 401 });
  }

  // Validasi target PPOB sebelum saldo dipotong.
  const { data: ppobServices } = await supabase.from("ppob_services").select("product_id, service_kind, category").in("product_id", items.map((item) => item.product_id)).eq("provider_active", true);
  const { data: profile } = await supabase.from("profiles").select("account_type").eq("id", user.id).single();
  const isReseller = profile?.account_type === "RESELLER";
  const allowedWithoutKyc = new Set(["pulsa", "paket-data", "top-up-game", "pulsa-prabayar", "paket_data", "game"]);
  for (const service of ppobServices || []) {
    const target = (targets as any)[service.product_id];
    if (!isReseller && !allowedWithoutKyc.has(String(service.category || "").toLowerCase())) {
      return NextResponse.json({ message: "Akun Pelanggan harus menyelesaikan verifikasi KYC terlebih dahulu untuk layanan ini." }, { status: 403 });
    }
    if (!target?.customer_no) return NextResponse.json({ message: "Nomor tujuan PPOB wajib diisi sebelum membayar." }, { status: 400 });
    if (service.service_kind === "postpaid") return NextResponse.json({ message: "Checkout pascabayar menggunakan alur inquiry tagihan dan belum dapat dibayar dari checkout produk biasa." }, { status: 400 });
  }

  if (!isReseller) {
    const ppobProductIds = new Set((ppobServices || []).map((x: any) => x.product_id));
    const nonPpob = items.some((x) => !ppobProductIds.has(x.product_id));
    if (nonPpob) return NextResponse.json({ message: "Akun Pelanggan harus diverifikasi KYC sebelum membeli layanan ini." }, { status: 403 });
  }

  const { data: orderId, error } = voucher_code
    ? await supabase.rpc("checkout_with_voucher", {
        p_user_id: user.id,
        p_items: items,
        p_idempotency_key: idempotency_key,
        p_voucher_code: voucher_code,
      })
    : await supabase.rpc("checkout", {
        p_user_id: user.id,
        p_items: items,
        p_idempotency_key: idempotency_key,
      });

  if (error) {
    if (error.message.includes("UNAUTHENTICATED") || error.message.includes("USER_ID_MISMATCH")) {
      return NextResponse.json({ message: "Sesi login tidak valid. Silakan login kembali." }, { status: 401 });
    }
    if (error.message.includes("INSUFFICIENT_BALANCE")) {
      return NextResponse.json({ message: "Saldo Anda tidak mencukupi." }, { status: 402 });
    }
    if (error.message.includes("PRODUCT_NOT_FOUND")) {
      return NextResponse.json({ message: "Produk tidak ditemukan atau sudah tidak tersedia." }, { status: 404 });
    }
    if (error.message.includes("WALLET_NOT_FOUND")) {
      return NextResponse.json({ message: "Wallet belum tersedia untuk akun ini. Silakan login ulang." }, { status: 500 });
    }
    if (error.message.includes("INVALID_ITEM") || error.message.includes("INVALID_ITEMS") || error.message.includes("INVALID_QUANTITY")) {
      return NextResponse.json({ message: "Data produk atau jumlah tidak valid." }, { status: 400 });
    }
    if (process.env.NODE_ENV !== "production") {
      console.error("CHECKOUT ERROR:", error);
      return NextResponse.json({ message: `Checkout gagal: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ message: "Checkout gagal. Silakan coba lagi." }, { status: 500 });
  }

  // Siapkan transaksi PPOB menggunakan target yang dikirim dari checkout.
  try {
    const admin = createAdminClient();
    const { data: ppobItems } = await admin.from("order_items").select("id, product_id, ppob_services(id, provider, provider_sku, service_kind)").eq("order_id", orderId);
    let hasPpob = false;
    for (const item of (ppobItems || []) as any[]) {
      const service = Array.isArray(item.ppob_services) ? item.ppob_services[0] : item.ppob_services;
      if (!service) continue;
      hasPpob = true;
      const target = (targets as any)[item.product_id] || (targets as any)[item.id];
      if (!target?.customer_no) continue;
      const providerRef = `AS-${String(orderId).replaceAll("-", "")}-${String(item.id).replaceAll("-", "")}`;
      await admin.from("ppob_order_targets").upsert({ order_item_id: item.id, customer_no: target.customer_no, target_data: target.target_data || {}, updated_at: new Date().toISOString() }, { onConflict: "order_item_id" });
      await admin.from("ppob_transactions").upsert({ order_id: orderId, order_item_id: item.id, service_id: service.id, provider: service.provider, provider_ref_id: providerRef, customer_no: target.customer_no, target_data: target.target_data || {}, status: "WAITING" }, { onConflict: "order_item_id", ignoreDuplicates: true });
    }
    if (hasPpob) {
      await admin.from("orders").update({ status: "PROCESSING", updated_at: new Date().toISOString() }).eq("id", orderId).eq("status", "COMPLETED");
      await fulfillPpobOrder(orderId);
    }
  } catch (ppobError) {
    console.error("PPOB WALLET PREP ERROR:", ppobError);
  }

  // Produk digital yang langsung dibayar saldo dapat diselesaikan otomatis.
  // Produk/jasa non-digital tetap PROCESSING agar admin dapat menyelesaikannya manual.
  try {
    const admin = createAdminClient();
    const { data: items } = await admin
      .from("order_items")
      .select("product_id, products(product_type), ppob_services(id)")
      .eq("order_id", orderId);
    const allDigital =
  Boolean(items?.length) &&
  (items ?? []).every(
    (item: any) =>
      item.products?.product_type === "DIGITAL" &&
      item.ppob_services
  );
    if (allDigital) {
      await admin.from("orders").update({ status: "COMPLETED", updated_at: new Date().toISOString() }).eq("id", orderId).eq("status", "PROCESSING");
    }
  } catch (completionError) {
    console.error("AUTO COMPLETE ORDER ERROR:", completionError);
    // Pembayaran tetap berhasil; admin masih dapat menyelesaikan order dari panel.
  }

  try {
    const admin = createAdminClient();
    const { data: finalOrder } = await admin
      .from("orders")
      .select("id,status,total_amount")
      .eq("id", orderId)
      .maybeSingle();

    if (finalOrder?.status === "COMPLETED") {
      await notifyUser({
        userId: user.id,
        eventKey: "TRANSACTION_SUCCESS",
        variables: {
          amount: `Rp${Number(finalOrder.total_amount).toLocaleString("id-ID")}`,
          reference: String(finalOrder.id),
        },
        referenceType: "order",
        referenceId: String(finalOrder.id),
        url: `/orders/${finalOrder.id}`,
      });
    }
  } catch (notificationError) {
    console.error("CHECKOUT NOTIFICATION ERROR:", notificationError);
  }

  return NextResponse.json({ order_id: orderId, message: "Pesanan berhasil dibuat." }, { status: 201 });
}
