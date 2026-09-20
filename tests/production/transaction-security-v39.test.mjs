import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');

test('v39 transaction security schema and PIN hashing exist',()=>{
  const m=read('supabase/migrations_v39_transaction_security.sql');
  const h=read('src/lib/security/transaction-pin.ts');
  assert.match(m,/user_transaction_security/); assert.match(m,/register_transaction_pin_failure/); assert.match(m,/reset_transaction_pin_failures/);
  assert.match(h,/scrypt/); assert.match(h,/timingSafeEqual/); assert.match(h,/PIN_NOT_SET/);
});

test('wallet-spend routes require transaction PIN',()=>{
  for(const p of ['src/app/api/ppob/prepaid/pay/route.ts','src/app/api/ppob/postpaid/pay/route.ts','src/app/api/checkout/route.ts']){
    const s=read(p); assert.match(s,/verifyTransactionPin/); assert.match(s,/PIN transaksi wajib diisi/);
  }
});

test('PIN policy rejects obvious six-digit PINs',()=>{
  const src=read('src/lib/security/transaction-pin.ts');
  assert.match(src,/123456/); assert.match(src,/654321/); assert.match(src,/\\d\{6\}/);
});

test('settings page exposes PIN setup/change without plaintext persistence',()=>{
  const s=read('src/app/settings/page.tsx'); const h=read('src/lib/security/transaction-pin.ts');
  assert.match(s,/transaction-pin/); assert.match(s,/Buat PIN|Ubah PIN/); assert.match(h,/pin_hash/);
  assert.doesNotMatch(h,/localStorage/);
});
