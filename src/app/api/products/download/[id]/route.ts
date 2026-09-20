import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Menghasilkan signed URL sementara untuk file produk digital.
// Hanya diberikan jika user memiliki order COMPLETED untuk produk ini.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const { data: entitlement } = await supabase
    .from("order_items")
    .select("id, orders!inner(user_id, status)")
    .eq("product_id", params.id)
    .eq("orders.user_id", user.id)
    .eq("orders.status", "COMPLETED")
    .limit(1)
    .maybeSingle();

  if (!entitlement) {
    return NextResponse.json({ message: "Anda tidak memiliki akses untuk mengunduh produk ini." }, { status: 403 });
  }

  const { data: product } = await supabase.from("products").select("digital_file_path").eq("id", params.id).single();
  if (!product?.digital_file_path) {
    return NextResponse.json({ message: "File produk belum tersedia." }, { status: 404 });
  }

  // Gunakan service-role hanya setelah entitlement diverifikasi agar bucket tetap private.
  const storageClient = createAdminClient();
  const { data: signed, error } = await storageClient.storage
    .from("digital-products")
    .createSignedUrl(product.digital_file_path, 60 * 5); // 5 menit

  if (error || !signed) {
    return NextResponse.json({ message: "Gagal membuat link unduhan. Silakan coba lagi." }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
