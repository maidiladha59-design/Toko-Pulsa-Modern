import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const INACTIVITY_DAYS = 7;
const INACTIVITY_MS = INACTIVITY_DAYS * 24 * 60 * 60 * 1000;

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: { [key: string]: unknown };
          }>
        ) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(
              name,
              value,
              options as Parameters<typeof response.cookies.set>[2]
            );
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isApiRoute = pathname.startsWith("/api/");
  const isNextAsset =
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.match(/\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff|woff2|ttf)$/i);

  // Mode pemeliharaan: dicek lebih dulu dari semua redirect lain, supaya
  // pengunjung biasa langsung diarahkan ke /maintenance saat status aktif.
  // Rute admin, API, aset, dan halaman /maintenance sendiri selalu dikecualikan
  // agar admin tetap bisa masuk untuk mematikannya kembali.
  const maintenanceBypassPaths = ["/maintenance", "/admin", "/login", "/register", "/daftar", "/auth"];
  const isMaintenanceBypassPath = maintenanceBypassPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (!isApiRoute && !isNextAsset && !isMaintenanceBypassPath) {
    const { data: maintenance } = await supabase
      .from("maintenance_settings")
      .select("enabled,starts_at,ends_at,allow_admin_bypass")
      .eq("id", 1)
      .maybeSingle();

    if (maintenance?.enabled) {
      const now = Date.now();
      const startsOk = !maintenance.starts_at || new Date(maintenance.starts_at).getTime() <= now;
      const endsOk = !maintenance.ends_at || new Date(maintenance.ends_at).getTime() >= now;

      if (startsOk && endsOk) {
        let bypass = false;
        if (user && maintenance.allow_admin_bypass) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();
          bypass = Boolean(profile && ["ADMIN", "SUPER_ADMIN"].includes(String(profile.role)));
        }

        if (!bypass) {
          const url = request.nextUrl.clone();
          url.pathname = "/maintenance";
          url.search = "";
          return NextResponse.redirect(url);
        }
      }
    }
  }

  const publicPaths = [
    "/welcome",
    "/login",
    "/register",
    "/daftar",
    "/auth",
    "/auth/callback",
    "/verify-email",
  ];

  const isPublicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  const onboardingSeen = Boolean(
    request.cookies.get("aidil_onboarding_seen")?.value
  );

  // First-time visitors must see the welcome/onboarding screen before Login/Register.
  // The welcome screen sets a long-lived cookie when the visitor continues or skips.
  if (
    !user &&
    !onboardingSeen &&
    !isApiRoute &&
    !isNextAsset &&
    (pathname === "/" || pathname === "/login" || pathname === "/register" || pathname === "/daftar")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/welcome";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // An already authenticated user should not be asked to log in/register again.
  if (
    user &&
    !isApiRoute &&
    !isNextAsset &&
    (pathname === "/login" || pathname === "/register" || pathname === "/daftar" || pathname === "/welcome")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!user && !isPublicPath && !isApiRoute && !isNextAsset) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated users stay logged in until they have been inactive for 7 days.
  // last_activity_at is server-side, so the client cannot extend the session by
  // editing localStorage/cookies.
  if (user && !isApiRoute && !isNextAsset) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("last_activity_at")
      .eq("id", user.id)
      .maybeSingle();

    const profileActivity = profile?.last_activity_at
      ? new Date(profile.last_activity_at).getTime()
      : 0;
    const lastSignIn = user.last_sign_in_at
      ? new Date(user.last_sign_in_at).getTime()
      : 0;
    const lastActivity = profileActivity || lastSignIn;

    if (lastActivity && Date.now() - lastActivity >= INACTIVITY_MS) {
      await supabase.auth.signOut();
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("next", pathname);
      loginUrl.searchParams.set("reason", "inactive");
      return NextResponse.redirect(loginUrl);
    }

    await supabase
      .from("profiles")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};