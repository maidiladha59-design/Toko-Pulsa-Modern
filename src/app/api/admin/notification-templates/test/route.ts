import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSetting, recordSettingAudit } from "@/lib/settings";
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  NOTIFICATION_TEMPLATE_DEFINITIONS,
  NOTIFICATION_TEMPLATES_SETTINGS_KEY,
  NOTIFICATION_VARIABLE_KEYS,
  renderNotificationTemplate,
  sampleTemplateVariables,
  unknownTemplateVariables,
  type NotificationTemplateKey,
} from "@/lib/notification-templates";

// Kirim uji template notifikasi ke akun admin yang sedang login.
// Hanya membuat baris di tabel notifications milik sendiri; tidak menyentuh
// saldo, pesanan, atau data pengguna lain.

const KEYS = NOTIFICATION_TEMPLATE_DEFINITIONS.map((item) => item.key) as [NotificationTemplateKey, ...NotificationTemplateKey[]];

const schema = z.object({
  template_key: z.enum(KEYS),
  template: z
    .object({
      title: z.string().trim().max(120).optional(),
      message: z.string().trim().max(1000).optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Silakan login kembali." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(String(profile.role))) {
    return NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 });
  }
  const { data: allowed, error: permissionError } = await supabase.rpc("can_admin_permission", {
    p_actor: user.id,
    p_permission: "platform.manage",
  });
  if (permissionError) return NextResponse.json({ message: "Gagal memeriksa izin admin." }, { status: 500 });
  if (allowed !== true) return NextResponse.json({ message: "Anda tidak memiliki izin mengelola template." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Template uji tidak valid." }, { status: 400 });
  const { template_key } = parsed.data;

  const settings = await getAdminSetting(NOTIFICATION_TEMPLATES_SETTINGS_KEY, DEFAULT_NOTIFICATION_TEMPLATES);
  const stored = settings.templates.find((item) => item.key === template_key);
  const title = parsed.data.template?.title ?? stored?.title ?? "";
  const message = parsed.data.template?.message ?? stored?.message ?? "";

  if (!title.trim() || !message.trim()) {
    return NextResponse.json({ message: "Judul dan isi template wajib diisi sebelum dikirim." }, { status: 400 });
  }
  const unknown = unknownTemplateVariables(`${title} ${message}`);
  if (unknown.length) {
    return NextResponse.json(
      { message: `Variabel tidak dikenal: ${unknown.map((key) => `{${key}}`).join(", ")}. Gunakan chip variabel yang tersedia.` },
      { status: 400 }
    );
  }

  const variables = { ...sampleTemplateVariables() };
  const renderedTitle = `[Uji] ${renderNotificationTemplate(title, variables)}`;
  const renderedMessage = renderNotificationTemplate(message, variables);

  const { error } = await createAdminClient().from("notifications").insert({
    user_id: user.id,
    type: "INFO",
    title: renderedTitle,
    subtitle: "Pratinjau template",
    message: renderedMessage,
    icon: "bell",
    reference_type: "notification_test",
    reference_id: template_key,
    is_read: false,
  });
  if (error) {
    console.error("NOTIFICATION TEST SEND ERROR:", error);
    return NextResponse.json({ message: "Gagal mengirim notifikasi uji." }, { status: 500 });
  }

  await recordSettingAudit(user.id, "settings.notification_template_test", template_key, {
    variables: NOTIFICATION_VARIABLE_KEYS,
  });

  return NextResponse.json({ message: "Notifikasi uji dikirim ke akun Anda.", title: renderedTitle, body: renderedMessage });
}
