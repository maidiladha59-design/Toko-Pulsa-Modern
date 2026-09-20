import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('v47 migration adds KTP + selfie KYC fields and admin notification flow',()=>{
  const s=read('supabase/migrations_v47_email_otp_kyc_face.sql');
  for(const x of ['selfie_path','kyc_method','admin_review_kyc','KYC Berhasil Diverifikasi','Reseller']) assert.match(s,new RegExp(x.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&'),'i'));
});

test('registration uses email OTP instead of email redirect link',()=>{
  const s=read('src/app/register/page.tsx');
  assert.match(s,/signInWithOtp/);
  assert.match(s,/shouldCreateUser:\s*true/);
  assert.doesNotMatch(s,/emailRedirectTo/);
});

test('verification page confirms OTP then sets password',()=>{
  const s=read('src/app/verify-email/page.tsx');
  assert.match(s,/verifyOtp/);
  assert.match(s,/type:\s*["']email["']/);
  assert.match(s,/updateUser\(\{password\}\)/);
});

test('KYC customer flow is staged: KTP saved first (stage 1), then face verification (stage 2)',()=>{
  const s=read('src/app/kyc/page.tsx');
  assert.match(s,/ktp/);
  assert.match(s,/selfie/);
  assert.match(s,/environment/);
  assert.match(s,/["']user["']/);
  assert.match(s,/KTP_SUBMITTED/);
  assert.match(s,/SUBMITTED/);
});

test('KYC staged migration adds KTP_SUBMITTED status for the two-step flow',()=>{
  const s=read('supabase/migrations_v69_kyc_staged_verification.sql');
  assert.match(s,/KTP_SUBMITTED/);
  assert.match(s,/kyc_verifications_status_check/);
});

test('admin KYC review sends authenticated RPC with review note',()=>{
  const s=read('src/app/api/admin/kyc/route.ts');
  assert.match(s,/rpc\('admin_review_kyc'/);
  assert.match(s,/p_review_note/);
});
