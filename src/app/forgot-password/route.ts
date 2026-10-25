import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Route lama dipertahankan agar tautan/bookmark lama tetap sampai ke halaman baru.
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/lupa-password", request.url), 307);
}
