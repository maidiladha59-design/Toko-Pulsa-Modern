import { createAdminClient } from '@/lib/supabase/admin';
import { sendWebPush } from '@/lib/push';
import { getAdminSetting } from '@/lib/settings';
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  NOTIFICATION_TEMPLATES_SETTINGS_KEY,
  canonicalNotificationVariables,
  renderNotificationTemplate,
  templateForEvent,
} from '@/lib/notification-templates';

export type NotificationEventKey =
  | 'TOPUP_SUCCESS' | 'TOPUP_EXPIRING' | 'TOPUP_EXPIRED' | 'TOPUP_FAILED'
  | 'TRANSACTION_SUCCESS' | 'TRANSACTION_PROCESSING' | 'TRANSACTION_FAILED' | 'TRANSACTION_REFUND'
  | 'TRANSFER_SENT' | 'TRANSFER_RECEIVED'
  | 'SPLITBILL_INVITED' | 'SPLITBILL_REMINDER' | 'SPLITBILL_COMPLETED'
  | 'KYC_SUBMITTED' | 'KYC_APPROVED' | 'KYC_REJECTED'
  | 'SECURITY_LOGIN' | 'PROMOTION' | 'ANNOUNCEMENT'
  | 'RANKING_POSITION' | 'RANKING_UP_ONE' | 'RANKING_CHANGED';

export type NotificationPayload = {
  userId: string;
  eventKey: NotificationEventKey;
  variables?: Record<string, string | number | null | undefined>;
  referenceType?: string;
  referenceId?: string;
  url?: string;
};

function render(template: string, vars: Record<string, unknown>) {
  return String(template || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => String(vars[key] ?? ''));
}

function category(eventKey: NotificationEventKey) {
  if (eventKey.startsWith('TOPUP_')) return 'topup';
  if (eventKey.startsWith('TRANSACTION_') || eventKey.startsWith('RANKING_') || eventKey.startsWith('TRANSFER_') || eventKey.startsWith('SPLITBILL_')) return 'transactions';
  if (eventKey.startsWith('KYC_')) return 'kyc';
  if (eventKey === 'SECURITY_LOGIN') return 'security';
  if (eventKey === 'PROMOTION') return 'promotions';
  return 'announcements';
}

function todayLabel() {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date());
}

/** Variabel tambahan yang tidak dikirim pemanggil (nama, saldo, tanggal). */
async function completeCanonicalVariables(
  userId: string,
  canonical: Record<string, string>,
  text: string
): Promise<Record<string, string>> {
  const needsName = !canonical.nama && /\{\s*nama\s*\}/.test(text);
  const needsBalance = !canonical.saldo && /\{\s*saldo\s*\}/.test(text);
  if (!needsName && !needsBalance) return canonical;

  const admin = createAdminClient();
  let name = canonical.nama;
  let saldo = canonical.saldo;

  if (needsName) {
    const { data: profile } = await admin.from('profiles').select('full_name,email').eq('id', userId).maybeSingle();
    name =
      String(profile?.full_name || '').trim() ||
      String(profile?.email || '').split('@')[0] ||
      'Pengguna';
  }

  if (needsBalance) {
    const { data: wallet } = await admin.from('wallets').select('balance').eq('user_id', userId).maybeSingle();
    if (wallet?.balance != null) {
      saldo = `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(wallet.balance))}`;
    }
  }

  return {
    ...canonical,
    nama: name,
    saldo,
    tanggal: canonical.tanggal || todayLabel(),
  };
}

export async function notifyUser(input: NotificationPayload) {
  const admin = createAdminClient();
  const vars = input.variables || {};

  // Teks dari pengaturan (v107) diprioritaskan untuk peristiwa yang dikelola.
  // Bila tidak ada, teks lama di tabel notification_templates tetap dipakai.
  const settings = await getAdminSetting(NOTIFICATION_TEMPLATES_SETTINGS_KEY, DEFAULT_NOTIFICATION_TEMPLATES);
  const settingsTemplate = templateForEvent(settings, input.eventKey);

  const { data: dbTemplate } = await admin
    .from('notification_templates')
    .select('*')
    .eq('event_key', input.eventKey)
    .maybeSingle();

  if (!settingsTemplate && (!dbTemplate || !dbTemplate.enabled)) {
    return { skipped: true, reason: 'template_disabled' };
  }
  if (settingsTemplate && !settingsTemplate.enabled) {
    return { skipped: true, reason: 'template_disabled' };
  }

  const { data: pref } = await admin.from('notification_preferences').select('*').eq('user_id', input.userId).maybeSingle();
  const cat = category(input.eventKey);
  if (pref && pref[cat] === false) return { skipped: true, reason: 'user_disabled' };

  let title: string;
  let subtitle: string;
  let message: string;
  let inAppEnabled: boolean;
  let pushEnabled: boolean;
  let icon: string;

  if (settingsTemplate) {
    const canonical = await completeCanonicalVariables(
      input.userId,
      canonicalNotificationVariables(vars),
      `${settingsTemplate.title} ${settingsTemplate.message}`
    );
    title = renderNotificationTemplate(settingsTemplate.title, canonical);
    message = renderNotificationTemplate(settingsTemplate.message, canonical);
    subtitle = dbTemplate ? render(dbTemplate.subtitle, vars) : '';
    inAppEnabled = settingsTemplate.inApp;
    pushEnabled = settingsTemplate.push;
    icon = dbTemplate?.icon ?? 'bell';
  } else {
    title = render(dbTemplate.title, vars);
    subtitle = render(dbTemplate.subtitle, vars);
    message = render(dbTemplate.message, vars);
    inAppEnabled = Boolean(dbTemplate.in_app_enabled);
    pushEnabled = Boolean(dbTemplate.push_enabled);
    icon = dbTemplate.icon ?? 'bell';
  }

  let inApp = false;
  let pushSent = 0;

  if (inAppEnabled) {
    const { error } = await admin.from('notifications').insert({
      user_id: input.userId, type: 'INFO', title, subtitle, message,
      icon,
      reference_type: input.referenceType || 'notification_event',
      reference_id: input.referenceId || null, is_read: false,
    });
    if (!error) inApp = true;
  }

  if (pushEnabled) {
    const { data: subs } = await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', input.userId);
    for (const sub of subs || []) {
      try {
        await sendWebPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, {
          title, subtitle, message, url: input.url || '/', tag: `${input.eventKey}-${input.referenceId || Date.now()}`,
        });
        pushSent++;
      } catch (e: any) {
        if ([404, 410].includes(Number(e?.statusCode || 0))) await admin.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  }
  return { inApp, pushSent };
}
