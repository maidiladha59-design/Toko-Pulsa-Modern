import webpush from "web-push";

let configured = false;

function configure() {
  if (configured) return;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    throw new Error("VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY, dan VAPID_PRIVATE_KEY wajib diatur.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export async function sendWebPush(subscription: { endpoint: string; p256dh: string; auth: string }, payload: object) {
  configure();
  return webpush.sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  }, JSON.stringify(payload), { TTL: 3600 });
}
