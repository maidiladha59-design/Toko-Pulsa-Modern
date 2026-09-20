import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
export async function GET(){
  const s=createClient(); const {data:{user}}=await s.auth.getUser();
  if(!user) return NextResponse.json({message:'Silakan login terlebih dahulu.'},{status:401});
  const {data,error}=await s.from('topup_payment_methods').select('provider_method,label,description,payment_type,sort_order').eq('is_active',true).order('sort_order');
  if(error) return NextResponse.json({message:error.message},{status:500});
  return NextResponse.json({methods:data||[]});
}
