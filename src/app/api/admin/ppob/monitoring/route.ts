import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(){
  const supabase=createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({message:"Unauthorized"},{status:401});
  const {data:profile}=await supabase.from("profiles").select("role").eq("id",user.id).single();
  if(!profile||!['ADMIN','SUPER_ADMIN'].includes(profile.role))return NextResponse.json({message:"Forbidden"},{status:403});
  const {data,error}=await supabase.from("ppob_transactions").select("id,order_id,customer_no,status,provider_status,response_code,serial_number,provider_message,attempt_count,created_at,next_retry_at,orders(order_number),order_items(product_name)").order("created_at",{ascending:false}).limit(200);
  if(error)return NextResponse.json({message:"Gagal memuat monitoring."},{status:500});
  const transactions=(data||[]).map((x:any)=>({...x,order_number:x.orders?.order_number||"-",product_name:x.order_items?.product_name||"-"}));
  return NextResponse.json({transactions});
}
