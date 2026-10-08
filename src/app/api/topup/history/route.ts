import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGatewayTransactionDetail, isGatewayConfigured, GATEWAY_PROVIDER } from '@/lib/midtrans';

const ACTIVE_STATUSES = ['PENDING','VERIFYING'];

export async function GET(){
 const s=createClient(); const {data:{user}}=await s.auth.getUser();
 if(!user)return NextResponse.json({message:'Silakan login terlebih dahulu.'},{status:401});

 // Cadangan bila webhook telat/gagal: cek langsung ke Midtrans lalu konfirmasi otomatis.
 if(isGatewayConfigured()){
  const admin=createAdminClient();
  const {data:pending}=await admin.from('topups')
   .select('id,amount,payment_amount,payment_method,provider_txn_id')
   .eq('user_id',user.id).eq('provider',GATEWAY_PROVIDER)
   .in('status',ACTIVE_STATUSES).not('provider_txn_id','is',null).limit(5);
  for(const t of pending||[]){
   try{
    const d=await getGatewayTransactionDetail(t.provider_txn_id!);
    if(d.status==='completed'&&Number(d.amount)===Number(t.payment_amount||t.amount)){
     const {error}=await admin.rpc('confirm_gateway_topup',{p_topup_id:t.id,p_payment_method:t.payment_method||'qris',p_completed_at:d.completed_at||new Date().toISOString()});
     if(error)console.error('SYNC CONFIRM ERROR:',error);
    }else console.log('SYNC belum lunas:',JSON.stringify(d),'expected',t.payment_amount||t.amount);
   }catch(e){console.error('SYNC CHECK ERROR:',e)}
  }
 }

 const {data,error}=await s.from('topups').select('id,amount,admin_fee,payment_amount,status,provider_order_id,payment_method,payment_number,gateway_fee,gateway_total_payment,expires_at,created_at,updated_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);
 if(error)return NextResponse.json({message:error.message},{status:500});
 // payment_number bisa berisi gambar QR (data URL base64) yang besar — hanya
 // dikirim untuk Top Up yang masih menunggu pembayaran.
 const topups=(data||[]).map((t:any)=>ACTIVE_STATUSES.includes(String(t.status))?t:{...t,payment_number:null});
 return NextResponse.json({topups});
}