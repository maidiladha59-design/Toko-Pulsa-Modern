import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  getManagedSetting,
  parseSettingValue,
  type ManagedSettingDefinition,
} from "@/lib/managed-settings";
import {
  SettingConflictError,
  SettingHistoryNotFoundError,
  SettingNotFoundError,
  discardSettingDraft,
  loadSettingState,
  publishSetting,
  recordSettingAudit,
  restoreSettingVersion,
  revalidateSetting,
  saveSettingDraft,
} from "@/lib/settings";

// API "Pengaturan Terkelola" (migrasi v105).
//  - Autentikasi, role, dan permission diperiksa di server untuk setiap
//    permintaan; UI hanya menyembunyikan tombol.
//  - Tidak pernah menyentuh wallet, order, webhook, PIN, atau pembayaran.
//  - Nilai selalu divalidasi skema registry sebelum ditulis; teks disimpan
//    sebagai teks biasa dan URL dibatasi path internal atau https.

export const dynamic = "force-dynamic";

type RouteContext = { params: { key: string } };

type AccessResult =
  | { error: NextResponse }
  | { user: { id: string }; def: ManagedSettingDefinition<any> };

async function requireAccess(key: string): Promise<AccessResult> {
  const def = getManagedSetting(key);
  if (!def) {
    return { error: NextResponse.json({ message: "Pengaturan tidak dikenal." }, { status: 404 }) };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ message: "Silakan login kembali." }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(String(profile.role))) {
    return { error: NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 }) };
  }

  // Permission dibaca lewat RPC server agar tabel permission tidak terekspos.
  const { data: allowed, error: permissionError } = await supabase.rpc("can_admin_permission", {
    p_actor: user.id,
    p_permission: def.permission,
  });
  if (permissionError) {
    return { error: NextResponse.json({ message: "Gagal memeriksa izin admin." }, { status: 500 }) };
  }
  if (allowed !== true) {
    return {
      error: NextResponse.json(
        { message: `Anda tidak memiliki izin ${def.permission} untuk mengelola pengaturan ini.` },
        { status: 403 }
      ),
    };
  }

  return { user: { id: user.id }, def };
}

function failure(error: unknown, key: string): NextResponse {
  if (error instanceof SettingConflictError) {
    return NextResponse.json(
      {
        code: "VERSION_CONFLICT",
        message:
          "Pengaturan sudah diubah admin lain. Muat ulang halaman, gabungkan perubahan Anda, lalu simpan kembali.",
      },
      { status: 409 }
    );
  }
  if (error instanceof SettingHistoryNotFoundError) {
    return NextResponse.json({ message: "Versi riwayat tersebut tidak ditemukan." }, { status: 404 });
  }
  if (error instanceof SettingNotFoundError) {
    return NextResponse.json({ message: "Pengaturan tidak ditemukan." }, { status: 404 });
  }
  console.error(`[settings] ${key}: gagal memproses pengaturan.`, error);
  return NextResponse.json({ message: "Gagal memproses pengaturan. Coba lagi." }, { status: 500 });
}

/**
 * Cocokkan nilai kiriman dengan nilai tersimpan. Hanya kunci yang dikirim yang
 * dibandingkan: server boleh menambahkan default untuk kunci yang tidak ikut
 * dikirim (mis. field opsional), tetapi nilai yang dikirim wajib tersimpan apa adanya.
 */
function storedMatchesSent(sent: unknown, stored: unknown): boolean {
  if (sent === stored) return true;
  if (Array.isArray(sent) || Array.isArray(stored)) {
    if (!Array.isArray(sent) || !Array.isArray(stored) || sent.length !== stored.length) return false;
    return sent.every((item, index) => storedMatchesSent(item, stored[index]));
  }
  if (sent && stored && typeof sent === "object" && typeof stored === "object") {
    const sentRecord = sent as Record<string, unknown>;
    const storedRecord = stored as Record<string, unknown>;
    return Object.keys(sentRecord).every((key) =>
      storedMatchesSent(sentRecord[key], storedRecord[key])
    );
  }
  return false;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const access = await requireAccess(params.key);
  if ("error" in access) return access.error;

  try {
    const state = await loadSettingState(params.key);
    return NextResponse.json({ state, defaults: access.def.defaults });
  } catch (error) {
    return failure(error, params.key);
  }
}

const bodySchema = z
  .object({
    action: z.enum(["save_draft", "publish", "discard_draft", "restore", "reset_default"]),
    baseVersion: z.number().int().min(0),
    value: z.unknown().optional(),
    historyId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional(),
  })
  .strict();

