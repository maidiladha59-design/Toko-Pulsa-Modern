import { createAdminClient } from "@/lib/supabase/admin";
import { sendWebPush } from "@/lib/push";

export type Campaign = {
  key: string; title: string; message: string; url: string;
  min_days: number; cooldown_days: number; enabled: boolean;
};

const PER_RUN_LIMIT = 200;
const BATCH = 20;

async function sendToUser(campaign: Campaign, userId: string) {
  const admin = createAdminClient();
  const { data: subs } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", userId);
  let delivered = 0;
  for (const sub of subs || []) {
    try {
      await sendWebPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, {
        title: campaign.title, message: campaign.message, url: campaign.url || "/",
        tag: `campaign-${campaign.key}`,
      });
      delivered++;
    } catch (e: any) {
      if ([404, 410].includes(Number(e?.statusCode || 0))) await admin.from("push_subscriptions").delete().eq("id", sub.id);
    }
  }
  if (delivered > 0) {
    await admin.from("notifications").insert({
      user_id: userId, type: "INFO", title: campaign.title, subtitle: "", message: campaign.message,
      reference_type: "push_campaign", reference_id: null, is_read: false,
    });
    await admin.from("push_campaign_logs").insert({ campaign_key: campaign.key, user_id: userId });
  }
  return delivered > 0;
}

export async function runCampaigns() {
  const admin = createAdminClient();
  const { data: campaigns, error } = await admin.from("push_campaigns").select("*").eq("enabled", true);
  if (error) throw new Error(error.message);

  const results: Record<string, { targeted: number; sent: number }> = {};
  for (const c of (campaigns || []) as Campaign[]) {
    const { data: targets, error: tErr } = await admin.rpc("campaign_targets", {
      p_key: c.key, p_min_days: c.min_days, p_cooldown_days: c.cooldown_days, p_limit: PER_RUN_LIMIT,
    });
    if (tErr) throw new Error(tErr.message);
    const ids = ((targets || []) as { user_id: string }[]).map((t) => t.user_id);
    let sent = 0;
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      const res = await Promise.allSettled(chunk.map((id) => sendToUser(c, id)));
      sent += res.filter((r) => r.status === "fulfilled" && r.value).length;
    }
    results[c.key] = { targeted: ids.length, sent };
  }
  return results;
}