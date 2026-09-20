import { createAdminClient } from '@/lib/supabase/admin';
import { sendWebPush } from '@/lib/push';

export type NotificationEventKey =
  | 'TOPUP_SUCCESS' | 'TOPUP_EXPIRING' | 'TOPUP_EXPIRED' | 'TOPUP_FAILED'
  | 'TRANSACTION_SUCCESS' | 'TRANSACTION_FAILED'
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
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => String(vars[key] ?? ''));
}

function category(eventKey: NotificationEventKey) {
  if (eventKey.startsWith('TOPUP_')) return 'topup';
  if (eventKey.startsWith('TRANSACTION_') || eventKey.startsWith('RANKING_')) return 'transactions';
  if (eventKey.startsWith('KYC_')) return 'kyc';
  if (eventKey === 'SECURITY_LOGIN') return 'security';
  if (eventKey === 'PROMOTION') return 'promotions';
  return 'announcements';
}

export async function notifyUser(input: NotificationPayload) {
  const admin = createAdminClient();
  const { data: template, error: templateError } = await admin
    .from('notification_templates').select('*').eq('event_key', input.eventKey).single();
  if (templateError || !template || !template.enabled) return { skipped: true, reason: 'template_disabled' };

  const { data: pref } = await admin.from('notification_preferences').select('*').eq('user_id', input.userId).maybeSingle();
  const cat = category(input.eventKey);
  if (pref && pref[cat] === false) return { skipped: true, reason: 'user_disabled' };

  const vars = input.variables || {};
  const title = render(template.title, vars);
  const subtitle = render(template.subtitle, vars);
  const message = render(template.message, vars);
  let inApp = false;
  let pushSent = 0;

  if (template.in_app_enabled) {
    const { error } = await admin.from('notifications').insert({
      user_id: input.userId, type: 'INFO', title, subtitle, message,
      reference_type: input.referenceType || 'notification_event',
      reference_id: input.referenceId || null, is_read: false,
    });
    if (!error) inApp = true;
  }

  if (template.push_enabled) {
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
