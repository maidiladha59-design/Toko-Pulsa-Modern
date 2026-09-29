import { NextResponse } from "next/server";
import { runCampaigns } from "@/lib/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  try {
    const results = await runCampaigns();
    return NextResponse.json({ ok: true, results, at: new Date().toISOString() });
  } catch (error) {
    console.error("CAMPAIGN CRON ERROR", error);
    return NextResponse.json({ ok: false, message: "Kampanye gagal dijalankan." }, { status: 500 });
  }
}