"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForceSignOut() {
  useEffect(() => {
    void createClient().auth.signOut().catch(() => {});
  }, []);

  return null;
}
