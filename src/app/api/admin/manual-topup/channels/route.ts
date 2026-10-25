import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManualTopupAdmin } from "@/lib/manual-topup-admin";
import { MANUAL_TOPUP_CHANNEL_TYPES } from "@/lib/manual-topup";

export const dynamic = "force-dynamic";

const channelSchema = z.object({
  channel_type: z.enum(MANUAL_TOPUP_CHANNEL_TYPES),
  display_name: z.string().trim().min(2, "Nama channel minimal 2 karakter.").max(80),
  account_number: z.string().trim().max(80).optional().nullable(),
  account_holder_name: z.string().trim().max(120).optional().nullable(),
  qris_image_url: z.string().trim().max(1000).optional().nullable(),
  instructions: z.string().trim().max(1000).optional().nullable(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(10000).optional(),
});

const updateSchema = channelSchema.partial().extend({ id: z.string().uuid() });

function normalize(input: z.infer<typeof channelSchema>) {
  const isQris = input.channel_type === "QRIS";
  const accountNumber = isQris ? null : (input.account_number || "").trim() || null;
  const qrisImageUrl = isQris ? (input.qris_image_url || "").trim() || null : null;

  if (!isQris && !accountNumber) {
    return { error: "Nomor rekening / akun wajib diisi." };
  }
  if (isQris && !qrisImageUrl) {
    return { error: "Gambar QRIS wajib diunggah untuk channel QRIS." };
  }
  if (qrisImageUrl && !qrisImageUrl.startsWith("https://")) {
    return { error: "URL gambar QRIS tidak valid." };
  }

  return {
    value: {
      channel_type: input.channel_type,
      display_name: input.display_name.trim(),
      account_number: accountNumber,
      account_holder_name: (input.account_holder_name || "").trim() || null,
      qris_image_url: qrisImageUrl,
      instructions: (input.instructions || "").trim() || null,
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 0,
    },
  };
}

export async function GET() {
  const auth = await requireManualTopupAdmin();
  if (auth.error) return auth.error;

  const [{ data: channels, error }, { data: settings, error: settingsError }] = await Promise.all([
    auth.supabase
      .from("manual_topup_channels")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    auth.supabase
      .from("manual_topup_settings")
      .select("is_enabled, min_amount, max_amount, updated_at")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  if (error || settingsError) {
    console.error("[manual-topup-admin] gagal memuat channel", JSON.stringify({
      channels: error?.code ?? null,
      settings: settingsError?.code ?? null,
    }));
    return NextResponse.json(
      { message: "Data Top Up Manual belum tersedia. Pastikan migrasi v93 sudah dijalankan." },
      { status: 503 }
    );
  }

  return NextResponse.json({ channels: channels ?? [], settings: settings ?? null });
}

export async function POST(request: Request) {
  const auth = await requireManualTopupAdmin();
  if (auth.error) return auth.error;

  const parsed = channelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Data channel tidak valid." },
      { status: 400 }
    );
  }

  const normalized = normalize(parsed.data);
  if (normalized.error) return NextResponse.json({ message: normalized.error }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("manual_topup_channels")
    .insert({ ...normalized.value, updated_by: auth.user.id })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[manual-topup-admin] gagal membuat channel", JSON.stringify({ code: error?.code ?? null }));
    return NextResponse.json({ message: "Gagal menyimpan channel. Silakan coba lagi." }, { status: 500 });
  }

  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    actor_id: auth.user.id,
    action: "manual_topup.channel_create",
    target_type: "manual_topup_channel",
    target_id: data.id,
    metadata: { channel_type: data.channel_type, display_name: data.display_name },
  });

  return NextResponse.json({ ok: true, channel: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireManualTopupAdmin();
  if (auth.error) return auth.error;

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Data channel tidak valid." },
      { status: 400 }
    );
  }

  const { id, ...changes } = parsed.data;
  const { data: current, error: currentError } = await auth.supabase
    .from("manual_topup_channels")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (currentError) return NextResponse.json({ message: "Gagal membaca channel." }, { status: 500 });
  if (!current) return NextResponse.json({ message: "Channel tidak ditemukan." }, { status: 404 });

  const merged = {
    channel_type: changes.channel_type ?? current.channel_type,
    display_name: changes.display_name ?? current.display_name,
    account_number: changes.account_number !== undefined ? changes.account_number : current.account_number,
    account_holder_name: changes.account_holder_name !== undefined ? changes.account_holder_name : current.account_holder_name,
    qris_image_url: changes.qris_image_url !== undefined ? changes.qris_image_url : current.qris_image_url,
    instructions: changes.instructions !== undefined ? changes.instructions : current.instructions,
    is_active: changes.is_active ?? current.is_active,
    sort_order: changes.sort_order ?? current.sort_order,
  };

  const normalized = normalize(merged);
  if (normalized.error) return NextResponse.json({ message: normalized.error }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("manual_topup_channels")
    .update({ ...normalized.value, updated_by: auth.user.id })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    console.error("[manual-topup-admin] gagal memperbarui channel", JSON.stringify({ code: error?.code ?? null }));
    return NextResponse.json({ message: "Gagal memperbarui channel. Silakan coba lagi." }, { status: 500 });
  }

  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    actor_id: auth.user.id,
    action: "manual_topup.channel_update",
    target_type: "manual_topup_channel",
    target_id: id,
    metadata: {
      before: {
        channel_type: current.channel_type,
        display_name: current.display_name,
        account_number: current.account_number,
        is_active: current.is_active,
        sort_order: current.sort_order,
      },
      after: {
        channel_type: data.channel_type,
        display_name: data.display_name,
        account_number: data.account_number,
        is_active: data.is_active,
        sort_order: data.sort_order,
      },
    },
  });

  return NextResponse.json({ ok: true, channel: data });
}

export async function DELETE(request: Request) {
  const auth = await requireManualTopupAdmin();
  if (auth.error) return auth.error;

  const id = new URL(request.url).searchParams.get("id") || "";
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ message: "ID channel tidak valid." }, { status: 400 });
  }

  const { count: pendingCount, error: pendingError } = await auth.supabase
    .from("manual_topup_requests")
    .select("id", { count: "exact", head: true })
    .eq("channel_id", id)
    .eq("status", "PENDING");

  if (pendingError) return NextResponse.json({ message: "Gagal memeriksa permintaan aktif." }, { status: 500 });
  if ((pendingCount ?? 0) > 0) {
    return NextResponse.json(
      { message: "Channel masih dipakai permintaan yang menunggu konfirmasi. Nonaktifkan saja channel ini." },
      { status: 409 }
    );
  }

  const { data: current } = await auth.supabase
    .from("manual_topup_channels")
    .select("id, display_name, channel_type")
    .eq("id", id)
    .maybeSingle();
  if (!current) return NextResponse.json({ message: "Channel tidak ditemukan." }, { status: 404 });

  const { error } = await auth.supabase.from("manual_topup_channels").delete().eq("id", id);
  if (error) {
    console.error("[manual-topup-admin] gagal menghapus channel", JSON.stringify({ code: error.code || null }));
    return NextResponse.json({ message: "Gagal menghapus channel. Silakan coba lagi." }, { status: 500 });
  }

  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    actor_id: auth.user.id,
    action: "manual_topup.channel_delete",
    target_type: "manual_topup_channel",
    target_id: id,
    metadata: { display_name: current.display_name, channel_type: current.channel_type },
  });

  return NextResponse.json({ ok: true });
}
