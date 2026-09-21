#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'supabase');
const files = fs.readdirSync(dir).filter(f => /^migrations_v\d+.*\.sql$/i.test(f));
const byVersion = new Map();
for (const file of files) {
  const m = file.match(/^migrations_v(\d+)/i);
  const v = Number(m[1]);
  if (!byVersion.has(v)) byVersion.set(v, []);
  byVersion.get(v).push(file);
}
const required = [5,6,7,8,9,10,11,13,14,15,16,18,19,21,24,25,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,73];
const missing = required.filter(v => !byVersion.has(v));
const duplicateVersions = [...byVersion.entries()].filter(([, list]) => list.length > 1);
const errors = [];
const warnings = [];

if (missing.length) errors.push(`Missing required migration versions: ${missing.join(', ')}`);
if (duplicateVersions.length) warnings.push(`Multiple migration files share a version: ${duplicateVersions.map(([v,l]) => `v${v} (${l.join(', ')})`).join('; ')}`);

const checks = [
  ['v9', 'migrations_v9_ppob_engine.sql', ['ppob_services', 'ppob_transactions']],
  ['v10', 'migrations_v10_ppob_targets.sql', ['ppob_order_targets']],
  ['v13', 'migrations_v13_ppob_postpaid_flow.sql', ['ppob_inquiries']],
  ['v16', 'migrations_v16_notifications_monitoring.sql', ['notifications']],
  ['v18', 'migrations_v18_ppob_webhook_hardening.sql', ['ppob_webhook_events']],
  ['v21', 'migrations_v21_provider_health_sync.sql', ['ppob_provider_syncs']],
  ['v25', 'migrations_v25_ppob_atomic_claim.sql', ['claim_ppob_transaction']],
  ['v34', 'migrations_v34_pakasir_wallet_topup.sql', ['confirm_pakasir_topup', 'idempotency_key', 'provider_order_id']],
  ['v36', 'migrations_v36_platform_features.sql', ['topup_fee_settings', 'home_banners', 'product_favorites', 'referrals', 'missions', 'kyc_verifications', 'admin_adjust_wallet']],
  ['v37', 'migrations_v37_pricing_engine.sql', ['ppob_pricing_rules', 'provider_admin', 'provider_selling_price', 'calculate_ppob_fee']],
  ['v38', 'migrations_v38_financial_dashboard.sql', ['financial_ledger', 'record_financial_order', 'record_financial_topup']],
  ['v39', 'migrations_v39_transaction_security.sql', ['user_transaction_security', 'register_transaction_pin_failure', 'reset_transaction_pin_failures']],
  ['v41', 'migrations_v41_customer_support_ticketing.sql', ['support_tickets', 'support_ticket_messages', 'set_support_ticket_status']],
  ['v47', 'migrations_v47_email_otp_kyc_face.sql', ['selfie_path', 'admin_review_kyc', 'storage']],
  ['v48', 'migrations_v48_maintenance_mode.sql', ['maintenance_settings', 'allow_admin_bypass']],
  ['v49', 'migrations_v49_fraud_rate_limit.sql', ['security_rate_limits', 'security_risk_events', 'security_risk_profiles', 'consume_rate_limit', 'record_security_risk_event', 'admin_set_risk_status']],
  ['v50', 'migrations_v50_reconciliation_refund_operational.sql', ['request_customer_refund', 'process_customer_refund', 'payment_reconciliation', 'refunds']],
  ['v51', 'migrations_v51_support_ticketing_operational.sql', ['close_support_ticket', 'reopen_support_ticket', 'admin_update_support_ticket', 'support_tickets']],
  ['v52', 'migrations_v52_promo_loyalty_operational.sql', ['award_loyalty_points_internal', 'award_loyalty_for_completed_order', 'get_my_loyalty_summary']],
  ['v53', 'migrations_v53_admin_permission_audit_operational.sql', ['has_admin_permission', 'can_admin_permission', 'update_admin_permission', 'admin_role_permissions']],
  ['v54', 'migrations_v54_pwa_realtime_push.sql', ['push_subscriptions', 'replica identity full']],
  ['v55', 'migrations_v55_monitoring_provider_alerts.sql', ['provider_health_checks']],
  ['v73', 'migrations_v73_gateway_txn_id.sql', ['gateway_txn_id', 'provider_txn_id']],
];
for (const [label, file, needles] of checks) {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) { errors.push(`${label}: file not found (${file})`); continue; }
  const text = fs.readFileSync(p, 'utf8').toLowerCase();
  for (const needle of needles) if (!text.includes(needle.toLowerCase())) errors.push(`${label}: expected definition '${needle}' not found`);
}

const order = [...byVersion.keys()].sort((a,b)=>a-b);
const gaps = [];
for (let i=1;i<order.length;i++) if (order[i] - order[i-1] > 1) gaps.push(`v${order[i-1]} → v${order[i]}`);
if (gaps.length) warnings.push(`Version gaps are intentional only if documented: ${gaps.join(', ')}`);

const output = {
  generated_at: new Date().toISOString(),
  migration_directory: 'supabase/',
  discovered_versions: order,
  required_versions: required,
  missing_versions: missing,
  duplicate_versions: duplicateVersions.map(([v,list])=>({version:v,files:list})),
  errors,
  warnings,
};
console.log(JSON.stringify(output, null, 2));
if (errors.length) process.exit(1);
