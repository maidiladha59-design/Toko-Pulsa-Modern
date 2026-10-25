import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManualTopupAdmin } from "@/lib/manual-topup-admin";
import { MANUAL_PROOF_BUCKET } from "@/lib/manual-topup";

export const dynamic = "force-dynamic";

const STATUSES = ["ALL", "PENDING", "APPROVED", "REJECTED"];

type ChannelRow = {
  display_name: string | null;
  account_number: string | null;
  account_holder_name: string | null;
} | null;

type RequestRow = {
  id: string;
  user_id: string;
  channel_id: string | null;
  channel_type: string;
  amount: number;
  proof_image_url: string;
  status: string;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  manual_topup_channels: ChannelRow;
};

export async function GET(request: Request) {
  const auth = await requireManualTopupAdmin();
  if (auth.error) return auth.error;

  const status = (new URL(request.url).searchParams.get("status") || "ALL").toUpperCase();
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ message: "Filter status tidak valid." }, { status: 400 });
  }

  let query = auth.supabase
    .from("manual_topup_requests")
    .select(
      "id, user_id, channel_id, channel_type, amount, proof_image_url, status, admin_note, reviewed_by, reviewed_at, created_at, manual_topup_channels(display_name, account_number, account_holder_name)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (status !== "ALL") query = query.eq("status", status);

  const [listResult, pendingCount, approvedCount, rejectedCount] = await Promise.all([
    query,
    auth.supabase.from("manual_topup_requests").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
    auth.supabase.from("manual_topup_requests").select("id", { count: "exact", head: true }).eq("status", "APPROVED"),
    auth.supabase.from("manual_topup_requests").select("id", { count: "exact", head: true }).eq("status", "REJECTED"),
  ]);

  if (listResult.error) {
    console.error("[manual-topup-admin] gagal memuat permintaan", JSON.stringify({ code: listResult.error.code || null }));
    return NextResponse.json(
      { message: "Data permintaan Top Up Manual belum tersedia. Pastikan migrasi v93 sudah dijalankan." },
      { status: 503 }
    );
  }

  const rows = (listResult.data ?? []) as unknown as RequestRow[];
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const profileMap = new Map<string, { full_name: string | null; email: string | null }>();

  if (userIds.length > 0) {
    const { data: profiles } = await auth.supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    for (const profile of profiles ?? []) {
      profileMap.set(profile.id, { full_name: profile.full_name, email: profile.email });
    }
  }

  const admin = createAdminClient();
  const signedUrls = new Map<string, string | null>();
  await Promise.all(
    rows.map(async (row) => {
      if (!row.proof_image_url || signedUrls.has(row.proof_image_url)) return;
      const { data: signed } = await admin.storage
        .from(MANUAL_PROOF_BUCKET)
        .createSignedUrl(row.proof_image_url, 600);
      signedUrls.set(row.proof_image_url, signed?.signedUrl ?? null);
    })
  );

  return NextResponse.json({
    counts: {
      PENDING: pendingCount.count ?? 0,
      APPROVED: approvedCount.count ?? 0,
      REJECTED: rejectedCount.count ?? 0,
    },
    requests: rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      user_name: profileMap.get(row.user_id)?.full_name || "Pengguna AIDIL STORE",
      user_email: profileMap.get(row.user_id)?.email || null,
      channel_id: row.channel_id,
      channel_type: row.channel_type,
      channel_name: row.manual_topup_channels?.display_name || row.channel_type,
      account_number: row.manual_topup_channels?.account_number || null,
      account_holder_name: row.manual_topup_channels?.account_holder_name || null,
      amount: Number(row.amount),
      proof_url: signedUrls.get(row.proof_image_url) ?? null,
      status: row.status,
      admin_note: row.admin_note,
      reviewed_at: row.reviewed_at,
      created_at: row.created_at,
    })),
  });
}
