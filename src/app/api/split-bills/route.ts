import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { notifyUser } from "@/lib/notification-engine";
import { createSplitBillSchema } from "@/lib/splitbill/schemas";
import { calcEqualShares } from "@/lib/splitbill/utils";
import { formatRupiah } from "@/lib/utils";

// Split bill: daftar tagihan saya + buat tagihan baru.
// Permintaan bayar per peserta dibuat di RPC create_split_bill (v76);
// API ini hanya memvalidasi input, membatasi laju, dan mengirim notifikasi.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("get_my_split_bills");
  if (error) {
    console.error("split-bills list error:", error);
    return NextResponse.json({ message: "Gagal memuat daftar tagihan." }, { status: 500 });
  }

  const bills = (Array.isArray(data) ? data : []).map((b: Record<string, unknown>) => ({
    id: String(b.id),
    bill_number: String(b.bill_number || ""),
    title: String(b.title || ""),
    total_amount: Number(b.total_amount || 0),
    split_mode: String(b.split_mode || "EQUAL"),
    status: String(b.status || "ACTIVE"),
    is_creator: Boolean(b.is_creator),
    created_at: String(b.created_at || ""),
    completed_at: b.completed_at ? String(b.completed_at) : null,
    participant_count: Number(b.participant_count || 0),
    paid_count: Number(b.paid_count || 0),
    collected_amount: Number(b.collected_amount || 0),
  }));

  return NextResponse.json({ bills });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const parsed = createSplitBillSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ message: issue?.message || "Data tagihan tidak valid." }, { status: 400 });
  }
  const { title, total_amount, mode, participants } = parsed.data;

  const rateKeyHash = crypto.createHash("sha256").update(`splitbill_create:${user.id}`).digest("hex");
  const rate = await consumeRateLimit(rateKeyHash, 5, 15 * 60);
  if (!rate.allowed) {
    return NextResponse.json({ message: `Terlalu banyak tagihan dibuat. Coba lagi dalam ${rate.retryAfter} detik.` }, { status: 429 });
  }

  const payload = participants.map((p) => (
    mode === "CUSTOM" ? { user_id: p.user_id, share_amount: p.share_amount } : { user_id: p.user_id }
  ));

  const { data: billId, error } = await supabase.rpc("create_split_bill", {
    p_title: title,
    p_total_amount: total_amount,
    p_mode: mode,
    p_participants: payload,
  });

  if (error || !billId) {
    const msg = error?.message || "";
    if (msg.includes("UNAUTHENTICATED")) {
      return NextResponse.json({ message: "Sesi login tidak valid. Silakan login kembali." }, { status: 401 });
    }
    if (msg.includes("INVALID_TITLE")) {
      return NextResponse.json({ message: "Judul tagihan 3-100 karakter." }, { status: 400 });
    }
    if (msg.includes("INVALID_AMOUNT")) {
      return NextResponse.json({ message: "Total tagihan harus berupa rupiah bulat lebih dari 0." }, { status: 400 });
    }
    if (msg.includes("INVALID_MODE")) {
      return NextResponse.json({ message: "Mode pembagian tidak valid." }, { status: 400 });
    }
    if (msg.includes("INVALID_PARTICIPANTS")) {
      return NextResponse.json({ message: "Peserta tagihan tidak valid (1-20 peserta)." }, { status: 400 });
    }
    if (msg.includes("SELF_PARTICIPANT")) {
      return NextResponse.json({ message: "Anda tidak bisa memasukkan diri sendiri sebagai peserta." }, { status: 400 });
    }
    if (msg.includes("PARTICIPANT_NOT_FOUND")) {
      return NextResponse.json({ message: "Ada peserta yang tidak ditemukan. Pilih ulang penerima." }, { status: 404 });
    }
    if (msg.includes("INVALID_SHARE")) {
      return NextResponse.json({ message: "Nominal bagian setiap peserta harus bulat dan lebih dari 0." }, { status: 400 });
    }
    if (msg.includes("DUPLICATE_PARTICIPANT")) {
      return NextResponse.json({ message: "Ada peserta yang terpilih dua kali." }, { status: 400 });
    }
    if (msg.includes("SHARES_MISMATCH")) {
      return NextResponse.json({ message: "Jumlah bagian semua peserta harus sama dengan total tagihan." }, { status: 400 });
    }
    if (process.env.NODE_ENV !== "production") {
      console.error("SPLIT BILL CREATE ERROR:", error);
      return NextResponse.json({ message: `Gagal membuat tagihan: ${msg || "unknown"}` }, { status: 500 });
    }
    return NextResponse.json({ message: "Gagal membuat tagihan. Silakan coba lagi." }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: bill } = await supabase
    .from("split_bills")
    .select("id, bill_number, title, total_amount, split_mode, status")
    .eq("id", billId)
    .single();

  // Notifikasi undangan per peserta (kegagalan notifikasi tidak membatalkan tagihan).
  try {
    const { data: creatorProfile } = await admin.from("profiles").select("full_name, email").eq("id", user.id).single();
    const creatorName = creatorProfile?.full_name?.trim() || creatorProfile?.email?.split("@")[0] || "Pengguna AIDIL STORE";

    const shares = mode === "EQUAL"
      ? calcEqualShares(total_amount, participants.length)
      : participants.map((p) => p.share_amount ?? 0);

    for (let i = 0; i < participants.length; i++) {
      await notifyUser({
        userId: participants[i].user_id,
        eventKey: "SPLITBILL_INVITED",
        variables: {
          creator: creatorName,
          title: bill?.title || title,
          amount: formatRupiah(shares[i] ?? 0),
        },
        referenceType: "split_bill",
        referenceId: String(billId),
        url: `/split-bill/${billId}`,
      });
    }
  } catch (notifyError) {
    console.error("SPLIT BILL INVITE NOTIFICATION ERROR:", notifyError);
  }

  return NextResponse.json({
    bill_id: billId,
    bill_number: bill?.bill_number || null,
    title: bill?.title || title,
    total_amount: Number(bill?.total_amount ?? total_amount),
    split_mode: bill?.split_mode || mode,
    status: bill?.status || "ACTIVE",
    message: "Tagihan patungan dibuat.",
  }, { status: 201 });
}
