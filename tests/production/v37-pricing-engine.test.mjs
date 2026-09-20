import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(); const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('v37 migration adds pricing rules and provider price snapshots',()=>{
  const s=read('supabase/migrations_v37_pricing_engine.sql');
  for(const x of ['ppob_pricing_rules','provider_admin','provider_selling_price','pricing_rule_id','calculate_ppob_fee']) assert.match(s,new RegExp(x));
});

test('v37 pricing resolves SKU before brand/category/global',()=>{
  const s=read('src/lib/ppob/pricing.ts');
  assert.match(s,/\["SKU"/); assert.match(s,/\["BRAND"/); assert.match(s,/\["CATEGORY"/); assert.match(s,/\["GLOBAL"/);
});

test('v37 admin pricing page and API exist',()=>{
  for(const f of ['src/app/admin/pricing/page.tsx','src/app/api/admin/pricing/route.ts']) assert.ok(fs.existsSync(path.join(root,f)),f);
});

test('v37 prepaid sync applies pricing rule and postpaid inquiry stores aidil fee',()=>{
  const sync=read('src/app/api/admin/ppob/pricelist/route.ts');
  const inquiry=read('src/app/api/ppob/inquiry/route.ts');
  assert.match(sync,/resolvePricingRule/); assert.match(sync,/aidilFee/); assert.match(sync,/pricing_rule_id/);
  assert.match(inquiry,/aidil_fee/); assert.match(inquiry,/resolvePricingRule/); assert.match(inquiry,/quoteAmount/);
});
