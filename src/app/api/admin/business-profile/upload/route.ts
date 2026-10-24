import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_SIZE = 5 * 1024 * 1024;
const LOGO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const LEGAL_TYPES = [...LOGO_TYPES, "application/pdf"];

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ message: "Silakan login kembali." }, { status: 401 }) };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(String(profile.role))) {
    return { error: NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 }) };
  }
  return { user };
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const form = await request.formData().catch(() => null);
  const kind = String(form?.get("kind") || "");
  if (kind !== "logo" && kind !== "legal") {
    return NextResponse.json({ message: "Jenis unggahan tidak valid." }, { status: 400 });
  }

  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ message: "File tidak ditemukan." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { message: "Ukuran file maksimal 5MB. Kompres file lalu coba lagi." },
      { status: 400 }
    );
  }

  const allowed = kind === "logo" ? LOGO_TYPES : LEGAL_TYPES;
  if (!allowed.includes(file.type)) {
    return NextResponse.json(
      {
        message:
          kind === "logo"
            ? "Logo harus berupa JPG, PNG, WEBP, atau SVG."
            : "Dokumen legal harus berupa JPG, PNG, WEBP, SVG, atau PDF.",
      },
      { status: 400 }
    );
  }

  const extFromName = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ext = (extFromName.length > 0 && extFromName.length <= 5 ? extFromName : EXT_BY_TYPE[file.type] || "bin");
  const path = `${kind}/${crypto.randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const { error } = await admin.storage.from("business-assets").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    return NextResponse.json(
      { message: "Gagal mengunggah file. Pastikan bucket business-assets sudah dibuat (migrasi v89)." },
      { status: 400 }
    );
  }

  const { data } = admin.storage.from("business-assets").getPublicUrl(path);
  return NextResponse.json({
    url: data.publicUrl,
    path,
    type: file.type,
    name: file.name,
  });
}
