import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/utils";
import { isValidQrToken } from "@/lib/transfer/qr";
import TransferForm from "./TransferForm";

export default async function TransferPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const qrRaw = typeof searchParams.qr === "string" ? searchParams.qr : "";
  const qrToken = isValidQrToken(qrRaw) ? qrRaw.trim().toLowerCase() : null;
  const amountRaw = typeof searchParams.amount === "string" ? searchParams.amount.replace(/\D/g, "") : "";
  const initialAmount = qrToken && /^\d{1,12}$/.test(amountRaw) && Number(amountRaw) > 0 ? Number(amountRaw) : null;

  if (!user) {
    const target = `/transfer-uang${qrToken ? `?qr=${qrToken}${initialAmount ? `&amount=${initialAmount}` : ""}` : ""}`;
    redirect(`/login?redirectTo=${encodeURIComponent(target)}`);
  }

  const { data: profile } = await supabase.from("profiles").select("account_type").eq("id", user.id).single();
  const isReseller = profile?.account_type === "RESELLER";

  let banks: any[] = [];
  if (isReseller) {
    const { data } = await supabase
      .from("bank_transfer_services")
      .select("id,name,provider,logo_url,description,admin_fee,is_active")
      .eq("is_active", true)
      .order("name");
    banks = data || [];
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-3xl bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-widest text-amber-300">Transfer</p>
        <h1 className="mt-2 text-2xl font-black">Transfer Saldo Sesama Pengguna</h1>
        <p className="mt-2 text-sm text-white/60">Kirim saldo ke pengguna AIDIL STORE lain lewat QR Pribadi, kontak favorit, atau pencarian akun.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/transfer-uang/qr" className="rounded-xl bg-gold-500 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-gold-400">📥 Terima Saldo (QR Saya)</Link>
          <Link href="/wallet" className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20">💰 Lihat Saldo</Link>
        </div>
      </div>

      <TransferForm initialQr={qrToken} initialAmount={initialAmount} />

      {isReseller ? (
        banks.length > 0 && (
          <div>
            <h2 className="text-base font-black text-slate-900">Transfer ke Rekening Bank</h2>
            <p className="mt-1 text-sm text-slate-500">Layanan transfer yang diaktifkan admin dan didukung provider payout.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {banks.map((x) => (
                <div key={x.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-3">
                    {x.logo_url ? <Image src={x.logo_url} alt="" width={44} height={44} className="h-11 w-11 rounded-xl object-contain" /> : <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100">🏦</div>}
                    <div><b>{x.name}</b><p className="text-xs text-slate-400">{x.provider || "Provider"}</p></div>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">{x.description || "Transfer bank."}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Biaya admin</span>
                    <b>{formatRupiah(x.admin_fee)}</b>
                  </div>
                  <Link href="/bantuan" className="mt-3 block rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-black text-white">Mulai / Hubungi CS</Link>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
          <p className="text-xs font-black uppercase tracking-widest text-amber-700">Verifikasi diperlukan</p>
          <h2 className="mt-2 text-xl font-black text-amber-950">Transfer ke Rekening Bank belum tersedia</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">Akun Pelanggan harus diverifikasi KYC oleh admin terlebih dahulu. Setelah disetujui, jenis akun berubah menjadi Reseller dan layanan transfer bank dapat digunakan. Transfer saldo sesama pengguna di atas sudah bisa dipakai tanpa KYC.</p>
          <Link href="/kyc" className="mt-4 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Verifikasi Akun</Link>
        </div>
      )}
    </div>
  );
}
