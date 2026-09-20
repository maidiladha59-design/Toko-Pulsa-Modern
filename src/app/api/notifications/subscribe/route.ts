import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => null);
    const subscription = body?.subscription;
    const endpoint = String(subscription?.endpoint || "").trim();
    const p256dh = String(subscription?.keys?.p256dh || "").trim();
    const auth = String(subscription?.keys?.auth || "").trim();
    if (!endpoint || !p256dh || !auth) return NextResponse.json({ message: "Subscription push tidak valid." }, { status: 400 });
    const { error } = await createAdminClient().from("push_subscriptions").upsert({
      user_id: user.id, endpoint, p256dh, auth,
      user_agent: req.headers.get("user-agent") || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
    if (error) return NextResponse.json({ message: "Gagal menyimpan izin notifikasi." }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("push subscribe error:", error);
    return NextResponse.json({ message: "Terjadi kesalahan." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => null);
    const endpoint = String(body?.endpoint || "").trim();
    if (!endpoint) return NextResponse.json({ message: "Endpoint wajib." }, { status: 400 });
    const { error } = await createAdminClient().from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ message: "Terjadi kesalahan." }, { status: 500 });
  }
}
