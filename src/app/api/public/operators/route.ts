import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import {
  DEFAULT_OPERATOR_SETTINGS,
  OPERATOR_SETTINGS_KEY,
  type OperatorSettings,
} from "@/lib/operator-settings";

// Peta operator publik untuk validasi nomor di checkout.
// Hanya id, nama, prefix, dan logo; data admin lain tidak diekspos.

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSetting<OperatorSettings>(OPERATOR_SETTINGS_KEY, DEFAULT_OPERATOR_SETTINGS);
  const operators = settings.operators
    .filter((operator) => operator.active)
    .map((operator) => ({
      id: operator.id,
      name: operator.name,
      prefixes: operator.prefixes,
      logoUrl: operator.logoUrl,
    }));
  return NextResponse.json(
    { operators },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  );
}
