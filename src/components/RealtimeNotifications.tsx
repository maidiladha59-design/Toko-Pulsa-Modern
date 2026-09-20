"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function RealtimeNotifications({ onInsert }: { onInsert: (notification: any) => void }) {
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    async function setup() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active || !user) return;
      const topic = `notifications:${user.id}`;
      const existing = supabase.getChannels().find((item) => item.topic === `realtime:${topic}`);
      if (existing) await supabase.removeChannel(existing);
      if (!active) return;
      channel = supabase.channel(topic).on("postgres_changes", { event:"INSERT", schema:"public", table:"notifications", filter:`user_id=eq.${user.id}` }, (payload) => {
        if (active) onInsert(payload.new);
      });
      await channel.subscribe((status) => {
        if (status === "CHANNEL_ERROR") console.error("Realtime notifications channel error.");
        if (status === "TIMED_OUT") console.error("Realtime notifications connection timed out.");
      });
    }
    setup();
    return () => { active = false; if (channel) supabase.removeChannel(channel); };
  }, [onInsert]);
  return null;
}
