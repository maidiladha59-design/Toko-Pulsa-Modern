import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MANUAL_PROOF_BUCKET,
  MANUAL_PROOF_EXTENSIONS,
  MANUAL_PROOF_MAX_BYTES,
  MANUAL_PROOF_MIME_TYPES,
  MANUAL_TOPUP_ERRORS,
} from "@/lib/manual-topup";

export const runtime = "nodejs";

const bodySchema = z.object({
  channel_id: z.string().uuid(),
  amount: z.number().int().positive().max(1_000_000_000_000),
});

function errorCode(message: string) {
  const firstLine = String(message || "").split("\n")[0].trim();
  return MANUAL_TOPUP_ERRORS[firstLine] ? firstLine : "";
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_status")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.account_status === "BLOCKED") {
    return NextResponse.json(
      { message: "Akun Anda sedang diblokir sehingga tidak dapat melakukan Top Up Manual.", code: "ACCOUNT_BLOCKED" },
      { status: 403 }
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ message: "Data permintaan tidak valid." }, { status: 400 });

  const parsed = bodySchema.safeParse({
    channel_id: String(form.get("channel_id") || ""),
    amount: Number(form.get("amount")),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Pilih channel dan isi nominal Top Up yang valid." },
      { status: 400 }
    );
  }

  const proof = form.get("proof");
  if (!(proof instanceof File)) {
    return NextResponse.json({ message: "Bukti transfer wajib diunggah." }, { status: 400 });
  }
  if (!(MANUAL_PROOF_MIME_TYPES as readonly string[]).includes(proof.type)) {
    return NextResponse.json(
      { message: "Format bukti transfer harus JPG, PNG, atau WEBP." },
      { status: 400 }
    );
  }
  if (proof.size <= 0 || proof.size > MANUAL_PROOF_MAX_BYTES) {
    return NextResponse.json(
      { message: "Ukuran bukti transfer maksimal 5MB. Kompres file lalu coba lagi." },
      { status: 400 }
    );
  }

  const extension = MANUAL_PROOF_EXTENSIONS[proof.type];
  const proofPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const admin = createAdminClient();

  const upload = await admin.storage
    .from(MANUAL_PROOF_BUCKET)
    .upload(proofPath, proof, { contentType: proof.type, upsert: false });
  if (upload.error) {
    console.error("[manual-topup] upload bukti gagal", JSON.stringify({
      bucket: MANUAL_PROOF_BUCKET,
      code: upload.error.message?.includes("Bucket not found") ? "BUCKET_NOT_FOUND" : "UPLOAD_FAILED",
    }));
    return NextResponse.json(
      { message: "Gagal mengunggah bukti transfer. Coba lagi beberapa saat lagi." },
      { status: 503 }
    );
  }

  // RPC dijalankan dengan sesi user agar auth.uid() di database tetap valid.
  const { data, error } = await supabase.rpc("submit_manual_topup_request", {
    p_user_id: user.id,
    p_channel_id: parsed.data.channel_id,
    p_amount: parsed.data.amount,
    p_proof_image_url: proofPath,
  });

  if (error) {
    await admin.storage.from(MANUAL_PROOF_BUCKET).remove([proofPath]);
    const code = errorCode(error.message);
    console.error("[manual-topup] submit gagal", JSON.stringify({ code: code || "UNKNOWN" }));
    return NextResponse.json(
      {
        message: code
          ? MANUAL_TOPUP_ERRORS[code]
          : "Permintaan Top Up Manual gagal dikirim. Silakan coba lagi.",
        code: code || "SUBMIT_FAILED",
      },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { ok: true, id: data, status: "PENDING", message: "Permintaan Top Up Manual berhasil dikirim." },
    { status: 201 }
  );
}
