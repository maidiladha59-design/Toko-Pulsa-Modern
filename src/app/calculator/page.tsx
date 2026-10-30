import HomeCalculator from "@/components/HomeCalculator";

export default function CalculatorPage() {
  return <div className="mx-auto max-w-2xl animate-page-in"><div className="mb-6"><p className="section-kicker">Alat Praktis</p><h1 className="mt-1 text-3xl font-black text-app-text">Kalkulator</h1><p className="mt-2 text-sm leading-6 text-app-muted">Gunakan kalkulator untuk menghitung nominal transaksi dan kebutuhan lainnya.</p></div><HomeCalculator /></div>;
}
