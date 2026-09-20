import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
export async function GET(){
 const s=createClient(); const {data:{user}}=await s.auth.getUser(); if(!user)return NextResponse.json({message:'Silakan login terlebih dahulu.'},{status:401});
 const {data,error}=await s.from('topups').select('id,amount,admin_fee,payment_amount,status,provider_order_id,payment_method,payment_number,gateway_fee,gateway_total_payment,expires_at,created_at,updated_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);
 if(error)return NextResponse.json({message:error.message},{status:500});
 return NextResponse.json({topups:data||[]});
}
