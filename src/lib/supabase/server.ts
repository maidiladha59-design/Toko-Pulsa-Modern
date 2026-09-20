import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client Supabase untuk Server Components / Route Handlers.
// Menggunakan cookies() Next.js agar session ikut ter-refresh.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: any;
          }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Diabaikan jika dipanggil dari Server Component tanpa izin set cookie
            // (middleware yang akan menangani refresh session).
          }
        },
      },
    }
  );
}
