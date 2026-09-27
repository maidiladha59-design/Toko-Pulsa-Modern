import Link from "next/link";
import { isFeatureEnabled } from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function ScanQrisLayout({ children }: { children: React.ReactNode }) {
  if (!(await isFeatureEnabled("scan_qris"))) {
    return (
      <div className="mx-auto max-w-md rounded-3xl bg-zinc-950 p-8 text-center text-white shadow-xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gold-400 text-3xl text-black">▣</div>
        <h1 className="text-xl font-black text-gold-400">Scan QRIS sedang nonaktif</h1>
        <p className="mt-2 text-sm text-white/70">Fitur ini sementara tidak tersedia. Silakan coba lagi nanti atau gunakan layanan lainnya.</p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-gold-400 px-5 py-3 text-sm font-black text-black">Kembali ke Beranda</Link>
      </div>
    );
  }
  return <>{children}</>;
}