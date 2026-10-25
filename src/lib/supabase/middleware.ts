import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const INACTIVITY_DAYS = 7;
const INACTIVITY_MS = INACTIVITY_DAYS * 24 * 60 * 60 * 1000;
// Navigasi tidak perlu menulis last_activity_at di setiap request.
const ACTIVITY_WRITE_INTERVAL_MS = 15 * 60 * 1000;
// maintenance_settings bersifat global (bukan data user), aman di-cache singkat.
const MAINTENANCE_CACHE_TTL_MS = 30 * 1000;

type MaintenanceSettings = {
  enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
  allow_admin_bypass: boolean;
};

let maintenanceCache: {
  value: MaintenanceSettings | null;
  expiresAt: number;
} | null = null;

// getSession() hanya membaca cookie lokal. Payload JWT dipakai untuk mengambil
// sub tanpa menyentuh user object (yang memicu peringatan "insecure" di server).
// Otorisasi sebenarnya tetap divalidasi ulang oleh halaman/layout via getUser().
function readSessionUserId(accessToken: string | undefined): string | null {
  if (!accessToken) return null;
  try {
    const segment = accessToken.split(".")[1] || "";
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "="
    );
    const payload = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

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

  // Validasi penuh (jaringan) hanya dilakukan di halaman/layout yang memang
  // membutuhkan data user. Middleware cukup membaca sesi dari cookie; refresh
  // token otomatis hanya terjadi saat access token mendekati kedaluwarsa.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = readSessionUserId(session?.access_token);
  let authenticated = Boolean(session && userId);

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
  const maintenanceBypassPaths = [
    "/maintenance",
    "/admin",
    "/login",
    "/register",
    "/daftar",
    "/auth",
    "/akun-diblokir",
  ];
  const isMaintenanceBypassPath = maintenanceBypassPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (!isApiRoute && !isNextAsset && !isMaintenanceBypassPath) {
    const now = Date.now();
    if (!maintenanceCache || maintenanceCache.expiresAt <= now) {
      const { data, error } = await supabase
        .from("maintenance_settings")
        .select("enabled,starts_at,ends_at,allow_admin_bypass")
        .eq("id", 1)
        .maybeSingle();
      // Hanya hasil sukses yang di-cache; error dibiarkan dicek ulang.
      if (!error) {
        maintenanceCache = {
          value: (data as MaintenanceSettings | null) ?? null,
          expiresAt: now + MAINTENANCE_CACHE_TTL_MS,
        };
      }
    }
    const maintenance = maintenanceCache?.value;

    if (maintenance?.enabled) {
      const startsOk = !maintenance.starts_at || new Date(maintenance.starts_at).getTime() <= now;
      const endsOk = !maintenance.ends_at || new Date(maintenance.ends_at).getTime() >= now;

      if (startsOk && endsOk) {
        let bypass = false;
        if (userId && maintenance.allow_admin_bypass) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", userId)
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
    "/akun-diblokir",
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
    !authenticated &&
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
  // Di halaman auth, sesi lokal dikonfirmasi ke Auth server dulu agar token yang
  // sudah dicabut tidak memicu loop redirect dengan halaman yang memanggil getUser().
  if (
    authenticated &&
    !isApiRoute &&
    !isNextAsset &&
    (pathname === "/login" || pathname === "/register" || pathname === "/daftar" || pathname === "/welcome")
  ) {
    const {
      data: { user: verifiedUser },
    } = await supabase.auth.getUser();

    if (verifiedUser) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
    authenticated = false;
  }

  if (!authenticated && !isPublicPath && !isApiRoute && !isNextAsset) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated users stay logged in until they have been inactive for 7 days.
  // last_activity_at is server-side, so the client cannot extend the session by
  // editing localStorage/cookies.
  if (authenticated && userId && !isApiRoute && !isNextAsset) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("last_activity_at, account_status")
      .eq("id", userId)
      .maybeSingle();

    // Akun diblokir tidak boleh mengakses halaman apa pun kecuali halaman
    // pemberitahuan blokir (yang juga berisi kontak CS).
    if (profile?.account_status === "BLOCKED" && pathname !== "/akun-diblokir") {
      const blockedUrl = request.nextUrl.clone();
      blockedUrl.pathname = "/akun-diblokir";
      blockedUrl.search = "";
      return NextResponse.redirect(blockedUrl);
    }

    const profileActivity = profile?.last_activity_at
      ? new Date(profile.last_activity_at).getTime()
      : 0;
    const lastSignIn = profileActivity
      ? 0
      : session?.user?.last_sign_in_at
        ? new Date(session.user.last_sign_in_at).getTime()
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

    if (!profileActivity || Date.now() - profileActivity >= ACTIVITY_WRITE_INTERVAL_MS) {
      await supabase
        .from("profiles")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", userId);
    }
  }

  return response;
}

export const config = {
  // Middleware tidak perlu dijalankan untuk API (setiap route punya guard
  // sendiri), callback auth, maupun aset statis. Halaman aplikasi tetap
  // tercakup agar aturan redirect/onboarding/blokir tidak berubah.
  matcher: [
    "/((?!api/|auth/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|txt|xml|woff|woff2|ttf|otf)$).*)",
  ],
};
