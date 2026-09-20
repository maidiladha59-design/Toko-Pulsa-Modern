import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fulfillPpobOrder } from "@/lib/ppob/fulfill";
export async function POST(_: Request,{params}:{params:{id:string}}){
 const supabase=createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)return NextResponse.json({message:'Unauthorized'},{status:401});
 const {data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).single(); if(!profile||!['ADMIN','SUPER_ADMIN'].includes(profile.role))return NextResponse.json({message:'Forbidden'},{status:403});
 const admin=createAdminClient(); const {data:tx}=await admin.from('ppob_transactions').select('id,order_id,status,next_retry_at,attempt_count').eq('id',params.id).maybeSingle(); if(!tx)return NextResponse.json({message:'Transaksi tidak ditemukan.'},{status:404});
 if(tx.status !== 'PROCESSING')return NextResponse.json({message:'Transaksi tidak berada pada status yang dapat dicoba ulang.'},{status:400});
 if (tx.next_retry_at && new Date(tx.next_retry_at).getTime() > Date.now()) return NextResponse.json({message:'Cooldown retry belum selesai.'},{status:429});
 if (Number(tx.attempt_count || 0) >= 3) return NextResponse.json({message:'Batas retry transaksi sudah tercapai.'},{status:429});
 await fulfillPpobOrder(tx.order_id); return NextResponse.json({ok:true,order_id:tx.order_id});
}
