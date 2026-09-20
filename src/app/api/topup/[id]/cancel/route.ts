import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
export async function POST(_:Request,{params}:{params:{id:string}}){
 const s=createClient(); const {data:{user}}=await s.auth.getUser(); if(!user)return NextResponse.json({message:'Silakan login terlebih dahulu.'},{status:401});
 const {data,error}=await s.rpc('cancel_own_topup',{p_topup_id:params.id});
 if(error)return NextResponse.json({message:error.message.includes('TOPUP_NOT_CANCELLABLE')?'Top Up ini sudah tidak bisa dibatalkan.':error.message.includes('TOPUP_NOT_FOUND')?'Top Up tidak ditemukan.':'Gagal membatalkan Top Up.'},{status:400});
 return NextResponse.json({topup:data});
}
