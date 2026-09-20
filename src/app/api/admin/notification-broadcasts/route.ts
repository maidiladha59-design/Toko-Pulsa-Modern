import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWebPush } from "@/lib/push";

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(profile.role)) {
    return null;
  }

  return user;
}

function clean(body: any) {
  const title = String(body?.title || "").trim();
  const subtitle = String(body?.subtitle || "").trim();
  const message = String(body?.message || "").trim();
  if (title.length < 2) throw new Error("Judul minimal 2 karakter.");
  if (title.length > 120) throw new Error("Judul maksimal 120 karakter.");
  if (subtitle.length > 180) throw new Error("Subjudul maksimal 180 karakter.");
  if (message.length > 1000) throw new Error("Isi notifikasi maksimal 1000 karakter.");
  return { title, subtitle, message };
}

async function sendToAllUsers(broadcastId: string, content: ReturnType<typeof clean>) {
  const admin = createAdminClient();
  let offset = 0;
  const pageSize = 1000;
  let total = 0;
  while (true) {
    const { data: users, error } = await admin.from("profiles").select("id").range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!users?.length) break;
    const rows = users.map((u) => ({ user_id: u.id, type: "INFO", title: content.title, subtitle: content.subtitle, message: content.message || content.subtitle || content.title, reference_type: "notification_broadcast", reference_id: broadcastId, is_read: false }));
    const { error: insertError } = await admin.from("notifications").insert(rows);
    if (insertError) throw new Error(insertError.message);
    total += rows.length;
    if (users.length < pageSize) break;
    offset += pageSize;
  }
  return total;
}

async function sendWebPushToAll(content: ReturnType<typeof clean>) {
  const admin = createAdminClient();
  let offset = 0;
  const pageSize = 500;
  let sent = 0;
  let removed = 0;
  while (true) {
    const { data: subs, error } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!subs?.length) break;
    for (const sub of subs) {
      try {
        await sendWebPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, { title: content.title, subtitle: content.subtitle, message: content.message, url: "/", tag: `broadcast-${Date.now()}` });
        sent++;
      } catch (error: any) {
        const status = Number(error?.statusCode || 0);
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
          removed++;
        } else console.error("web push failed:", error);
      }
    }
    if (subs.length < pageSize) break;
    offset += pageSize;
  }
  return { sent, removed };
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await createAdminClient()
    .from("notification_broadcasts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ broadcasts: data || [] });
}

export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  let content: ReturnType<typeof clean>;
  try {
    content = clean(body);
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "Data tidak valid." }, { status: 400 });
  }

  const admin = createAdminClient();
  const id = body?.id ? String(body.id) : null;
  const publish = body?.publish === true;

  if (id) {
    const { data, error } = await admin
      .from("notification_broadcasts")
      .update({ ...content, is_active: body?.is_active !== false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ message: error.message }, { status: 400 });

    if (publish) {
      await admin
        .from("notifications")
        .update({
          title: content.title,
          subtitle: content.subtitle,
          message: content.message || content.subtitle || content.title,
        })
        .eq("reference_type", "notification_broadcast")
        .eq("reference_id", id);

      const { count } = await admin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("reference_type", "notification_broadcast")
        .eq("reference_id", id);

      if (!count) {
        try {
          await sendToAllUsers(id, content);
        } catch (e) {
          return NextResponse.json({ message: e instanceof Error ? e.message : "Gagal mengirim notifikasi." }, { status: 500 });
        }
      }

      const push = await sendWebPushToAll(content);
      await admin.from("notification_broadcasts").update({ sent_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ broadcast: data, pushSent: push.sent, removedSubscriptions: push.removed });
    }

    return NextResponse.json({ broadcast: data });
  }

  const { data, error } = await admin
    .from("notification_broadcasts")
    .insert({ ...content, created_by: user.id, is_active: body?.is_active !== false })
    .select("*")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  let sent = 0;
  if (publish) {
    try {
      sent = await sendToAllUsers(data.id, content);
    } catch (e) {
      return NextResponse.json({ message: e instanceof Error ? e.message : "Broadcast tersimpan tetapi gagal dikirim." }, { status: 500 });
    }
    const push = await sendWebPushToAll(content);
    await admin.from("notification_broadcasts").update({ sent_at: new Date().toISOString() }).eq("id", data.id);
    return NextResponse.json({ broadcast: data, sent, pushSent: push.sent, removedSubscriptions: push.removed });
  }

  return NextResponse.json({ broadcast: data, sent });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ message: "ID wajib." }, { status: 400 });

  const { error } = await createAdminClient()
    .from("notification_broadcasts")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", body.id);

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
