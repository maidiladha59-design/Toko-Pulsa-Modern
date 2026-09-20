import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function auth(required='monitoring.view', allowCron=false, request?: Request) {
  const cron=Boolean(allowCron && process.env.CRON_SECRET && request?.headers.get('authorization')===`Bearer ${process.env.CRON_SECRET}`);
  const s=createClient(); const {data:{user}}=await s.auth.getUser();
  if(cron) return {admin:createAdminClient(), cron:true};
  if(!user) return {error:NextResponse.json({message:'Unauthorized'},{status:401})};
  const {data:p}=await s.from('profiles').select('role').eq('id',user.id).single();
  if(!p||!['ADMIN','SUPER_ADMIN'].includes(p.role)) return {error:NextResponse.json({message:'Forbidden'},{status:403})};
  const {data:allowed}=await s.rpc('has_admin_permission',{p_permission:required});
  if(required && allowed!==true && p.role!=='SUPER_ADMIN') return {error:NextResponse.json({message:'Permission denied'},{status:403})};
  return {user,admin:createAdminClient()};
}

export async function GET(){
  const a=await auth(); if(a.error)return a.error; const admin=a.admin!;
  const [alerts,runs,providerHealth]=await Promise.all([
    admin.from('monitoring_alerts').select('*').order('last_seen_at',{ascending:false}).limit(200),
    admin.from('monitoring_runs').select('*').order('started_at',{ascending:false}).limit(20),
    admin.from('provider_health_checks').select('*').order('checked_at',{ascending:false}).limit(20)
  ]);
  if(alerts.error||runs.error||providerHealth.error)return NextResponse.json({message:'Migration v55 belum diterapkan.'},{status:503});
  const open=(alerts.data||[]).filter(x=>x.status!=='RESOLVED');
  return NextResponse.json({alerts:alerts.data||[],runs:runs.data||[],providerHealth:providerHealth.data||[],summary:{open:open.length,critical:open.filter(x=>x.severity==='CRITICAL').length,warning:open.filter(x=>x.severity==='WARNING').length}});
}

export async function POST(request:Request){
  const a=await auth('monitoring.manage',true,request); if(a.error)return a.error; const admin=a.admin!;
  const run=await admin.from('monitoring_runs').insert({status:'RUNNING'}).select('id').single();
  if(run.error)return NextResponse.json({message:run.error.message},{status:500});
  const checks:{name:string,count:number,alerted:number}[]=[]; let opened=0;
  try{
    const now=Date.now();
    const staleCut=new Date(now-10*60*1000).toISOString();
    const oldProcessing=new Date(now-15*60*1000).toISOString();
    const [recon,refunds,webhooks,processing,syncs]=await Promise.all([
      admin.from('payment_reconciliation').select('id').neq('state','MATCHED').limit(1000),
      admin.from('refunds').select('id,status').in('status',['PENDING','PROCESSING','FAILED']).limit(1000),
      admin.from('ppob_webhook_events').select('id,status').eq('status','ERROR').gte('received_at',staleCut).limit(1000),
      admin.from('ppob_transactions').select('id').in('status',['WAITING','PROCESSING']).lt('updated_at',oldProcessing).limit(1000),
      admin.from('ppob_provider_syncs').select('id,status,finished_at').order('started_at',{ascending:false}).limit(1)
    ]);
    const issues=[
      {name:'reconciliation',count:recon.data?.length||0,severity:'WARNING',category:'RECONCILIATION',title:'Rekonsiliasi membutuhkan review',message:'Ada transaksi payment reconciliation yang belum MATCHED.',fp:'reconciliation:unmatched'},
      {name:'refunds',count:refunds.data?.length||0,severity:'WARNING',category:'REFUND',title:'Refund masih tertunda',message:'Ada refund PENDING/PROCESSING/FAILED yang perlu dipantau.',fp:'refunds:pending'},
      {name:'webhooks',count:webhooks.data?.length||0,severity:'CRITICAL',category:'WEBHOOK',title:'Webhook PPOB mengalami error',message:'Terdapat event webhook PPOB berstatus ERROR dalam 10 menit terakhir.',fp:'webhooks:error:10m'},
      {name:'processing',count:processing.data?.length||0,severity:'WARNING',category:'PPOB',title:'Transaksi PPOB terlalu lama diproses',message:'Ada transaksi WAITING/PROCESSING yang tidak berubah selama lebih dari 15 menit.',fp:'ppob:stale:15m'}
    ];
    for(const i of issues){checks.push({name:i.name,count:i.count,alerted:i.count>0?1:0}); if(i.count>0){const {error}=await admin.rpc('upsert_monitoring_alert',{p_fingerprint:i.fp,p_severity:i.severity,p_category:i.category,p_title:i.title,p_message:`${i.message} Jumlah terdeteksi: ${i.count}.`,p_source:'v44-monitoring'}); if(!error)opened++;}}
    const lastSync=syncs.data?.[0]; if(lastSync?.status==='FAILED'){await admin.rpc('upsert_monitoring_alert',{p_fingerprint:'provider:sync:failed',p_severity:'WARNING',p_category:'PROVIDER',p_title:'Sinkronisasi provider gagal',p_message:'Sinkronisasi pricelist provider terakhir berstatus FAILED.',p_source:'v44-monitoring'});opened++;checks.push({name:'provider_sync',count:1,alerted:1});}else checks.push({name:'provider_sync',count:0,alerted:0});
    await admin.from('monitoring_runs').update({status:'SUCCESS',finished_at:new Date().toISOString(),checks:checks.length,alerts_opened:opened,metadata:{checks}}).eq('id',run.data.id);
    return NextResponse.json({ok:true,run_id:run.data.id,checks,alerts_opened:opened});
  }catch(e:any){await admin.from('monitoring_runs').update({status:'FAILED',finished_at:new Date().toISOString(),error_message:String(e?.message||e)}).eq('id',run.data.id);return NextResponse.json({message:'Monitoring gagal dijalankan.'},{status:500});}
}
