import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPakasirTransactionDetail, isPakasirConfigured } from '@/lib/pakasir';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const checked: Array<{ type: string; id: string; state?: string }> = [];
  const errors: Array<{ type: string; id: string; message: string }> = [];

  // Check recent Pakasir topups even when the internal status is stale. This catches
  // a successful payment whose webhook was delayed or missed.
  const { data: topups } = await admin.from('topups').select('id,status,amount,payment_amount,provider,provider_order_id,provider_txn_id,payment_method,expires_at,created_at').eq('provider','pakasir').not('provider_order_id','is',null).order('created_at',{ascending:false}).limit(150);
  for (const t of topups || []) {
    try {
      if (["PENDING","VERIFYING"].includes(t.status) && t.expires_at && new Date(t.expires_at).getTime() <= Date.now()) {
        await admin.from("topups").update({ status: "EXPIRED", updated_at: new Date().toISOString() }).eq("id", t.id).in("status", ["PENDING","VERIFYING"]);
      }
      // API v2: status dicek lewat txn_id Pakasir, bukan order_id. Top Up tanpa txn_id (gagal saat create) dilewati.
      const provider = isPakasirConfigured() && t.provider_txn_id ? await getPakasirTransactionDetail(t.provider_txn_id) : null;
      const { data: internal } = await admin.rpc('reconcile_internal_financial_record',{p_source_type:'TOPUP',p_source_id:t.id});
      if (provider) {
        let state = internal?.state || 'REVIEW';
        let discrepancy = internal?.discrepancy || null;
        const internalAmount = Number(t.payment_amount || t.amount);
        const providerAmount = Number(provider.amount);
        if (providerAmount !== internalAmount) { state='MISMATCH'; discrepancy='Nominal Pakasir berbeda dengan nominal internal.'; }
        else if (provider.status === 'completed' && t.status !== 'APPROVED') { state='MISMATCH'; discrepancy='Pakasir completed tetapi Top Up belum APPROVED; webhook mungkin terlewat.'; }
        await admin.from('payment_reconciliation').upsert({source_type:'TOPUP',source_id:t.id,provider:'pakasir',internal_status:t.status,provider_status:provider.status,internal_amount:internalAmount,provider_amount:providerAmount,wallet_amount:internal?.wallet_amount ?? null,state,discrepancy,checked_at:new Date().toISOString(),metadata:{runner:'v50-cron',payment_method:t.payment_method}}, {onConflict:'source_type,source_id'});
        checked.push({type:'TOPUP',id:t.id,state});
      } else { checked.push({type:'TOPUP',id:t.id,state:internal?.state}); }
    } catch (e:any) { errors.push({type:'TOPUP',id:t.id,message:String(e?.message || e)}); }
  }

  // Internal checks for orders and PPOB are provider-independent and therefore safe
  // to run on every schedule tick.
  const { data: orders } = await admin.from('orders').select('id,order_number,status,total_amount,payment_method,gateway_method,gateway_txn_id').order('created_at',{ascending:false}).limit(150);
  for (const o of orders || []) {
    try {
      const {data}=await admin.rpc('reconcile_internal_financial_record',{p_source_type:'ORDER',p_source_id:o.id});
      let state = data?.state;
      // Order QRIS/VA yang masih menggantung: cross-check ke Pakasir memakai gateway_txn_id.
      if (isPakasirConfigured() && o.gateway_txn_id && ['QRIS','BANK_VA'].includes(o.payment_method) && ['PENDING','PROCESSING'].includes(o.status)) {
        const provider = await getPakasirTransactionDetail(o.gateway_txn_id);
        let discrepancy = data?.discrepancy || null;
        state = data?.state || 'REVIEW';
        if (Number(provider.amount) !== Number(o.total_amount)) { state='MISMATCH'; discrepancy='Nominal Pakasir berbeda dengan nominal order.'; }
        else if (provider.status === 'completed' && o.status === 'PENDING') { state='MISMATCH'; discrepancy='Pakasir completed tetapi order masih PENDING; webhook mungkin terlewat.'; }
        await admin.from('payment_reconciliation').upsert({source_type:'ORDER',source_id:o.id,provider:'pakasir',internal_status:o.status,provider_status:provider.status,internal_amount:Number(o.total_amount),provider_amount:Number(provider.amount),wallet_amount:data?.wallet_amount ?? null,state,discrepancy,checked_at:new Date().toISOString(),metadata:{runner:'v73-cron',order_number:o.order_number,gateway_method:o.gateway_method}}, {onConflict:'source_type,source_id'});
      }
      checked.push({type:'ORDER',id:o.id,state});
    }
    catch(e:any){ errors.push({type:'ORDER',id:o.id,message:String(e?.message||e)}); }
  }
  const { data: ppob } = await admin.from('ppob_transactions').select('id').order('created_at',{ascending:false}).limit(200);
  for (const p of ppob || []) {
    try { const {data}=await admin.rpc('reconcile_internal_financial_record',{p_source_type:'PPOB',p_source_id:p.id}); checked.push({type:'PPOB',id:p.id,state:data?.state}); }
    catch(e:any){ errors.push({type:'PPOB',id:p.id,message:String(e?.message||e)}); }
  }
  return NextResponse.json({ok:true,checked_count:checked.length,error_count:errors.length,errors,at:new Date().toISOString()});
}
