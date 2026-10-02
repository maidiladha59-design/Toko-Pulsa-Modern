import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { notifyUser } from "@/lib/notification-engine";
import { remindParticipantSchema, billIdParamSchema } from "@/lib/splitbill/schemas";
import { formatRupiah } from "@/lib/utils";

// Kirim pengingat tagihan ke satu peserta yang belum bayar.
// Pembatasan frekuensi utama ada di RPC send_split_bill_reminder
// (maks 1x per jam per peserta, dengan kunci baris); rate limit di sini
// hanya menjaga API dari penyalahgunaan.
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

  const parsed = remindParticipantSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Data pengingat tidak valid." }, { status: 400 });
  }
  const { participant_user_id } = parsed.data;

  const rateKeyHash = crypto.createHash("sha256").update(`splitbill_remind:${user.id}`).digest("hex");
  const rate = await consumeRateLimit(rateKeyHash, 10, 15 * 60);
  if (!rate.allowed) {
    return NextResponse.json({ message: `Terlalu banyak pengingat terkirim. Coba lagi dalam ${rate.retryAfter} detik.` }, { status: 429 });
  }

  const { data: reminder, error } = await supabase.rpc("send_split_bill_reminder", {
    p_bill_id: billId,
    p_participant_user_id: participant_user_id,
  });

  if (error || !reminder) {
    const msg = error?.message || "";
    if (msg.includes("UNAUTHENTICATED")) {
      return NextResponse.json({ message: "Sesi login tidak valid. Silakan login kembali." }, { status: 401 });
    }
    if (msg.includes("BILL_NOT_FOUND")) {
      return NextResponse.json({ message: "Tagihan tidak ditemukan atau bukan milik Anda." }, { status: 404 });
    }
    if (msg.includes("BILL_NOT_ACTIVE")) {
      return NextResponse.json({ message: "Tagihan ini sudah selesai." }, { status: 409 });
    }
    if (msg.includes("PARTICIPANT_NOT_FOUND")) {
      return NextResponse.json({ message: "Peserta tidak ditemukan atau sudah membayar." }, { status: 404 });
    }
    if (msg.includes("REMINDER_TOO_FREQUENT")) {
      return NextResponse.json({ message: "Pengingat untuk peserta ini baru bisa dikirim 1 jam sejak pengingat terakhir." }, { status: 429 });
    }
    if (process.env.NODE_ENV !== "production") {
      console.error("SPLIT BILL REMIND ERROR:", error);
      return NextResponse.json({ message: `Gagal mengirim pengingat: ${msg || "unknown"}` }, { status: 500 });
    }
    return NextResponse.json({ message: "Gagal mengirim pengingat. Silakan coba lagi." }, { status: 500 });
  }

  const info = reminder as { share_amount: number | string; title: string };

  // Notifikasi pengingat ke peserta (kegagalan notifikasi tidak membatalkan
  // penandaan waktu pengingat di database).
  try {
    const admin = createAdminClient();
    const { data: creatorProfile } = await admin.from("profiles").select("full_name, email").eq("id", user.id).single();
    const creatorName = creatorProfile?.full_name?.trim() || creatorProfile?.email?.split("@")[0] || "Pengguna AIDIL STORE";

    await notifyUser({
      userId: participant_user_id,
      eventKey: "SPLITBILL_REMINDER",
      variables: {
        creator: creatorName,
        title: info.title,
        amount: formatRupiah(Number(info.share_amount)),
      },
      referenceType: "split_bill",
      referenceId: billId,
      url: `/split-bill/${billId}`,
    });
  } catch (notifyError) {
    console.error("SPLIT BILL REMIND NOTIFICATION ERROR:", notifyError);
  }

  return NextResponse.json({ message: "Pengingat terkirim ke peserta." });
}
