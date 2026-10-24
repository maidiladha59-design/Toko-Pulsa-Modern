"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import RatingBadgeView from "@/components/RatingBadgeView";
import type { RatingSummary } from "@/lib/ratings";

// Dipakai halaman pra-login (/welcome) yang seluruhnya Client Component.
// RPC get_rating_summary memang dapat dipanggil anon; jika migrasi v90 belum
// dijalankan, badge disembunyikan tanpa error.
export default function RatingBadgeLive({
  showEmpty = false,
  className = "",
}: {
  showEmpty?: boolean;
  className?: string;
}) {
  const [summary, setSummary] = useState<RatingSummary | null>(null);

  useEffect(() => {
    let active = true;

    createClient()
      .rpc("get_rating_summary")
      .then(({ data, error }) => {
        if (!active || error) return;
        const row = (Array.isArray(data) ? data[0] : data) as
          | { average?: number | string | null; total_count?: number | string | null }
          | null;
        setSummary({
          average: Number(row?.average ?? 0) || 0,
          totalCount: Number(row?.total_count ?? 0) || 0,
        });
      });

    return () => {
      active = false;
    };
  }, []);

  if (!summary) return null;
  return <RatingBadgeView summary={summary} showEmpty={showEmpty} className={className} />;
}
