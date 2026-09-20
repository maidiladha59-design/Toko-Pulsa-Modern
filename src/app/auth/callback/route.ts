import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Menangani callback verifikasi email.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawRedirectTo = searchParams.get("redirectTo");
  // Hanya izinkan redirect internal setelah verifikasi email.
  const redirectTo =
    rawRedirectTo && rawRedirectTo.startsWith("/") && !rawRedirectTo.startsWith("//")
      ? rawRedirectTo
      : "/verify-account";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination = new URL(redirectTo, origin);
      return NextResponse.redirect(destination);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
