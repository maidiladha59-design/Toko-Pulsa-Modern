import HomeCalculator from "@/components/HomeCalculator";

export default function CalculatorPage() {
  return <div className="mx-auto max-w-2xl animate-page-in"><div className="mb-6"><p className="section-kicker">Alat Praktis</p><h1 className="mt-1 text-3xl font-black text-slate-950">Kalkulator</h1><p className="mt-2 text-sm leading-6 text-slate-500">Gunakan kalkulator untuk menghitung nominal transaksi dan kebutuhan lainnya.</p></div><HomeCalculator /></div>;
}
