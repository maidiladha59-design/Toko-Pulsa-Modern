import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MANUAL_PROOF_BUCKET } from "@/lib/manual-topup";

export const dynamic = "force-dynamic";

type ChannelRow = {
  display_name: string | null;
  account_number: string | null;
  account_holder_name: string | null;
} | null;

type RequestRow = {
  id: string;
  channel_id: string | null;
  channel_type: string;
  amount: number;
  proof_image_url: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  manual_topup_channels: ChannelRow;
};

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });

  const { data, error } = await supabase
    .from("manual_topup_requests")
    .select(
      "id, channel_id, channel_type, amount, proof_image_url, status, admin_note, created_at, reviewed_at, manual_topup_channels(display_name, account_number, account_holder_name)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[manual-topup] gagal memuat riwayat", JSON.stringify({ code: error.code || null }));
    return NextResponse.json(
      { message: "Riwayat Top Up Manual belum tersedia. Silakan hubungi admin." },
      { status: 503 }
    );
  }

  const rows = (data ?? []) as unknown as RequestRow[];
  const admin = createAdminClient();
  const signedUrls = new Map<string, string | null>();
  await Promise.all(
    rows.map(async (row) => {
      if (!row.proof_image_url || signedUrls.has(row.proof_image_url)) return;
      const { data: signed } = await admin.storage
        .from(MANUAL_PROOF_BUCKET)
        .createSignedUrl(row.proof_image_url, 300);
      signedUrls.set(row.proof_image_url, signed?.signedUrl ?? null);
    })
  );

  return NextResponse.json({
    requests: rows.map((row) => ({
      id: row.id,
      channel_id: row.channel_id,
      channel_type: row.channel_type,
      channel_name: row.manual_topup_channels?.display_name || row.channel_type,
      account_number: row.manual_topup_channels?.account_number || null,
      account_holder_name: row.manual_topup_channels?.account_holder_name || null,
      amount: Number(row.amount),
      status: row.status,
      admin_note: row.admin_note,
      proof_url: signedUrls.get(row.proof_image_url) ?? null,
      created_at: row.created_at,
      reviewed_at: row.reviewed_at,
    })),
  });
}
