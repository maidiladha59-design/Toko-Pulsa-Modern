"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { NetworkError } from "@/components/NetworkState";

export default function OrdersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px] pb-6 pt-2">
        <NetworkError onRetry={reset} />
      </div>
    </div>
  );
}
