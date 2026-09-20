"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser client dibuat sekali per module agar referensinya stabil antar-render.
// Hanya anon key yang dipakai di browser; service role key tidak boleh di sini.
let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  return browserClient;
}
