import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { billIdParamSchema } from "@/lib/splitbill/schemas";

// Detail tagihan patungan. RPC get_split_bill sudah memfilter akses:
// hanya pembuat, peserta, atau admin — orang luar mendapat BILL_NOT_FOUND
// sehingga keberadaan tagihan tidak bocor.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const parsedId = billIdParamSchema.safeParse(params.id);
  if (!parsedId.success) {
    return NextResponse.json({ message: "ID tagihan tidak valid." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("get_split_bill", { p_bill_id: parsedId.data });
  if (error || !data) {
    const msg = error?.message || "";
    if (msg.includes("UNAUTHENTICATED")) {
      return NextResponse.json({ message: "Sesi login tidak valid. Silakan login kembali." }, { status: 401 });
    }
    if (msg.includes("BILL_NOT_FOUND")) {
      return NextResponse.json({ message: "Tagihan tidak ditemukan." }, { status: 404 });
    }
    console.error("split-bill detail error:", error);
    return NextResponse.json({ message: "Gagal memuat detail tagihan." }, { status: 500 });
  }

  return NextResponse.json(data);
}
