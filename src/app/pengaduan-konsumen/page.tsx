import type { Metadata } from "next";
import Link from "next/link";
import { getBusinessIdentity } from "@/lib/business";

export const metadata: Metadata = {
  title: "Pengaduan Konsumen — AIDIL STORE",
  description:
    "Jalur resmi pengaduan konsumen AIDIL STORE untuk kasus seperti saldo terpotong namun pulsa/token tidak masuk.",
};

const steps = [
  {
    title: "1. Ajukan pengaduan",
    body: "Buat tiket kategori \"Pengaduan Konsumen\" di Pusat Bantuan. Sertakan ID Order, nominal, waktu transaksi, dan tangkapan layar bila ada.",
  },
  {
    title: "2. Verifikasi",
    body: "Tim kami memeriksa log transaksi, status dari provider/penyedia layanan, dan mutasi saldo terkait pengaduan Anda.",
  },
  {
    title: "3. Tanggapan awal",
    body: "Tanggapan awal diberikan paling lambat 1x24 jam pada hari kerja sejak tiket dibuat.",
  },
  {
    title: "4. Penyelesaian",
    body: "Jika terbukti gagal di sisi sistem kami, saldo dikembalikan atau transaksi diproses ulang. Jika sudah berhasil diproses oleh provider, hasil pemeriksaan akan dijelaskan beserta buktinya.",
  },
];

export default function PengaduanKonsumenPage() {
  const biz = getBusinessIdentity();
  return (
    <div className="mx-auto max-w-3xl animate-page-in space-y-5">
      <article className="rounded-3xl border bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-gold-600">AIDIL STORE</p>
        <h1 className="mt-2 text-3xl font-black">Pengaduan Konsumen</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Halaman ini adalah jalur pengaduan konsumen formal — berbeda dari Pusat Bantuan biasa —
          khusus untuk keluhan transaksional serius, misalnya <b>saldo terpotong tetapi pulsa, token,
          atau produk digital tidak diterima</b>, kesalahan penagihan, atau dugaan penyalahgunaan akun.
          Disediakan sesuai kewajiban pelaku usaha PMSE untuk menyediakan layanan pengaduan konsumen
          berdasarkan Peraturan Menteri Perdagangan No. 50 Tahun 2020 dan UU Perlindungan Konsumen.
        </p>

        <h2 className="mt-6 text-xl font-black">Proses penanganan</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {steps.map((s) => (
            <div key={s.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-800">{s.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-6 text-xl font-black">Jika belum ada penyelesaian</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Jika pengaduan tidak mendapat tanggapan yang memadai melalui tiket, konsumen berhak
          melanjutkan pengaduan ke Kementerian Perdagangan (SIAPIK Kemendag), Kementerian Komunikasi dan
          Digital (Kominfo), atau lembaga penyelesaian sengketa konsumen (BPSK) sesuai domisili konsumen.
        </p>

        <h2 className="mt-6 text-xl font-black">Kontak resmi pelaku usaha</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {biz.legalName}
          {biz.email ? ` · ${biz.email}` : ""}
          {biz.phone ? ` · ${biz.phone}` : ""}. Lihat detail lengkap di{" "}
          <Link href="/identitas-usaha" className="font-bold text-gold-700 underline">
            halaman Identitas Usaha
          </Link>
          .
        </p>

        <Link
          href="/bantuan?kategori=PENGADUAN"
          className="mt-6 inline-flex rounded-xl bg-rose-600 px-5 py-3 text-sm font-black text-white"
        >
          ⚠️ Ajukan Pengaduan Sekarang
        </Link>
      </article>
    </div>
  );
}
