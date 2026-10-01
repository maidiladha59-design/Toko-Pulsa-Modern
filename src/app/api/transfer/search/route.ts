import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { transferSearchSchema } from "@/lib/transfer/schemas";
import { maskEmail, maskName, maskPhone, phoneVariants } from "@/lib/transfer/utils";

// Pencarian penerima transfer tanpa QR: exact-match email atau nomor HP.
// Hasil SELALU ter-mask (nama, email, telepon) — tidak pernah mengembalikan
// email/telepon mentah. Rate limit ketat untuk mencegah enumerasi akun.
export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = transferSearchSchema.safeParse({ q: url.searchParams.get("q") || "" });
  if (!parsed.success) {
    return NextResponse.json({ message: "Masukkan email atau nomor HP penerima (minimal 3 karakter)." }, { status: 400 });
  }
  const q = parsed.data.q;

  const rateKeyHash = crypto.createHash("sha256").update(`transfer_search:${user.id}`).digest("hex");
  const rate = await consumeRateLimit(rateKeyHash, 20, 15 * 60);
  if (!rate.allowed) {
    return NextResponse.json({ message: `Terlalu banyak pencarian. Coba lagi dalam ${rate.retryAfter} detik.` }, { status: 429 });
  }

  const admin = createAdminClient();
  let found: { id: string; full_name: string | null; email: string | null; phone?: string | null } | null = null;

  if (q.includes("@")) {
    // Exact match email (case-insensitive, wildcard di-escape).
    const pattern = q.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, email, phone")
      .ilike("email", pattern)
      .neq("id", user.id)
      .limit(1);
    found = data?.[0] || null;
  } else {
    const variants = phoneVariants(q);
    if (variants.length > 0) {
      const { data } = await admin
        .from("profiles")
        .select("id, full_name, email, phone")
        .in("phone", variants)
        .neq("id", user.id)
        .limit(1);
      found = data?.[0] || null;
    }
  }

  if (!found) {
    return NextResponse.json({ message: "Penerima tidak ditemukan. Periksa kembali email atau nomor HP." }, { status: 404 });
  }

  const displayName = found.full_name?.trim() || found.email?.split("@")[0] || "Pengguna AIDIL STORE";

  return NextResponse.json({
    recipient: {
      recipient_id: found.id,
      display_name_masked: maskName(displayName),
      email_masked: maskEmail(found.email),
      phone_masked: found.phone ? maskPhone(found.phone) : null,
    },
  });
}
