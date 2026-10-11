import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isGatewayMethod } from '@/lib/midtrans';
export async function GET(){
  const s=createClient(); const {data:{user}}=await s.auth.getUser();
  if(!user) return NextResponse.json({message:'Silakan login terlebih dahulu.'},{status:401});
  const {data,error}=await s.from('topup_payment_methods').select('provider_method,label,description,payment_type,sort_order').eq('is_active',true).order('sort_order');
  if(error) return NextResponse.json({message:error.message},{status:500});
  // Baris peninggalan gateway FR3 Newera (atm_bersama_va, artha_graha_va, cimb_niaga_va,
  // maybank_va, bnc_va, sampoerna_va) bisa saja masih is_active di database, tapi Midtrans
  // Core API hanya menerima QRIS + VA bca/bni/bri/permata. Whitelist kode jadi penjaga utama
  // supaya metode yang pasti gagal tidak pernah ditawarkan ke pelanggan.
  let methods=(data||[]).filter((m)=>isGatewayMethod(m.provider_method));
  // Channel yang dinonaktifkan admin di payment_channel_fees tidak ditawarkan.
  const admin=createAdminClient();
  const {data:fees,error:feeError}=await admin.from('payment_channel_fees').select('channel_code,is_active');
  if(!feeError&&fees){
    const feeState=new Map(fees.map((f)=>[f.channel_code,Boolean(f.is_active)]));
    methods=methods.filter((m)=>feeState.get(m.provider_method)!==false);
  }
  return NextResponse.json({methods});
}
