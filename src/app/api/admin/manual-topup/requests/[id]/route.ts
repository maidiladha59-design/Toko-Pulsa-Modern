import { NextResponse } from "next/server";
import { z } from "zod";
import { requireManualTopupAdmin } from "@/lib/manual-topup-admin";
import { MANUAL_TOPUP_ERRORS } from "@/lib/manual-topup";

const bodySchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(500, "Catatan terlalu panjang (maksimal 500 karakter).").optional(),
});

function errorCode(message: string) {
  const raw = String(message || "");
  return Object.keys(MANUAL_TOPUP_ERRORS).find((code) => raw.includes(code)) || "";
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireManualTopupAdmin();
  if (auth.error) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Data proses tidak valid." },
      { status: 400 }
    );
  }

  const note = (parsed.data.note || "").trim();
  if (parsed.data.action === "REJECT" && note.length < 5) {
    return NextResponse.json(
      { message: "Alasan penolakan wajib diisi minimal 5 karakter." },
      { status: 400 }
    );
  }

  // Sesi admin dipakai (bukan service role) agar auth.uid() di RPC tetap berisi
  // admin yang memproses dan role diperiksa ulang di database.
  const { data, error } = await auth.supabase.rpc("admin_process_manual_topup", {
    p_admin_id: auth.user.id,
    p_request_id: params.id,
    p_action: parsed.data.action,
    p_note: note || null,
  });

  if (error) {
    const code = errorCode(error.message);
    console.error("[manual-topup-admin] proses gagal", JSON.stringify({ code: code || "UNKNOWN" }));
    const status = code === "REQUEST_NOT_FOUND"
      ? 404
      : code === "REQUEST_ALREADY_PROCESSED"
        ? 409
        : code === "ADMIN_ONLY"
          ? 403
          : 400;
    return NextResponse.json(
      {
        message: code
          ? MANUAL_TOPUP_ERRORS[code]
          : "Gagal memproses permintaan. Silakan coba lagi.",
        code: code || "PROCESS_FAILED",
      },
      { status }
    );
  }

  return NextResponse.json({ ok: true, result: data });
}
