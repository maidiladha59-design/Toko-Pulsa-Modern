import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAX_ATTEMPTS = 5;

export function validateTransactionPin(pin: unknown) {
  return typeof pin === 'string' && /^\d{6}$/.test(pin) && !(
    /^([0-9])\1{5}$/.test(pin) ||
    pin === '123456' || pin === '654321'
  );
}

function hashPin(pin: string, salt = crypto.randomBytes(16)) {
  const derived = crypto.scryptSync(pin, salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

function verifyHash(pin: string, encoded: string) {
  const [kind, n, r, p, saltB64, keyB64] = encoded.split('$');
  if (kind !== 'scrypt') return false;
  const salt = Buffer.from(saltB64 || '', 'base64url');
  const expected = Buffer.from(keyB64 || '', 'base64url');
  if (!salt.length || expected.length !== KEYLEN) return false;
  const actual = crypto.scryptSync(pin, salt, KEYLEN, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(Buffer.from(actual), expected);
}

export function hashTransactionPin(pin: string) {
  if (!validateTransactionPin(pin)) throw new Error('INVALID_PIN');
  return hashPin(pin);
}

export async function verifyTransactionPin(userId: string, pin: string) {
  const admin = createAdminClient();
  const { data: security } = await admin.from('user_transaction_security')
    .select('pin_hash,pin_failed_attempts,pin_locked_until')
    .eq('user_id', userId).maybeSingle();
  if (!security?.pin_hash) throw new Error('PIN_NOT_SET');
  if (security.pin_locked_until && new Date(security.pin_locked_until).getTime() > Date.now()) throw new Error('PIN_LOCKED');
  if (!validateTransactionPin(pin)) {
    await admin.rpc('register_transaction_pin_failure', { p_user_id: userId });
    await admin.rpc('record_security_risk_event', { p_user_id: userId, p_event_type: 'PIN_FAILED', p_risk_points: 10, p_reason: 'Format atau nilai PIN transaksi tidak valid.', p_metadata: { source: 'transaction-pin' } });
    throw new Error('INVALID_PIN');
  }
  let ok = false;
  try { ok = verifyHash(pin, security.pin_hash); } catch { ok = false; }
  if (!ok) {
    await admin.rpc('register_transaction_pin_failure', { p_user_id: userId });
    await admin.rpc('record_security_risk_event', { p_user_id: userId, p_event_type: 'PIN_FAILED', p_risk_points: 10, p_reason: 'Percobaan PIN transaksi gagal.', p_metadata: { source: 'transaction-pin' } });
    throw new Error('INVALID_PIN');
  }
  await admin.rpc('reset_transaction_pin_failures', { p_user_id: userId });
  return true;
}