const AUDIT_ACTIONS: Record<z.infer<typeof bodySchema>["action"], string> = {
  save_draft: "settings.draft_save",
  publish: "settings.publish",
  discard_draft: "settings.draft_discard",
  restore: "settings.restore",
  reset_default: "settings.reset_default",
};

export async function PUT(request: Request, { params }: RouteContext) {
  const access = await requireAccess(params.key);
  if ("error" in access) return access.error;

  const raw = await request.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(raw);
  if (!parsedBody.success) {
    return NextResponse.json({ message: "Permintaan pengaturan tidak dikenali." }, { status: 400 });
  }
  const { action, baseVersion } = parsedBody.data;

  if (action === "restore") {
    if (parsedBody.data.historyId === undefined) {
      return NextResponse.json({ message: "Versi riwayat wajib dipilih." }, { status: 400 });
    }
    const historyId = Number(parsedBody.data.historyId);
    try {
      const state = await restoreSettingVersion(params.key, historyId, baseVersion, access.user.id);
      await recordSettingAudit(access.user.id, AUDIT_ACTIONS[action], params.key, {
        action,
        base_version: baseVersion,
        history_id: historyId,
        version: state.version,
        has_draft: state.hasDraft,
      });
      return NextResponse.json({ state });
    } catch (error) {
      return failure(error, params.key);
    }
  }

  // Nilai efektif: kiriman form, atau default untuk "Kembalikan Default".
  const input = action === "reset_default" ? access.def.defaults : parsedBody.data.value;
  if (action !== "discard_draft" && input === undefined) {
    return NextResponse.json({ message: "Nilai pengaturan wajib diisi." }, { status: 400 });
  }

  let value: Record<string, unknown> | null = null;
  if (action !== "discard_draft") {
    const parsed = parseSettingValue(params.key, input);
    if (!parsed.ok) {
      console.error(`[settings] ${params.key}: ${action} ditolak. ${parsed.message}`);
      return NextResponse.json({ message: parsed.message }, { status: 400 });
    }
    value = parsed.value;
    if (action === "publish" && access.def.validatePublish) {
      const publishError = access.def.validatePublish(parsed.value);
      if (publishError) {
        console.error(`[settings] ${params.key}: publish ditolak. ${publishError}`);
        return NextResponse.json({ message: publishError }, { status: 400 });
      }
    }
  }

  try {
    let state;
    if (action === "save_draft" || action === "reset_default") {
      state = await saveSettingDraft(params.key, value!, baseVersion, access.user.id);
    } else if (action === "publish") {
      state = await publishSetting(params.key, value!, baseVersion, access.user.id);
    } else {
      state = await discardSettingDraft(params.key, baseVersion, access.user.id);
    }

    // Draf dan pemulihan belum mengubah tampilan publik; hanya Terbitkan yang
    // perlu menginvalidasi tag "settings:<key>" dan tag tambahan kunci terkait,
    // sekaligus menyegarkan shell layout toko agar navigasi tidak memakai RSC lama.
    const tags = action === "publish" ? revalidateSetting(params.key) : [];
    if (action === "publish") revalidatePath("/", "layout");

    // Pastikan yang benar-benar tersimpan sama dengan yang dikirim. Tanpa ini,
    // nilai yang berubah/tertolak di server tampil seperti "berhasil" lalu
    // kembali ke default saat halaman dimuat ulang.
    const storedOk = action !== "publish" || storedMatchesSent(value, state.published);
    if (!storedOk) {
      console.error(
        `[settings] ${params.key}: nilai terbit tidak sama dengan kiriman.`,
        { sent_variant: (value as { variant?: unknown })?.variant ?? null }
      );
    }

    await recordSettingAudit(access.user.id, AUDIT_ACTIONS[action], params.key, {
      action,
      base_version: baseVersion,
      version: state.version,
      has_draft: state.hasDraft,
      stored_matches_sent: storedOk,
      ...(tags.length ? { revalidated_tags: tags } : {}),
    });

    if (!storedOk) {
      return NextResponse.json(
        {
          code: "VALUE_MISMATCH",
          message:
            "Nilai yang tersimpan berbeda dari pilihan Anda. Muat ulang halaman dan periksa Riwayat Versi sebelum menerbitkan lagi.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ state, ...(tags.length ? { revalidated_tags: tags } : {}) });
  } catch (error) {
    return failure(error, params.key);
  }
}
