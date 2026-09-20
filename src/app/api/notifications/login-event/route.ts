import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyUser } from "@/lib/notification-engine";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const userAgent = request.headers.get("user-agent") || "Perangkat tidak dikenal";
  const time = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  await notifyUser({ userId: user.id, eventKey: "SECURITY_LOGIN", variables: { time, device: userAgent.slice(0, 180) }, referenceType: "security", referenceId: user.id, url: "/settings/security" });
  return NextResponse.json({ ok: true });
}
