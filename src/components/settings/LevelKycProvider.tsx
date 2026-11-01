"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { LevelKycSettings } from "@/lib/level-kyc-settings";

// Pengaturan level & KYC dibaca sekali di root layout (cache server 60 detik),
// lalu dibagikan ke komponen client. Tidak ada permintaan jaringan tambahan
// dari browser dan tidak ada value import zod di bundle client.

const LevelKycContext = createContext<LevelKycSettings | null>(null);

export default function LevelKycProvider({
  settings,
  children,
}: {
  settings: LevelKycSettings;
  children: ReactNode;
}) {
  return <LevelKycContext.Provider value={settings}>{children}</LevelKycContext.Provider>;
}

export function useLevelKyc(): LevelKycSettings | null {
  return useContext(LevelKycContext);
}
