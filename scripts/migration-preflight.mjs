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
const required = [5,6,7,8,9,10,11,13,14,15,16,18,19,21,24,25,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,73,75,76,77,78,79,80,81,82,83,85,86,87,88,89,90,93,94,97,98];
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
  ['v75', 'migrations_v75_wallet_transfer_qr.sql', ['transfer_settings', 'wallet_transfers', 'transfer_contacts', 'user_qr_tokens', 'create_wallet_transfer', 'resolve_qr_token', 'transfer.sent']],
  ['v76', 'migrations_v76_split_bill.sql', ['payment_requests', 'split_bills', 'split_bill_participants', 'create_split_bill', 'pay_split_bill_share', 'send_split_bill_reminder', 'splitbill.paid', 'splitbill.completed']],
  ['v77', 'migrations_v77_brand_media.sql', ['brand_media', 'brand_media_select_all', 'brand_media_admin_write', 'is_admin()']],
  ['v78', 'migrations_v78_theme_preference.sql', ['user_app_settings', 'theme_preference', 'user_app_settings_theme_preference_check']],
  ['v79', 'migrations_v79_support_order_id_required.sql', ['create_support_ticket', 'order_required', 'invalid_order_id', 'invalid_text_representation', 'order_not_found_or_forbidden']],
  ['v80', 'migrations_v80_topup_fee_tiers.sql', ['topup_fee_tiers', 'min_amount', 'max_amount', 'fee_amount', 'topup_fee_tier_overlap', 'topup_fee_tiers_admin_write', '9999', '81']],
  ['v81', 'migrations_v81_faq_gateway_wording.sql', ['faqs', 'gateway terverifikasi', 'pembayaran terverifikasi']],
  ['v82', 'migrations_v82_banner_title_cleanup.sql', ['home_banners', 'file_', 'randomuuid', 'btrim']],
  ['v83', 'migrations_v83_midtrans_gateway.sql', ['confirm_gateway_topup', 'midtrans', 'bca_va', 'create_gateway_order', 'topup_payment_methods', 'cimb_niaga_va', 'sampoerna_va']],
  ['v85', 'migrations_v85_payment_channel_fees.sql', ['payment_channel_fees', 'channel_code', 'gateway_fee_tax_percent', 'margin_type', 'fee_snapshot', 'payment_channel_fees_admin_write', 'is_admin()', 'on conflict(channel_code) do nothing', 'topups', 'customer_note']],
  ['v86', 'migrations_v86_cleanup_legacy_va_methods.sql', ['topup_payment_methods', 'atm_bersama_va', 'artha_graha_va', 'cimb_niaga_va', 'maybank_va', 'bnc_va', 'sampoerna_va', 'on conflict(provider_method) do nothing', 'is_active = false', 'bca_va', 'permata_va']],
  ['v87', 'migrations_v87_ppob_sync_details.sql', ['ppob_provider_syncs', 'processed_count', 'details jsonb']],
  ['v88', 'migrations_v88_admin_user_controls.sql', ['account_status', 'blocked_at', 'blocked_reason', 'admin_adjust_user_balance', 'admin_set_user_status', 'assert_account_active', 'ACCOUNT_BLOCKED', 'wallet.admin_adjust', 'user.admin_status', 'is_admin_or_staff', "'ADJUSTMENT'"]],
  ['v89', 'migrations_v89_business_profile.sql', ['business_profile', 'business_name', 'owner_name', 'business_address', 'pse_status', 'pse_registration_number', 'show_legal_document_publicly', 'business-assets', 'business_profile_public_read', 'admin_update_business_profile', 'business_profile.update', 'is_admin_or_staff()']],
  ['v90', 'migrations_v90_app_ratings.sql', ['app_ratings', 'transaction_count_at_rating', 'is_published', 'rating_prompted_at', 'app_ratings_user_unique', 'app_ratings_select_own', 'app_ratings_insert_own', 'get_my_transaction_count', 'should_prompt_rating', 'submit_app_rating', 'mark_rating_prompted', 'get_rating_summary', 'get_published_ratings', 'admin_set_rating_published', 'rating.submit', 'rating.moderate', "status = 'completed'"]],
  ['v93', 'migrations_v93_manual_topup.sql', ['manual_topup_channels', 'manual_topup_requests', 'manual_topup_settings', 'channel_type', 'proof_image_url', 'manual_topup_proofs_insert_own', 'manual-topup-proofs', 'qris-images', 'submit_manual_topup_request', 'admin_process_manual_topup', 'manual_topup.approve', 'manual_topup.reject', 'manual_topup_request', "'TOPUP'", 'for update']],
  ['v94', 'migrations_v94_community_chat.sql', ['community_chat_messages', 'chat_user_status', 'is_deleted', 'deleted_reason', 'char_length(btrim(message)) between 1 and 1000', 'community_chat_messages_select_authenticated', 'supabase_realtime', 'community_chat_display_names', 'post_community_chat_message', 'CHAT_MUTED', 'CHAT_RATE_LIMIT', 'interval \'2 seconds\'', 'admin_delete_chat_message', 'chat.message_deleted', 'realtime.send', 'admin_set_chat_mute', 'chat.user_muted', 'chat.user_unmuted', 'REASON_REQUIRED', 'assert_account_active', 'for update']],
  ['v97', 'migrations_v97_profile_avatars.sql', ['avatars', 'avatar_id', 'user_set_avatar', 'avatars_select_active', 'AVATAR_NOT_AVAILABLE', 'protect_default_avatar', 'DEFAULT_AVATAR_PROTECTED', 'on delete set null']],
  ['v98', 'migrations_v98_info_ticker.sql', ['site_settings', 'site_settings_key_format', 'site_settings_value_object', 'site_settings_public_read', 'site_settings_info_ticker_bounds', 'info_ticker', 'site_announcements', 'on conflict (key) do nothing']],
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
